// Reglas de acceso al panel del dueño (funciones puras, sin red ni base de datos).

/** Páginas del panel que se abren sin sesión: pedir el link y recibirlo. */
export const RUTAS_LIBRES_ADMIN = ["/admin/ingresar", "/admin/confirmar"] as const;

export const RUTA_INGRESAR = "/admin/ingresar";

/** ¿Esta ruta necesita sesión iniciada? Solo el panel (/admin), salvo las rutas libres. */
export function requiereSesion(ruta: string): boolean {
  const enPanel = ruta === "/admin" || ruta.startsWith("/admin/");
  const libre = RUTAS_LIBRES_ADMIN.some((r) => ruta === r || ruta.startsWith(`${r}/`));
  return enPanel && !libre;
}

/** Motivos por los que se vuelve a la página de ingreso, con el mensaje que ve el dueño. */
export const MENSAJES_INGRESO = {
  link: "El link no es válido o ya venció. Pide uno nuevo.",
  "sin-acceso": "Ese email no tiene acceso al panel. Si crees que es un error, escríbenos.",
} as const;

export type MotivoIngreso = keyof typeof MENSAJES_INGRESO;

export function mensajeIngreso(motivo: string | undefined): string | null {
  return motivo && Object.hasOwn(MENSAJES_INGRESO, motivo) ? MENSAJES_INGRESO[motivo as MotivoIngreso] : null;
}
