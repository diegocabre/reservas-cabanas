import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";
import { colores as c } from "./colores";

export interface DatosEmailSolicitud {
  codigo: string;
  propiedad: string;
  cabana: string;
  titulo: string;
  parrafos: string[];
  boton: { texto: string; url: string } | null;
  llegada: string; // "20 de octubre de 2026"
  salida: string;
  noches: number;
  personas: number;
  total: string; // "$225.000"
  abono: string;
  prueba: boolean;
  etiqueta?: string; // encabezado: "Solicitud" por defecto; "Reserva" en los correos de reseñas
  mostrarPrecio?: boolean; // false en los correos de reseñas
}

/** Correos al huésped de una solicitud de reserva (recibida, aprobada, rechazada, expirada, recordatorio). */
export function AvisoSolicitud(d: DatosEmailSolicitud) {
  return (
    <Html lang="es-CL">
      <Head />
      <Preview>{d.parrafos[0] ?? d.titulo}</Preview>
      <Body style={{ backgroundColor: c.papel, color: c.tinta, fontFamily: "Helvetica, Arial, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px" }}>
          {d.prueba && (
            <Text style={{ backgroundColor: "#e3eaec", color: c.lago, borderRadius: 12, padding: "10px 14px", fontSize: 13, margin: "0 0 16px" }}>
              <strong>Reserva de prueba.</strong> Estamos probando el sistema: esta reserva no es real y no se cobra dinero.
            </Text>
          )}

          <Text style={{ color: c.madera, fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", margin: 0 }}>
            {d.propiedad} · {d.etiqueta ?? "Solicitud"} {d.codigo}
          </Text>
          <Heading as="h1" style={{ fontFamily: "Georgia, serif", fontSize: 26, lineHeight: "32px", margin: "6px 0 8px" }}>
            {d.titulo}
          </Heading>
          {d.parrafos.map((p) => (
            <Text key={p} style={{ fontSize: 15, margin: "0 0 12px" }}>
              {p}
            </Text>
          ))}

          {d.boton && (
            <Section style={{ textAlign: "center", marginTop: 8 }}>
              <Button
                href={d.boton.url}
                style={{ backgroundColor: c.fuego, color: c.nieve, borderRadius: 999, padding: "16px 32px", fontWeight: 700, fontSize: 17 }}
              >
                {d.boton.texto}
              </Button>
            </Section>
          )}

          <Section style={{ backgroundColor: c.nieve, borderRadius: 20, border: `1px solid ${c.papelHondo}`, padding: "16px 20px", marginTop: 24 }}>
            <Text style={{ fontSize: 15, margin: 0 }}>
              <strong>{d.cabana}</strong>
              <br />
              {d.llegada} al {d.salida} · {d.noches} {d.noches === 1 ? "noche" : "noches"} · {d.personas}{" "}
              {d.personas === 1 ? "persona" : "personas"}
            </Text>
            {d.mostrarPrecio !== false && (
              <>
                <Hr style={{ borderColor: c.papelHondo, margin: "12px 0" }} />
                <Text style={{ fontSize: 15, margin: 0 }}>
                  Total: <strong>{d.total}</strong> · Abono para confirmar: <strong>{d.abono}</strong>
                </Text>
              </>
            )}
          </Section>

          <Text style={{ color: c.tintaSuave, fontSize: 12, marginTop: 24 }}>
            Tu código es <strong>{d.codigo}</strong>. Responde este correo si tienes dudas: le llega directo al anfitrión.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default AvisoSolicitud;
