// Acciones del dueño sobre una reserva. Cada una corre en UNA transacción con RLS (comoAdmin):
// 1. bloquea la fila de la reserva (FOR UPDATE), filtrada por las propiedades del admin;
// 2. vuelve a validar con el estado de la base (lib/estados-reserva.ts), no con el del navegador;
// 3. aplica el cambio y escribe la auditoría (quién, cuándo, qué).
// Sin imports de Next: las Server Actions de app/admin las envuelven; los tests las llaman directo.

import { codigoPostgres, TRASLAPE_RESERVA } from "@/lib/errores-db";
import {
  marcarPagoRevisado,
  NOMBRE_MEDIO,
  tieneRevisarPago,
  validarMotivo,
  validarPagoSaldo,
  validarTransicion,
  type EstadoReserva,
  type MedioPagoSaldo,
  type Resultado,
} from "@/lib/estados-reserva";
import { formatearCLP, formatearFechaLarga } from "@/lib/formato";
import { comoAdmin, idsPropiedades, type AdminSesion, type TxPanel } from "@/lib/panel-acceso";

/** Error con mensaje para el dueño: corta la transacción (rollback) y se muestra tal cual. */
class ErrorAccion extends Error {}

type FilaReserva = {
  id: string;
  estado: EstadoReserva;
  total: number;
  notas: string | null;
  cabana_id: string;
  check_in: Date;
  check_out: Date;
};

/** Lee y bloquea la reserva, solo si es de una propiedad del admin (además RLS la filtra). */
async function bloquearReserva(tx: TxPanel, admin: AdminSesion, codigo: string): Promise<FilaReserva> {
  const ids = idsPropiedades(admin);
  const filas = await tx.$queryRaw<FilaReserva[]>`
    select r.id, r.estado::text as estado, r.total, r.notas, r.cabana_id, r.check_in, r.check_out
    from reserva r join cabana c on c.id = r.cabana_id
    where r.codigo = ${codigo} and c.propiedad_id = any(${ids}::uuid[])
    for update of r`;
  if (filas.length === 0) throw new ErrorAccion("No encontramos esa reserva en tus propiedades.");
  return filas[0];
}

function auditar(
  tx: TxPanel,
  admin: AdminSesion,
  datos: { reservaId: string; accion: "confirmar" | "cancelar" | "registrar_pago" | "marcar_revisado"; antes: EstadoReserva; despues: EstadoReserva; detalle?: string },
) {
  return tx.auditoria.create({
    data: {
      reservaId: datos.reservaId,
      usuarioId: admin.usuarioId,
      email: admin.email,
      accion: datos.accion,
      estadoAntes: datos.antes,
      estadoDespues: datos.despues,
      detalle: datos.detalle ?? null,
    },
  });
}

/** Corre la acción y traduce los errores esperables a un mensaje para el dueño. */
async function ejecutar<T extends object>(admin: AdminSesion, fn: (tx: TxPanel) => Promise<T>): Promise<Resultado<T>> {
  try {
    return { ok: true, ...(await comoAdmin(admin, fn)) };
  } catch (e) {
    if (e instanceof ErrorAccion) return { ok: false, error: e.message };
    if (codigoPostgres(e) === TRASLAPE_RESERVA) {
      return { ok: false, error: "Esas fechas ya están tomadas por otra reserva. No se puede confirmar." };
    }
    throw e;
  }
}

/**
 * Confirma una reserva pendiente o cancelada (por ejemplo, después de revisar un pago marcado
 * [REVISAR PAGO]). Revisa los bloqueos; las reservas activas en esas fechas las rechaza la base.
 * Las líneas [REVISAR PAGO] quedan como [PAGO REVISADO].
 */
