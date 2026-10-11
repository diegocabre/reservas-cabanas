import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { fotosDeGaleria, galeriaRegistrada } from "../lib/galeria";
import { datosPendientes } from "../lib/publicacion";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// Tarifas del piloto (Cabaña Maicolpue), por NOCHE y fijas todo el año. Las cabañas demo usan las mismas.
// Desde 3 noches la tarifa menor rige para TODAS las noches (ver lib/precios.ts).
const TARIFAS = [
  { personasDesde: 1, personasHasta: 2, nochesDesde: 1, precioNoche: 65_000 },
  { personasDesde: 1, personasHasta: 2, nochesDesde: 3, precioNoche: 50_000 },
  { personasDesde: 3, personasHasta: 5, nochesDesde: 1, precioNoche: 75_000 },
  { personasDesde: 3, personasHasta: 5, nochesDesde: 3, precioNoche: 60_000 },
  { personasDesde: 6, personasHasta: 8, nochesDesde: 1, precioNoche: 85_000 },
  { personasDesde: 6, personasHasta: 8, nochesDesde: 3, precioNoche: 70_000 },
];

// Fotos de ejemplo de Unsplash (licencia libre). Se guardan a 1600 px; next/image las optimiza.
const unsplash = (id: string) => `https://images.unsplash.com/photo-${id}?w=1600&q=80&auto=format&fit=crop`;

const CABANAS = [
  {
    slug: "volcan-osorno",
    nombre: "Cabaña Volcán Osorno",
    capacidad: 4,
    dormitorios: 2,
    descripcion:
      "Cabaña de madera nativa con vista al lago y al volcán Osorno. Living con salamandra, cocina equipada y terraza.",
    servicios: ["Wifi", "Salamandra", "Cocina equipada", "Estacionamiento", "Terraza con vista al lago", "Parrilla"],
    fotos: [
      // La primera es la portada y la vista previa en WhatsApp: luminosa y horizontal.
      unsplash("1709525481712-65ff5856b9bd"), // muelle de Frutillar con el Osorno, día soleado
      unsplash("1758861356142-546a3822ab1a"), // salamandra con vista al lago
      unsplash("1696940171680-bb5b601a540b"), // cabaña de madera a orillas del lago
      unsplash("1579280456137-aa527151d36d"), // volcán Osorno desde los Saltos del Petrohué
    ],
  },
  {
    slug: "los-arrayanes",
    nombre: "Cabaña Los Arrayanes",
    capacidad: 6,
    dormitorios: 3,
    descripcion:
      "Cabaña familiar rodeada de arrayanes, a pasos de la playa. Tinaja caliente, quincho y amplio jardín.",
    servicios: ["Wifi", "Tinaja caliente", "Quincho", "Cocina equipada", "Estacionamiento", "Jardín"],
    fotos: [
      // La primera es la portada y la vista previa en WhatsApp: luminosa y horizontal.
      unsplash("1708737339521-f3c750942ffb"), // lago Llanquihue azul con el Osorno, cielo despejado
      unsplash("1693921940684-9ba2e70bc33b"), // cabaña de madera en el bosque
      unsplash("1774612193273-96b6d25a64d7"), // living con estufa a leña
      unsplash("1783628417381-f6be9614f208"), // living comedor con techo alto
      unsplash("1633512424746-0cb5240e064d"), // tinaja de madera
      unsplash("1783731524380-a30815242b6d"), // lago Llanquihue con el Osorno al fondo
    ],
  },
];

