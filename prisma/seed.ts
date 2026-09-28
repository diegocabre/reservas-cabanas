import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// Fecha `date` sin hora (medianoche UTC, que es como Prisma guarda @db.Date).
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

type Tarifa = "alta" | "media" | "baja";

// Rangos [desde, hasta): `hasta` es EXCLUSIVO. Tramos continuos desde el
// 1 oct 2026 hasta el 1 mar 2028 (completa la temporada alta 2027-28),
// sin huecos ni traslapes.
const TRAMOS: { nombre: string; tarifa: Tarifa; desde: string; hasta: string }[] = [
  { nombre: "Baja", tarifa: "baja", desde: "2026-10-01", hasta: "2026-12-15" },
  { nombre: "Alta 2026-27", tarifa: "alta", desde: "2026-12-15", hasta: "2027-03-01" },
  { nombre: "Media marzo", tarifa: "media", desde: "2027-03-01", hasta: "2027-04-01" },
  { nombre: "Baja", tarifa: "baja", desde: "2027-04-01", hasta: "2027-09-17" },
  { nombre: "Fiestas Patrias", tarifa: "media", desde: "2027-09-17", hasta: "2027-09-21" },
  { nombre: "Baja", tarifa: "baja", desde: "2027-09-21", hasta: "2027-12-15" },
  { nombre: "Alta 2027-28", tarifa: "alta", desde: "2027-12-15", hasta: "2028-03-01" },
];

// Mínimo de noches por temporada (null = rige el de la cabaña).
const MIN_NOCHES: Record<Tarifa, number | null> = { alta: 3, media: null, baja: null };

const CABANAS = [
  {
    slug: "volcan-osorno",
    nombre: "Cabaña Volcán Osorno",
    capacidad: 4,
    dormitorios: 2,
    descripcion:
      "Cabaña de madera nativa con vista al lago y al volcán Osorno. Living con salamandra, cocina equipada y terraza.",
    servicios: ["Wifi", "Salamandra", "Cocina equipada", "Estacionamiento", "Terraza con vista al lago", "Parrilla"],
    precios: { alta: 120_000, media: 95_000, baja: 75_000 },
  },
  {
    slug: "los-arrayanes",
    nombre: "Cabaña Los Arrayanes",
    capacidad: 6,
    dormitorios: 3,
    descripcion:
      "Cabaña familiar rodeada de arrayanes, a pasos de la playa. Tinaja caliente, quincho y amplio jardín.",
    servicios: ["Wifi", "Tinaja caliente", "Quincho", "Cocina equipada", "Estacionamiento", "Jardín"],
    precios: { alta: 160_000, media: 130_000, baja: 100_000 },
  },
];

async function main() {
  const propiedadDatos = {
    nombre: "Cabañas Lago Llanquihue",
    whatsapp: "+56912345678",
    email: "contacto@example.com",
    abonoPct: 50,
    politicaCancelacion:
      "Cancelación sin costo hasta 15 días antes de la llegada (se devuelve el abono). Con menos de 15 días, el abono no es reembolsable.",
    instruccionesLlegada:
      "Check-in desde las 15:00 y check-out hasta las 11:00. Te enviaremos la ubicación exacta y el código de acceso por WhatsApp el día anterior.",
  };

  const propiedad = await db.propiedad.upsert({
    where: { slug: "lago-llanquihue" },
    update: propiedadDatos,
    create: { slug: "lago-llanquihue", ...propiedadDatos },
  });

  for (const { precios, ...cabanaDatos } of CABANAS) {
    const cabana = await db.cabana.upsert({
      where: { propiedadId_slug: { propiedadId: propiedad.id, slug: cabanaDatos.slug } },
      update: { ...cabanaDatos, minNoches: 2 },
      create: { ...cabanaDatos, minNoches: 2, propiedadId: propiedad.id },
    });

    // Las temporadas se recrean completas; las reservas no se tocan.
    await db.temporada.deleteMany({ where: { cabanaId: cabana.id } });
    await db.temporada.createMany({
      data: TRAMOS.map((t) => ({
        cabanaId: cabana.id,
        nombre: t.nombre,
        desde: d(t.desde),
        hasta: d(t.hasta),
        precioNoche: precios[t.tarifa],
        minNoches: MIN_NOCHES[t.tarifa],
      })),
    });

    console.log(`✔ ${cabana.nombre}: ${TRAMOS.length} temporadas`);
  }

  console.log(`✔ Propiedad "${propiedad.nombre}" lista`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
