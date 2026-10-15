// Poblado de la tabla huesped a partir de las reservas existentes (reseñas, etapa 2). Aparte de la
// migración y reversible. No cambia ningún dato de las reservas salvo la columna nueva huesped_id
// (que estaba en null). Idempotente: correrlo dos veces no duplica huéspedes.
//
// Uso:   npm run huespedes:poblar               (llena huesped y enlaza reserva.huesped_id)
//        npm run huespedes:poblar -- --revertir (deshace SOLO lo que creó el poblado y no tiene reseñas)
//
// Por seguridad se niega a correr contra Supabase (producción) salvo con --permitir-supabase.
// Ver el orden recomendado en docs/plan-resenas.md.
import "dotenv/config";
import { db } from "@/lib/db";
import { asegurarHuesped } from "@/lib/resenas";

const args = new Set(process.argv.slice(2));

function revisarDestino() {
  const host = new URL(process.env.DATABASE_URL ?? "postgresql://sin-url").hostname;
  console.log(`Base: ${host}`);
  if (host.includes("supabase") && !args.has("--permitir-supabase")) {
    console.error("Es una base de Supabase. Si de verdad quieres correrlo ahí, agrega --permitir-supabase.");
    process.exit(1);
  }
}

async function poblar() {
  const reservas = await db.reserva.findMany({
    where: { huespedId: null },
    select: { id: true, huespedId: true, huespedEmail: true, huespedTelefono: true, huespedNombre: true },
    orderBy: { createdAt: "asc" },
  });
  let enlazadas = 0;
  let sinEmail = 0;
  for (const r of reservas) {
    if (await asegurarHuesped(db, r, true)) enlazadas++;
    else sinEmail++;
  }
  const creados = await db.huesped.count({ where: { creadoPorPoblado: true } });
  console.log(`Reservas enlazadas: ${enlazadas}. Sin email válido (quedan en null): ${sinEmail}. Huéspedes del poblado: ${creados}.`);
}

async function revertir() {
  // Solo huéspedes creados por el poblado y sin reseñas ni solicitudes (si no, se perderían).
  const huespedes = await db.huesped.findMany({
    where: { creadoPorPoblado: true, resenas: { none: {} }, solicitudes: { none: {} } },
    select: { id: true },
  });
  const ids = huespedes.map((h) => h.id);
  // SQL directo para no tocar reserva.updated_at.
  const reservas = await db.$executeRaw`update reserva set huesped_id = null where huesped_id = any(${ids}::uuid[])`;
  const { count: borrados } = await db.huesped.deleteMany({ where: { id: { in: ids } } });
  const conservados = await db.huesped.count({ where: { creadoPorPoblado: true } });
  console.log(`Reservas desenlazadas: ${reservas}. Huéspedes borrados: ${borrados}. Conservados por tener reseñas o solicitudes: ${conservados}.`);
}

revisarDestino();
(args.has("--revertir") ? revertir() : poblar())
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
