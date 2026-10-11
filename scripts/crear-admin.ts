// Da acceso al panel a un email: crea (o reutiliza) su usuario en Supabase Auth y lo registra
// como Admin de una propiedad. El panel no tiene registro abierto: esta es la única forma de entrar.
//
// Uso:   npx tsx scripts/crear-admin.ts <email> <slug-propiedad> [dueno|staff]
// Ej.:   npx tsx scripts/crear-admin.ts dueno@gmail.com maicolpue
//
// Necesita SUPABASE_SERVICE_ROLE_KEY en .env (Supabase → Project Settings → API keys).
// Esa llave es secreta: solo se usa en este script local, nunca en la app ni en Vercel.
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/db";

async function main() {
  const [emailArg, slug, rolArg = "dueno"] = process.argv.slice(2);
  const email = emailArg?.trim().toLowerCase();
  if (!email || !slug || !["dueno", "staff"].includes(rolArg)) {
    throw new Error("Uso: npx tsx scripts/crear-admin.ts <email> <slug-propiedad> [dueno|staff]");
  }
  const rol = rolArg as "dueno" | "staff";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !llave) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");

  const propiedad = await db.propiedad.findUnique({ where: { slug }, select: { id: true, nombre: true } });
  if (!propiedad) throw new Error(`No existe una propiedad con slug "${slug}"`);

  const supabase = createClient(url, llave, { auth: { persistSession: false, autoRefreshToken: false } });
  const id = await idUsuario(supabase.auth.admin, email);

  const otro = await db.admin.findUnique({ where: { email }, select: { id: true } });
  if (otro && otro.id !== id) throw new Error(`Ya hay un Admin con el email ${email} y otro id de usuario. Revísalo a mano.`);

  await db.admin.upsert({
    where: { id },
    create: { id, email, rol, propiedadId: propiedad.id },
    update: { email, rol, propiedadId: propiedad.id },
  });
  console.log(`✔ ${email} es ${rol} de "${propiedad.nombre}". Ya puede entrar en /admin/ingresar.`);
}

/** Id del usuario de Supabase Auth con ese email; lo crea (ya confirmado) si no existe. */
async function idUsuario(auth: ReturnType<typeof createClient>["auth"]["admin"], email: string): Promise<string> {
  const creado = await auth.createUser({ email, email_confirm: true });
  if (creado.data.user) return creado.data.user.id;

  // Ya existía: se busca entre los usuarios (en el piloto son pocos).
  for (let page = 1; ; page++) {
    const { data, error } = await auth.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const usuario = data.users.find((u) => u.email?.toLowerCase() === email);
    if (usuario) return usuario.id;
    if (data.users.length < 200) throw creado.error ?? new Error(`No se pudo crear el usuario ${email}`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
