// Reservas antiguas con marcas dentro de `notas` ("[PRUEBA]", "[REVISAR PAGO]", "[PAGO REVISADO]"),
// de antes de que esas marcas pasaran a columnas (es_prueba, revisar_pago, revisar_pago_motivo).
// Las marcas pueden venir del modo prueba o haberlas escrito un huésped: la decisión es manual.
//
// Uso:   npm run marcas:notas
//          Solo lista (modo --dry-run, el por defecto). No escribe nada. Se puede correr en producción.
//        npm run marcas:notas -- --aplicar --prueba=LL-0001,LL-0002 --revisar=LL-0003
//          Marca es_prueba en los códigos de --prueba y revisar_pago en los de --revisar (con el
//          motivo copiado de sus líneas [REVISAR PAGO]). NUNCA cambia `notas`. Contra Supabase
//          exige además --permitir-supabase.
import "dotenv/config";
import { db } from "@/lib/db";

const MARCAS = ["[PRUEBA]", "[REVISAR PAGO]", "[PAGO REVISADO]"] as const;
const REVISAR = "[REVISAR PAGO]";

const argumentos = process.argv.slice(2);
const bandera = (nombre: string) => argumentos.includes(nombre);
const lista = (nombre: string) =>
  (argumentos.find((a) => a.startsWith(`${nombre}=`))?.slice(nombre.length + 1) ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

/** Motivos de revisión: las líneas [REVISAR PAGO] de las notas, sin la marca. */
export function motivosDeRevision(notas: string | null): string | null {
  const lineas = (notas ?? "")
    .split(/\r?\n/)
    .filter((l) => l.includes(REVISAR))
    .map((l) => l.replace(REVISAR, "").trim());
  return lineas.length ? lineas.join("\n") : null;
}

async function listar() {
  const reservas = await db.reserva.findMany({
    where: { OR: MARCAS.map((m) => ({ notas: { contains: m } })) },
    select: { codigo: true, estado: true, origen: true, createdAt: true, notas: true, esPrueba: true, revisarPago: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Reservas con marcas en notas: ${reservas.length}\n`);
  for (const r of reservas) {
    const marcas = MARCAS.filter((m) => r.notas?.includes(m));
    console.log(
      [
        r.codigo,
        `creada ${r.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC`,
        r.estado,
        `origen ${r.origen}`,
        `marcas ${marcas.join(" ")}`,
        `ya en columnas: es_prueba=${r.esPrueba} revisar_pago=${r.revisarPago}`,
      ].join(" · "),
    );
    // Las notas pueden traer datos del huésped: se muestran solo las líneas con marca.
    for (const l of (r.notas ?? "").split(/\r?\n/).filter((l) => MARCAS.some((m) => l.includes(m)))) console.log(`    ${l.slice(0, 160)}`);
  }
  console.log("\nNada se escribió. Para marcar: --aplicar --prueba=COD1,COD2 --revisar=COD3");
}

async function aplicar() {
  const host = new URL(process.env.DATABASE_URL ?? "postgresql://sin-url").hostname;
  console.log(`Base: ${host}`);
  if (host.includes("supabase") && !bandera("--permitir-supabase")) {
    console.error("Es una base de Supabase. Si de verdad quieres escribir ahí, agrega --permitir-supabase.");
    process.exit(1);
  }
  const prueba = lista("--prueba");
  const revisar = lista("--revisar");
  if (!prueba.length && !revisar.length) {
    console.error("Indica los códigos con --prueba=... y/o --revisar=...");
    process.exit(1);
  }
  // SQL directo para no tocar reserva.updated_at; notas no se toca.
  if (prueba.length) {
    const n = await db.$executeRaw`update reserva set es_prueba = true where codigo = any(${prueba}::text[])`;
    console.log(`es_prueba = true en ${n} de ${prueba.length} códigos.`);
  }
  for (const codigo of revisar) {
    const r = await db.reserva.findUnique({ where: { codigo }, select: { notas: true } });
    if (!r) {
      console.log(`${codigo}: no existe.`);
      continue;
    }
    const motivo = motivosDeRevision(r.notas) ?? "pago por revisar (marcado a mano)";
    await db.$executeRaw`update reserva set revisar_pago = true, revisar_pago_motivo = ${motivo} where codigo = ${codigo}`;
    console.log(`${codigo}: revisar_pago = true.`);
  }
}

(bandera("--aplicar") ? aplicar() : listar())
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
