import { describe, expect, it } from "vitest";
import { enCasa, llegadas, ocupacionMes, salidas, saldosPorCobrar, type ReservaPanel } from "./panel";

const r = (codigo: string, cabana: string, checkIn: string, checkOut: string, extra: Partial<ReservaPanel> = {}): ReservaPanel => ({
  codigo,
  cabana,
  huesped: "Huésped",
  checkIn,
  checkOut,
  estado: "confirmada",
  total: 300_000,
  pagado: 150_000,
  personas: 2,
  ...extra,
});

const hoy = "2026-10-20";
const reservas = [
  r("LL-0001", "Volcán Osorno", "2026-10-17", "2026-10-20"), // sale hoy
  r("LL-0002", "Volcán Osorno", "2026-10-20", "2026-10-23"), // llega hoy
  r("LL-0003", "Los Arrayanes", "2026-10-19", "2026-10-22", { pagado: 300_000 }), // en casa, pagada
  r("LL-0004", "Los Arrayanes", "2026-10-24", "2026-10-26"), // llega esta semana
  r("LL-0005", "Los Arrayanes", "2026-10-20", "2026-10-21", { estado: "pendiente_pago", pagado: 0 }), // no cuenta
  r("LL-0006", "Volcán Osorno", "2026-10-28", "2026-11-02", { estado: "cancelada" }), // no cuenta
];

const codigos = (rs: { codigo: string }[]) => rs.map((x) => x.codigo);

describe("llegadas y salidas", () => {
  it("lista las de hoy, solo confirmadas", () => {
    expect(codigos(llegadas(reservas, hoy))).toEqual(["LL-0002"]);
    expect(codigos(salidas(reservas, hoy))).toEqual(["LL-0001"]);
  });

  it("lista las de los próximos 7 días ordenadas por fecha", () => {
    expect(codigos(llegadas(reservas, hoy, 7))).toEqual(["LL-0002", "LL-0004"]);
    expect(codigos(salidas(reservas, hoy, 7))).toEqual(["LL-0001", "LL-0003", "LL-0002", "LL-0004"]);
  });
});

describe("enCasa", () => {
  it("incluye a quien duerme hoy, no a quien sale hoy", () => {
    expect(codigos(enCasa(reservas, hoy))).toEqual(["LL-0003", "LL-0002"]);
  });
});

describe("saldosPorCobrar", () => {
  it("muestra el saldo de las confirmadas que no están pagadas completas", () => {
    const saldos = saldosPorCobrar(reservas);
    expect(codigos(saldos)).toEqual(["LL-0001", "LL-0002", "LL-0004"]);
    expect(saldos[0].saldo).toBe(150_000);
  });
});

describe("ocupacionMes", () => {
  it("cuenta noches ocupadas dentro del mes sobre las disponibles", () => {
    // Octubre: 31 días × 2 cabañas = 62 noches. Ocupadas: 3 + 3 + 3 + 2 = 11 (las pendientes y canceladas no cuentan).
    expect(ocupacionMes(reservas, "2026-10", 2)).toEqual({ nochesOcupadas: 11, nochesDisponibles: 62, porcentaje: 18 });
  });

  it("corta las estadías que cruzan de mes", () => {
    const cruzada = [r("LL-0009", "Volcán Osorno", "2026-10-30", "2026-11-03")];
    expect(ocupacionMes(cruzada, "2026-10", 1).nochesOcupadas).toBe(2);
    expect(ocupacionMes(cruzada, "2026-11", 1).nochesOcupadas).toBe(2);
  });

  it("no divide por cero sin cabañas", () => {
    expect(ocupacionMes(reservas, "2026-10", 0).porcentaje).toBe(0);
  });
});
