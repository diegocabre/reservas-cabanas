// Reglas de acceso al panel del dueño (funciones puras, sin red ni base de datos).

export const RUTA_LOGIN = "/admin/login";

/** Cierra la sesión y vuelve al login (la usa requerirAdmin cuando el usuario no es admin). */
export const RUTA_SALIR = "/admin/salir";

/** Páginas del panel que se abren sin sesión: pedir el link, recibirlo y salir. */
export const RUTAS_LIBRES_ADMIN = [RUTA_LOGIN, "/admin/confirmar", RUTA_SALIR] as const;

/** ¿Esta ruta necesita sesión iniciada? Todo /admin, salvo las rutas libres. */
export function requiereSesion(ruta: string): boolean {
  const enPanel = ruta === "/admin" || ruta.startsWith("/admin/");
  const libre = RUTAS_LIBRES_ADMIN.some((r) => ruta === r || ruta.startsWith(`${r}/`));
  return enPanel && !libre;
}

/** Motivos por los que se vuelve al login, con el mensaje que ve el dueño. */
export const MENSAJES_LOGIN = {
  link: "El link no es válido o ya venció. Pide uno nuevo.",
  "sin-acceso": "Sin acceso: ese email no administra ninguna propiedad. Si crees que es un error, escríbenos.",
  suspendida: "Tu cuenta está suspendida. Escríbenos para reactivarla.",
} as const;

export type MotivoLogin = keyof typeof MENSAJES_LOGIN;

export function mensajeLogin(motivo: string | undefined): string | null {
  return motivo && Object.hasOwn(MENSAJES_LOGIN, motivo) ? MENSAJES_LOGIN[motivo as MotivoLogin] : null;
}

/** Login con un motivo conocido, ej. "/admin/login?error=sin-acceso". */
export function urlLogin(motivo?: MotivoLogin): string {
  return motivo ? `${RUTA_LOGIN}?error=${motivo}` : RUTA_LOGIN;
}
