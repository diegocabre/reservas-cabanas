import { describe, expect, it } from "vitest";
import { bloqueosEnPeriodo, enCasa, llegadas, ocupacion, ocupacionMes, ocupacionPorDia, porRevisarPago, salidas, saldosPorCobrar, type ReservaPanel } from "./panel";

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
    expect(ocupacionMes(reservas, "2026-10", 2)).toEqual({ nochesOcupadas: 11, nochesBloqueadas: 0, nochesDisponibles: 62, porcentaje: 18 });
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

describe("casos borde: llegada y salida el mismo día", () => {
  // Cambio de huésped: uno sale y otro llega a la MISMA cabaña el mismo día ([check_in, check_out)).
  const recambio = [
    r("MA-SALE01", "Maicolpue", "2026-10-08", "2026-10-11"),
    r("MA-LLEGA1", "Maicolpue", "2026-10-11", "2026-10-13"),
  ];
  const hoy = "2026-10-11";

  it("la que sale aparece en salidas y la que llega en llegadas", () => {
    expect(codigos(salidas(recambio, hoy))).toEqual(["MA-SALE01"]);
    expect(codigos(llegadas(recambio, hoy))).toEqual(["MA-LLEGA1"]);
  });

  it("esa noche solo está alojado el que llega", () => {
    expect(codigos(enCasa(recambio, hoy))).toEqual(["MA-LLEGA1"]);
  });

  it("el día de recambio cuenta una sola noche ocupada, no dos", () => {
    expect(ocupacion(recambio, hoy, 1, 1)).toEqual({ nochesOcupadas: 1, nochesBloqueadas: 0, nochesDisponibles: 1, porcentaje: 100 });
  });

  it("una estadía de una noche sale al día siguiente de llegar", () => {
    const corta = [r("MA-1NOCHE", "Maicolpue", "2026-10-11", "2026-10-12")];
    expect(codigos(llegadas(corta, "2026-10-11"))).toEqual(["MA-1NOCHE"]);
    expect(codigos(salidas(corta, "2026-10-11"))).toEqual([]);
    expect(codigos(enCasa(corta, "2026-10-12"))).toEqual([]);
    expect(codigos(salidas(corta, "2026-10-12"))).toEqual(["MA-1NOCHE"]);
  });
});

describe("casos borde: reserva que cruza el cambio de mes", () => {
  const cruzada = [r("MA-CRUZA1", "Maicolpue", "2026-10-30", "2026-11-02")]; // noches 30, 31 oct y 1 nov

  it("está alojada el último día del mes y el primero del siguiente", () => {
    expect(codigos(enCasa(cruzada, "2026-10-31"))).toEqual(["MA-CRUZA1"]);
    expect(codigos(enCasa(cruzada, "2026-11-01"))).toEqual(["MA-CRUZA1"]);
    expect(codigos(enCasa(cruzada, "2026-11-02"))).toEqual([]);
  });

  it("la salida del mes siguiente aparece en los próximos días", () => {
    expect(codigos(salidas(cruzada, "2026-10-31", 7))).toEqual(["MA-CRUZA1"]);
    expect(codigos(salidas(cruzada, "2026-11-02"))).toEqual(["MA-CRUZA1"]);
  });

  it("los próximos 30 días cuentan todas sus noches aunque cambie el mes", () => {
    expect(ocupacion(cruzada, "2026-10-20", 30, 1)).toEqual({ nochesOcupadas: 3, nochesBloqueadas: 0, nochesDisponibles: 30, porcentaje: 10 });
  });

  it("un periodo que empieza a mitad de la estadía cuenta solo las noches desde ese día", () => {
    expect(ocupacion(cruzada, "2026-10-31", 30, 1).nochesOcupadas).toBe(2);
    expect(ocupacion(cruzada, "2026-11-01", 30, 2)).toEqual({ nochesOcupadas: 1, nochesBloqueadas: 0, nochesDisponibles: 60, porcentaje: 2 });
  });

  it("el periodo termina exclusivo: la noche del día 30 ya no cuenta", () => {
    // Desde el 2 de oct, 30 días = noches del 2 al 31 de oct. La noche del 1 de nov queda fuera.
    expect(ocupacion(cruzada, "2026-10-02", 30, 1).nochesOcupadas).toBe(2);
  });

  it("cruza también el cambio de año", () => {
    const anioNuevo = [r("MA-ANIO01", "Maicolpue", "2026-12-30", "2027-01-02")];
    expect(codigos(enCasa(anioNuevo, "2027-01-01"))).toEqual(["MA-ANIO01"]);
    expect(ocupacion(anioNuevo, "2026-12-15", 30, 1).nochesOcupadas).toBe(3);
  });
});

