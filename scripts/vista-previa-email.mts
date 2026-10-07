// Genera un HTML de vista previa del email de confirmación (no envía nada).
// Uso: npx tsx scripts/vista-previa-email.tsx [ruta-salida.html]
import { writeFileSync } from "node:fs";
import { render } from "@react-email/render";
import { ConfirmacionReserva } from "@/emails/confirmacion-reserva";

const html = await render(
  ConfirmacionReserva({
    codigo: "LL-0004",
    nombreHuesped: "Ana",
    propiedad: "Cabañas Lago Llanquihue",
    ubicacion: "Puerto Varas · Lago Llanquihue",
    cabana: "Cabaña Los Arrayanes",
    foto: "https://images.unsplash.com/photo-1708737339521-f3c750942ffb?w=1120&q=75&fit=crop",
    llegada: "26 de octubre de 2026",
    salida: "28 de octubre de 2026",
    noches: 2,
    personas: 4,
    total: "$200.000",
    abono: "$100.000",
    saldo: "$100.000",
    instruccionesLlegada:
      "Check-in desde las 15:00 y check-out hasta las 11:00. Te enviaremos la ubicación exacta y el código de acceso por WhatsApp el día anterior.",
    politicaCancelacion:
      "Cancelación sin costo hasta 15 días antes de la llegada (se devuelve el abono). Con menos de 15 días, el abono no es reembolsable.",
    urlReserva: "https://reservas.solucionesdys.cl/reserva/LL-0004",
    urlWhatsapp: "https://wa.me/56947637541",
    urlMapa: "https://www.google.com/maps/search/?api=1&query=Puerto+Varas",
    prueba: true,
  }),
);
const salida = process.argv[2] ?? "vista-previa-email.html";
writeFileSync(salida, html);
console.log(`Vista previa en ${salida}`);
