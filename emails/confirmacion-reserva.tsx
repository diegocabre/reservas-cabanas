import { Body, Button, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text } from "@react-email/components";

// Colores de la paleta del sitio (app/globals.css). Los emails no leen variables CSS.
const c = {
  papel: "#f6f0e6",
  papelHondo: "#ebe0cd",
  nieve: "#fffdf9",
  tinta: "#2a2420",
  tintaSuave: "#6a5d52",
  madera: "#8a5636",
  lago: "#1d4a5a",
  musgo: "#56663a",
  fuego: "#c0522a",
};

export interface DatosEmailConfirmacion {
  codigo: string;
  nombreHuesped: string;
  propiedad: string;
  ubicacion: string | null;
  cabana: string;
  foto: string | null;
  llegada: string; // "20 de octubre de 2026"
  salida: string;
  noches: number;
  personas: number;
  total: string; // "$225.000"
  abono: string;
  saldo: string;
  instruccionesLlegada: string | null;
  politicaCancelacion: string | null;
  urlReserva: string;
  urlWhatsapp: string | null;
  urlMapa: string | null;
  prueba: boolean;
}

export function ConfirmacionReserva(d: DatosEmailConfirmacion) {
  return (
    <Html lang="es-CL">
      <Head />
      <Preview>
        {`Reserva ${d.codigo} confirmada: ${d.cabana}, ${d.llegada} al ${d.salida}`}
      </Preview>
      <Body style={{ backgroundColor: c.papel, color: c.tinta, fontFamily: "Helvetica, Arial, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px" }}>
          {d.prueba && (
            <Text style={{ backgroundColor: "#e3eaec", color: c.lago, borderRadius: 12, padding: "10px 14px", fontSize: 13, margin: "0 0 16px" }}>
              <strong>Reserva de prueba.</strong> Estamos probando el sistema: esta reserva no es real y no se cobró dinero.
            </Text>
          )}

          <Text style={{ color: c.madera, fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", margin: 0 }}>
            {d.propiedad} · Reserva {d.codigo}
          </Text>
          <Heading as="h1" style={{ fontFamily: "Georgia, serif", fontSize: 28, lineHeight: "34px", margin: "6px 0 8px" }}>
            ¡Tu reserva está confirmada, {d.nombreHuesped}!
          </Heading>
          <Text style={{ color: c.tintaSuave, fontSize: 15, margin: "0 0 20px" }}>
            Recibimos el abono de {d.abono}. Te esperamos en {d.cabana}.
          </Text>

          <Section style={{ backgroundColor: c.nieve, borderRadius: 20, overflow: "hidden", border: `1px solid ${c.papelHondo}` }}>
            {d.foto && <Img src={d.foto} alt={d.cabana} width="560" style={{ width: "100%", height: "auto", display: "block" }} />}
            <Section style={{ padding: "18px 20px" }}>
              <Heading as="h2" style={{ fontFamily: "Georgia, serif", fontSize: 22, margin: 0 }}>
                {d.cabana}
              </Heading>
              {d.ubicacion && <Text style={{ color: c.tintaSuave, fontSize: 14, margin: "2px 0 0" }}>{d.ubicacion}</Text>}

              <Text style={{ fontSize: 15, margin: "16px 0 0" }}>
                <strong>Llegada:</strong> {d.llegada}
                <br />
                <strong>Salida:</strong> {d.salida}
                <br />
                {d.noches} {d.noches === 1 ? "noche" : "noches"} · {d.personas} {d.personas === 1 ? "persona" : "personas"}
              </Text>

              <Hr style={{ borderColor: c.papelHondo, margin: "16px 0" }} />
              <Text style={{ fontSize: 15, margin: 0 }}>
                Total: <strong>{d.total}</strong>
                <br />
                <span style={{ color: c.musgo }}>Abono pagado: {d.abono}</span>
                <br />
                <span style={{ color: c.tintaSuave }}>Saldo pendiente: {d.saldo} (se paga directo a la cabaña)</span>
              </Text>
            </Section>
          </Section>

          {d.instruccionesLlegada && (
            <Section style={{ marginTop: 20 }}>
              <Heading as="h3" style={{ fontSize: 16, margin: "0 0 4px" }}>
                Instrucciones de llegada
              </Heading>
              <Text style={{ color: c.tintaSuave, fontSize: 14, whiteSpace: "pre-line", margin: 0 }}>{d.instruccionesLlegada}</Text>
              {d.urlMapa && (
                <Link href={d.urlMapa} style={{ color: c.lago, fontSize: 14, fontWeight: 700 }}>
                  Ver la ubicación en el mapa
                </Link>
              )}
            </Section>
          )}

          <Section style={{ marginTop: 24, textAlign: "center" }}>
            <Button
              href={d.urlReserva}
              style={{ backgroundColor: c.fuego, color: c.nieve, borderRadius: 999, padding: "14px 26px", fontWeight: 700, fontSize: 15 }}
            >
              Ver mi reserva
            </Button>
            {d.urlWhatsapp && (
              <Text style={{ margin: "14px 0 0", fontSize: 14 }}>
                ¿Dudas?{" "}
                <Link href={d.urlWhatsapp} style={{ color: c.musgo, fontWeight: 700 }}>
                  Escríbele a la cabaña por WhatsApp
                </Link>
              </Text>
            )}
          </Section>

          {d.politicaCancelacion && (
            <Text style={{ color: c.tintaSuave, fontSize: 12, marginTop: 28 }}>
              <strong>Política de cancelación:</strong> {d.politicaCancelacion}
            </Text>
          )}
          <Text style={{ color: c.tintaSuave, fontSize: 12, marginTop: 8 }}>
            Guarda el código {d.codigo} para cualquier consulta con la cabaña.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default ConfirmacionReserva;
