import type { Metadata } from "next";
import { requerirAdmin } from "@/lib/admin";
import { formatearFechaCorta, hoyEnChile } from "@/lib/formato";
import { conexionDisponible, estadoCuentas, puedeGestionarCobros } from "@/lib/mercadopago-cuentas";
import { enModoPrueba } from "@/lib/sitio";
import { BotonConectar, BotonDesconectar } from "./botones";

export const metadata: Metadata = { title: "Cobros" };

const HECHO = {
  conectada: "Mercado Pago conectado. Los abonos de tus reservas llegan directo a tu cuenta.",
  desconectada: "Mercado Pago desconectado. Los huéspedes ya no pueden pagar el abono en línea.",
} as const;

const ERROR = {
  rechazada: "No se conectó: la autorización se canceló en Mercado Pago.",
  estado: "El enlace de conexión venció o no es válido. Vuelve a pulsar «Conectar Mercado Pago».",
  permiso: "Solo el dueño de la propiedad puede conectar su Mercado Pago.",
  mercadopago: "Mercado Pago no respondió al conectar. Intenta de nuevo en unos minutos.",
} as const;

const de = <T extends object>(mapa: T, clave: unknown) =>
  typeof clave === "string" && Object.hasOwn(mapa, clave) ? mapa[clave as keyof T] : null;

export default async function PaginaCobros({ searchParams }: PageProps<"/admin/cobros">) {
  const admin = await requerirAdmin();
  const { hecho, error } = await searchParams;
  const cuentas = await estadoCuentas(admin);
  const configurado = conexionDisponible();
  const mensaje = de(HECHO, hecho);
  const problema = de(ERROR, error);

  return (
    <>
      <h1 className="font-display text-3xl font-semibold">Cobros</h1>
      <p className="mt-2 max-w-prose text-tinta-suave">
        Conecta tu cuenta de Mercado Pago para que los huéspedes paguen el abono en línea. El dinero llega directo a tu
        cuenta: Reservas Cabañas Sur no lo recibe ni lo retiene. No necesitas entregar tu clave, y puedes quitar el
        permiso cuando quieras desde Mercado Pago.
      </p>

      {mensaje && (
        <p role="status" className="mt-5 rounded-2xl bg-musgo/15 px-4 py-3 text-sm font-semibold text-musgo">
          {mensaje}
        </p>
      )}
      {problema && (
        <p role="alert" className="mt-5 rounded-2xl bg-alerta/10 px-4 py-3 text-sm font-semibold text-alerta-hondo">
          {problema}
        </p>
      )}
      {!configurado && (
        <p className="mt-5 rounded-2xl border border-dashed border-linea px-4 py-3 text-sm text-tinta-suave">
          La conexión con Mercado Pago todavía no está activa en el sitio. Te avisaremos cuando puedas conectar tu cuenta.
        </p>
      )}

      <ul className="mt-6 grid gap-3">
        {admin.propiedades.map((p) => {
          const cuenta = cuentas.get(p.id);
          const dueno = puedeGestionarCobros(admin, p.id);
          return (
            <li key={p.id} className="rounded-2xl border border-linea bg-nieve p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-xl font-semibold">{p.nombre}</p>
                  {cuenta ? (
                    <>
                      <p className="mt-1 text-sm font-semibold text-musgo">
                        Mercado Pago conectado{cuenta.produccion ? "" : " (cuenta de prueba)"}
                      </p>
                      <p className="text-sm text-tinta-suave">
                        Cuenta N° {cuenta.mpUserId}. La conectó {cuenta.conectadaPor} el{" "}
                        {formatearFechaCorta(hoyEnChile(cuenta.updatedAt))}.
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-tinta-suave">
                      Sin cuenta conectada.{" "}
                      {enModoPrueba()
                        ? "En modo prueba los pagos usan una cuenta de prueba."
                        : "Los huéspedes no pueden pagar el abono en línea."}
                    </p>
                  )}
                </div>
                {dueno && cuenta && <BotonDesconectar propiedadId={p.id} />}
              </div>
              {configurado && dueno && (
                <div className="mt-4">
                  <BotonConectar propiedadId={p.id} reconectar={Boolean(cuenta)} />
                </div>
              )}
              {!dueno && <p className="mt-3 text-xs text-tinta-suave">Solo el dueño de la propiedad puede conectar o cambiar la cuenta.</p>}
            </li>
          );
        })}
      </ul>
    </>
  );
}