describe("porRevisarPago", () => {
  it("encuentra las reservas con [REVISAR PAGO] en las notas, en cualquier estado", () => {
    const lista = [
      r("MA-OK0001", "Maicolpue", "2026-11-01", "2026-11-03", { notas: "[PRUEBA] llegan tarde" }),
      r("MA-REV002", "Maicolpue", "2026-11-10", "2026-11-12", {
        estado: "cancelada",
        notas: "[REVISAR PAGO] pago 123 aprobado después de vencer y las fechas ya están tomadas: reembolsar",
      }),
      r("MA-REV001", "Maicolpue", "2026-11-05", "2026-11-06", { notas: "nota\n[REVISAR PAGO] pago 99 aprobado por $1, distinto al abono" }),
      r("MA-NULL01", "Maicolpue", "2026-11-07", "2026-11-08", { notas: null }),
    ];
    expect(codigos(porRevisarPago(lista))).toEqual(["MA-REV001", "MA-REV002"]);
  });
});

describe("ocupacionPorDia", () => {
  it("cuenta cabañas ocupadas por noche, con el día de recambio contado una vez y cruzando de mes", () => {
    const lista = [
      r("MA-A", "Maicolpue", "2026-10-30", "2026-11-01"),
      r("MA-B", "Maicolpue", "2026-11-01", "2026-11-02"), // llega el día que sale MA-A
      r("LA-C", "Arrayanes", "2026-10-31", "2026-11-02"),
      r("LA-D", "Arrayanes", "2026-10-29", "2026-10-30", { estado: "cancelada" }),
    ];
    expect(ocupacionPorDia(lista, "2026-10-29", 5)).toEqual([
      { fecha: "2026-10-29", ocupadas: 0, bloqueadas: 0 },
      { fecha: "2026-10-30", ocupadas: 1, bloqueadas: 0 },
      { fecha: "2026-10-31", ocupadas: 2, bloqueadas: 0 },
      { fecha: "2026-11-01", ocupadas: 2, bloqueadas: 0 },
      { fecha: "2026-11-02", ocupadas: 0, bloqueadas: 0 },
    ]);
  });
});

describe("bloqueos en el resumen", () => {
  const bloqueos = [
    { cabana: "Maicolpue", desde: "2026-10-28", hasta: "2026-11-02", motivo: "airbnb" }, // cruza de mes
    { cabana: "Maicolpue", desde: "2026-12-01", hasta: "2026-12-03", motivo: "mantencion" },
    { cabana: "Maicolpue", desde: "2026-10-01", hasta: "2026-10-05", motivo: "uso_personal" }, // ya pasó
  ];

  it("lista los bloqueos que tocan el periodo, incluso si empezaron antes", () => {
    // 30 días desde el 30 de oct = noches del 30 de oct al 28 de nov: diciembre queda fuera.
    expect(bloqueosEnPeriodo(bloqueos, "2026-10-30", 30).map((b) => b.motivo)).toEqual(["airbnb"]);
    expect(bloqueosEnPeriodo(bloqueos, "2026-10-30", 40).map((b) => b.motivo)).toEqual(["airbnb", "mantencion"]);
    expect(bloqueosEnPeriodo(bloqueos, "2026-10-05", 1)).toEqual([]); // el día que se libera no cuenta
  });

  it("cuenta las noches bloqueadas aparte de las ocupadas por reservas", () => {
    const reservas = [r("MA-X", "Maicolpue", "2026-11-05", "2026-11-07")];
    expect(ocupacion(reservas, "2026-10-30", 30, 1, bloqueos)).toEqual({
      nochesOcupadas: 2,
      nochesBloqueadas: 3, // 30, 31 oct y 1 nov (el bloqueo de diciembre cae fuera del periodo)
      nochesDisponibles: 30,
      porcentaje: 7,
    });
  });

  it("marca las noches bloqueadas día por día", () => {
    const dias = ocupacionPorDia([], "2026-10-31", 3, bloqueos);
    expect(dias.map((x) => x.bloqueadas)).toEqual([1, 1, 0]);
  });
});
