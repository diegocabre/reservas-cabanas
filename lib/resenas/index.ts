// Reseñas con base de datos (reglas puras en lib/resenas-reglas.ts, plan en docs/plan-resenas.md).
//
// - Huésped (sin cuenta): entra con el link único de su invitación (token HMAC, se guarda el hash,
//   cada link sirve para UN envío y vence a los 30 días del check-out).
// - Dueño: acciones con RLS (comoAdmin / ejecutar), igual que lib/panel-acciones.ts. No puede editar
//   ni borrar reseñas de su cabaña: solo responder y reportar.
// - Doble ciego (evaluarDesbloqueo): nada se muestra a la otra parte (ni al público) hasta que
//   están las dos reseñas o pasaron 14 días desde el check-out. Bloquea el ciclo (FOR UPDATE).
// - Lo que el panel no puede hacer con su rol (crear huéspedes y ciclos, publicar) lo hace el
//   servidor con `db` DESPUÉS de verificar con RLS que la reserva es del admin.
// Sin imports de Next: las Server Actions, las páginas y el cron la envuelven; los tests la llaman directo.

export { asegurarHuesped, asegurarCiclo, urlResenaDeCiclo, evaluarDesbloqueo } from "@/lib/resenas/comun";
export {
  cargarSuperadmin,
  type Superadmin,
  colaModeracion,
  resolverReporte,
  atenderSolicitudPrivacidad,
} from "@/lib/resenas/moderacion";
export {
  pedirAccesoHuesped,
  abrirAccesoHuesped,
  replicarResena,
  solicitarPrivacidad,
} from "@/lib/resenas/derechos-huesped";
export { type Invitacion, abrirInvitacion, validarResenaCabana, enviarResenaCabana } from "@/lib/resenas/tokens";
export { MAXIMO_RESENAS_PUBLICAS, resenasPublicas } from "@/lib/resenas/publica";
export {
  datosResenasPanel,
  responderResena,
  reportarResena,
  pedirResenaPorWhatsapp,
  validarResenaHuesped,
  escribirResenaHuesped,
  historialHuesped,
  type HistorialHuesped,
  resenasDeReserva,
} from "@/lib/resenas/panel";
export { procesarResenas } from "@/lib/resenas/cron";
