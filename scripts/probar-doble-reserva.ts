// Demo: la base de datos impide la doble reserva por sí sola.
// Uso: npm run probar:doble-reserva
//
// Crea reservas de prueba (código DEMO-*) en la Cabaña Volcán Osorno y las borra al final.
import "dotenv/config";
import { db } from "@/lib/db";

const PAUSA_MS = 1200; // respiro entre pasos para que se lea en el video
const PREFIJO = "DEMO-";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const esperar = () => new Promise((r) => setTimeout(r, PAUSA_MS));

let correlativo = 0;

async function reservar(cabanaId: string, huesped: string, checkIn: string, checkOut: string) {
  const reserva = await db.reserva.create({
    data: {
      codigo: `${PREFIJO}${String(correlativo + 1).padStart(3, "0")}`,
      cabanaId,
      checkIn: d(checkIn),
      checkOut: d(checkOut),
      adultos: 2,
      huespedNombre: huesped,
      huespedEmail: "demo@example.com",
      huespedTelefono: "+56900000000",
      total: 360_000,
      abono: 180_000,
      estado: "confirmada",
      origen: "manual",
    },
  });
  correlativo += 1; // solo avanza si la reserva entró
  return reserva;
}

// Extrae el mensaje original de Postgres del error de Prisma.
function mensajePostgres(e: unknown): string {
  const err = e as { meta?: { driverAdapterError?: { cause?: { originalMessage?: string; originalCode?: string } } }; message?: string };
  const causa = err.meta?.driverAdapterError?.cause;
  if (causa?.originalMessage) return `[${causa.originalCode}] ${causa.originalMessage}`;
  return err.message ?? String(e);
}

async function main() {
  const cabana = await db.cabana.findFirstOrThrow({ where: { slug: "volcan-osorno" } });
  await db.reserva.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });

  console.log(`\n🏡 ${cabana.nombre} — prueba de doble reserva\n`);

  // 1. Primera reserva
  console.log("1) Ana reserva del 10 al 13 de enero de 2027…");
  const ana = await reservar(cabana.id, "Ana", "2027-01-10", "2027-01-13");
  console.log(`   ✅ Reserva ${ana.codigo} confirmada (10 → 13 ene)\n`);
  await esperar();

  // 2. Traslape
  console.log("2) Bruno intenta reservar del 12 al 15 de enero (se cruza con Ana)…");
  try {
    await reservar(cabana.id, "Bruno", "2027-01-12", "2027-01-15");
    console.log("   ⚠️  Se aceptó: la restricción NO está funcionando\n");
  } catch (e) {
    console.log("   ❌ Postgres la rechazó:");
    console.log(`      ${mensajePostgres(e)}\n`);
  }
  await esperar();

  // 3. Llegada el día del check_out
  console.log("3) Carla reserva del 13 al 16 de enero (llega el día que Ana se va)…");
  const carla = await reservar(cabana.id, "Carla", "2027-01-13", "2027-01-16");
  console.log(`   ✅ Reserva ${carla.codigo} confirmada: el día de salida queda libre para otra llegada\n`);
  await esperar();

  // 4. Cancelar libera las fechas
  console.log("4) Ana cancela su reserva…");
  await db.reserva.update({ where: { id: ana.id }, data: { estado: "cancelada" } });
  console.log(`   🚫 Reserva ${ana.codigo} cancelada`);
  console.log("   Diego intenta reservar del 10 al 13 de enero (las fechas que eran de Ana)…");
  const diego = await reservar(cabana.id, "Diego", "2027-01-10", "2027-01-13");
  console.log(`   ✅ Reserva ${diego.codigo} confirmada: una reserva cancelada libera sus fechas\n`);
  await esperar();
}

main()
  .catch((e) => {
    console.error("\n💥 Error inesperado:", mensajePostgres(e));
    process.exitCode = 1;
  })
  .finally(async () => {
    // 5. Limpieza
    const { count } = await db.reserva.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    console.log(`🧹 ${count} reservas de prueba borradas\n`);
    await db.$disconnect();
  });