async function main() {
  const propiedadDatos = {
    nombre: "Cabañas Lago Llanquihue",
    ubicacion: "Puerto Varas · Lago Llanquihue",
    prefijoCodigo: "LL",
    // Ejemplo: búsqueda de Puerto Varas. La cabaña piloto pondrá el link exacto de su ubicación.
    urlMapa: "https://www.google.com/maps/search/?api=1&query=Puerto+Varas%2C+Los+Lagos%2C+Chile",
    // WhatsApp de Soluciones DyS para la demo (nunca un número inventado: podría ser de una persona real).
    whatsapp: "+56947637541",
    email: "contacto@solucionesdys.cl", // recibe el aviso de cada reserva confirmada y las respuestas de los huéspedes
    abonoPct: 50,
    abonoNoches: null,
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

  for (const cabanaDatos of CABANAS) {
    // Demo: datos de ejemplo con las reglas del piloto (se aceptan estadías de 1 noche); abono 50 %.
    // Las temporadas antiguas quedan en la base sin uso.
    const datos = { ...cabanaDatos, minNoches: 1, demo: true };
    const cabana = await db.cabana.upsert({
      where: { propiedadId_slug: { propiedadId: propiedad.id, slug: cabanaDatos.slug } },
      update: datos,
      create: { ...datos, propiedadId: propiedad.id },
    });
    await cargarTarifas(cabana.id);
    console.log(`✔ ${cabana.nombre} (demo): ${TARIFAS.length} tarifas`);
  }

  console.log(`✔ Propiedad "${propiedad.nombre}" lista`);

  await cargarMaicolpue();
}

/** Las tarifas se recrean completas; las reservas no se tocan (guardan su total y abono). */
async function cargarTarifas(cabanaId: string) {
  await db.tarifa.deleteMany({ where: { cabanaId } });
  await db.tarifa.createMany({ data: TARIFAS.map((t) => ({ ...t, cabanaId })) });
}

// Valores de ejemplo: todo lo marcado PENDIENTE lo confirma el dueño. Mientras quede alguno, la
// cabaña no se publica ni cobra fuera del modo prueba (lib/publicacion.ts).
async function cargarMaicolpue() {
  const propiedadDatos = {
    nombre: "Cabaña Maicolpue",
    ubicacion: "Maicolpue · San Juan de la Costa",
    prefijoCodigo: "MA",
    // Ubicación exacta de la cabaña (link de Google Maps del dueño, 2026-10-11), sin parámetros de rastreo.
    urlMapa: "https://www.google.com/maps/search/?api=1&query=-40.5989838%2C-73.7373428",
    // Nunca un número o email inventado: podría ser de una persona real.
    whatsapp: "+56944006839", // confirmado por el dueño el 2026-10-11
    email: "PENDIENTE",
    // Abono para reservar: 50 % del total (confirmado por el dueño el 2026-10-09). abono_noches sin usar.
    abonoPct: 50,
    abonoNoches: null,
    // Confirmada por el dueño el 2026-10-11.
    politicaCancelacion: "Una vez hecha la reserva no hay devolución del dinero pagado.",
    // Horarios confirmados por el dueño el 2026-10-11.
    instruccionesLlegada: "Check-in desde las 14:00 y check-out hasta las 11:30.",
  };
  const propiedad = await db.propiedad.upsert({
    where: { slug: "maicolpue" },
    update: propiedadDatos,
    create: { slug: "maicolpue", ...propiedadDatos },
  });

  const galeria = galeriaRegistrada("maicolpue", "maicolpue");
  if (!galeria) throw new Error("Falta la galería de Maicolpue en lib/galeria.ts");

  const cabanaDatos = {
    nombre: "Cabaña Maicolpue",
    capacidad: 8,
    // Deducido de las fotos, por confirmar con el dueño: piso 1 matrimonial + simple; piso 2 uno con 3 camas + uno con 2.
    dormitorios: 4,
    descripcion:
      "Cabaña de dos pisos para hasta 8 personas.\n\n" +
      "Primer piso: sala comedor con ventanal al bosque, cocina equipada con cocina a gas, una habitación matrimonial y una habitación simple.\n" +
      "Segundo piso: un dormitorio con tres camas y otro con dos camas.",
    servicios: ["Cocina equipada", "Cocina a gas", "Sala comedor", "Ventanal al bosque"],
    // Imágenes fijas de la galería en orden: la primera (poster del video 1) es la portada y la vista previa.
    fotos: fotosDeGaleria(galeria),
    minNoches: 1, // se aceptan estadías de 1 noche
    demo: false,
  };
  const cabana = await db.cabana.upsert({
    where: { propiedadId_slug: { propiedadId: propiedad.id, slug: "maicolpue" } },
    update: cabanaDatos,
    create: { ...cabanaDatos, slug: "maicolpue", propiedadId: propiedad.id },
  });
  await cargarTarifas(cabana.id);
  console.log(`✔ ${cabana.nombre}: ${TARIFAS.length} tarifas, ${galeria.length} medios en la galería`);
  const pendientes = datosPendientes(propiedad);
  console.log(
    pendientes.length
      ? `✔ Propiedad "${propiedad.nombre}" lista. Falta confirmar: ${pendientes.join(", ")}`
      : `✔ Propiedad "${propiedad.nombre}" lista, sin datos pendientes`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
