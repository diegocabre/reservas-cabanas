import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";
import { colores as c } from "./colores";

export interface DatosEmailApartada {
  codigo: string;
  nombreHuesped: string;
  propiedad: string;
  cabana: string;
  llegada: string; // "20 de octubre de 2026"
  salida: string;
  noches: number;
  total: string; // "$225.000"
  abono: string;
  horaLimite: string; // "15:30"
  urlReserva: string;
  urlBuscar: string;
  prueba: boolean;
}

/** Email al crear la reserva: el link para volver a pagar queda en la bandeja del huésped. */
export function ReservaApartada(d: DatosEmailApartada) {
  return (
    <Html lang="es-CL">
      <Head />
      <Preview>{`Tus fechas en ${d.cabana} están apartadas hasta las ${d.horaLimite}. Paga el abono para confirmar.`}</Preview>
      <Body style={{ backgroundColor: c.papel, color: c.tinta, fontFamily: "Helvetica, Arial, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px" }}>
          {d.prueba && (
            <Text style={{ backgroundColor: "#e3eaec", color: c.lago, borderRadius: 12, padding: "10px 14px", fontSize: 13, margin: "0 0 16px" }}>
              <strong>Reserva de prueba.</strong> Estamos probando el sistema: esta reserva no es real y no se cobra dinero.
            </Text>
          )}

          <Text style={{ color: c.madera, fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", margin: 0 }}>
            {d.propiedad} · Reserva {d.codigo}
          </Text>
          <Heading as="h1" style={{ fontFamily: "Georgia, serif", fontSize: 26, lineHeight: "32px", margin: "6px 0 8px" }}>
            {d.nombreHuesped}, tus fechas están apartadas
          </Heading>
          <Text style={{ fontSize: 15, margin: "0 0 20px" }}>
            Paga el abono de <strong>{d.abono}</strong> antes de las <strong>{d.horaLimite}</strong> para confirmar tu
            reserva. Después de esa hora las fechas se liberan para otros huéspedes.
          </Text>

          <Section style={{ textAlign: "center" }}>
            <Button
              href={d.urlReserva}
              style={{ backgroundColor: c.fuego, color: c.nieve, borderRadius: 999, padding: "14px 28px", fontWeight: 700, fontSize: 16 }}
            >
              Pagar abono de {d.abono}
            </Button>
          </Section>

          <Section style={{ backgroundColor: c.nieve, borderRadius: 20, border: `1px solid ${c.papelHondo}`, padding: "16px 20px", marginTop: 24 }}>
            <Text style={{ fontSize: 15, margin: 0 }}>
              <strong>{d.cabana}</strong>
              <br />
              {d.llegada} al {d.salida} · {d.noches} {d.noches === 1 ? "noche" : "noches"}
            </Text>
            <Hr style={{ borderColor: c.papelHondo, margin: "12px 0" }} />
            <Text style={{ fontSize: 15, margin: 0 }}>
              Total: <strong>{d.total}</strong> · Abono para reservar: <strong>{d.abono}</strong>
            </Text>
          </Section>

          <Text style={{ color: c.tintaSuave, fontSize: 12, marginTop: 24 }}>
            Tu código de reserva es <strong>{d.codigo}</strong>. Si pierdes este email, puedes volver a tu reserva en{" "}
            {d.urlBuscar} con tu código y tu email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default ReservaApartada;