export function confirmarReserva(admin: AdminSesion, codigo: string) {
  return ejecutar(admin, async (tx) => {
    const r = await bloquearReserva(tx, admin, codigo);
    const t = validarTransicion("confirmar", r.estado);
    if (!t.ok) throw new ErrorAccion(t.error);

    const bloqueos = await tx.bloqueo.count({
      where: { cabanaId: r.cabana_id, desde: { lt: r.check_out }, hasta: { gt: r.check_in } },
    });
    if (bloqueos > 0) throw new ErrorAccion("Hay fechas bloqueadas dentro de esta estadía. Quita el bloqueo antes de confirmar.");

    await tx.reserva.update({
      where: { id: r.id },
      data: { estado: t.hacia, expiraEn: null, notas: marcarPagoRevisado(r.notas) },
    });
    await auditar(tx, admin, {
      reservaId: r.id,
      accion: "confirmar",
      antes: r.estado,
      despues: t.hacia,
      detalle: tieneRevisarPago(r.notas) ? "Confirmada después de revisar el pago" : undefined,
    });
    return { estado: t.hacia };
  });
}

/** Cancela una reserva pendiente o confirmada y libera sus fechas. El motivo queda en la auditoría. */
export function cancelarReserva(admin: AdminSesion, codigo: string, motivo: string) {
  const m = validarMotivo(motivo);
  if (!m.ok) return Promise.resolve(m);
  return ejecutar(admin, async (tx) => {
    const r = await bloquearReserva(tx, admin, codigo);
    const t = validarTransicion("cancelar", r.estado);
    if (!t.ok) throw new ErrorAccion(t.error);

    await tx.reserva.update({ where: { id: r.id }, data: { estado: t.hacia, expiraEn: null } });
    await auditar(tx, admin, { reservaId: r.id, accion: "cancelar", antes: r.estado, despues: t.hacia, detalle: m.motivo });
    return { estado: t.hacia };
  });
}

/**
 * Registra un pago que recibió el dueño (saldo en efectivo, transferencia o Mercado Pago).
 * Lo pagado (pagos aprobados) más este monto nunca supera el total: se revisa con la fila
 * bloqueada, así dos registros simultáneos no pueden pasarse juntos.
 */
export function registrarPago(
  admin: AdminSesion,
  codigo: string,
  pago: { monto: number; medio: MedioPagoSaldo; fecha: string },
  hoy: string,
) {
  return ejecutar(admin, async (tx) => {
    const r = await bloquearReserva(tx, admin, codigo);
    const { _sum } = await tx.pago.aggregate({ where: { reservaId: r.id, estado: "aprobado" }, _sum: { monto: true } });
    const pagado = _sum.monto ?? 0;
    const v = validarPagoSaldo({ estado: r.estado, total: r.total, pagado, monto: pago.monto, fecha: pago.fecha, hoy });
    if (!v.ok) throw new ErrorAccion(v.error);

    await tx.pago.create({
      data: {
        reservaId: r.id,
        proveedor: pago.medio,
        monto: pago.monto,
        estado: "aprobado",
        // Mediodía UTC: en Chile sigue siendo el mismo día que eligió el dueño.
        pagadoEn: new Date(`${pago.fecha}T12:00:00Z`),
      },
    });
    await auditar(tx, admin, {
      reservaId: r.id,
      accion: "registrar_pago",
      antes: r.estado,
      despues: r.estado,
      detalle: `${formatearCLP(pago.monto)} en ${NOMBRE_MEDIO[pago.medio].toLowerCase()}, pagado el ${formatearFechaLarga(pago.fecha)}`,
    });
    return { pagado: pagado + pago.monto, saldo: r.total - pagado - pago.monto };
  });
}

/**
 * Marca como revisado un pago [REVISAR PAGO] sin cambiar el estado (por ejemplo, una reserva
 * cancelada cuyo pago tardío ya se devolvió). Quita el aviso del resumen.
 */
export function marcarRevisado(admin: AdminSesion, codigo: string, nota: string) {
  return ejecutar(admin, async (tx) => {
    const r = await bloquearReserva(tx, admin, codigo);
    if (!tieneRevisarPago(r.notas)) throw new ErrorAccion("Esta reserva no tiene pagos por revisar.");
    await tx.reserva.update({ where: { id: r.id }, data: { notas: marcarPagoRevisado(r.notas) } });
    await auditar(tx, admin, {
      reservaId: r.id,
      accion: "marcar_revisado",
      antes: r.estado,
      despues: r.estado,
      detalle: nota.trim().slice(0, 500) || undefined,
    });
    return { estado: r.estado };
  });
}
