// Reseñas públicas de la cabaña. Server Component: el HTML sale renderizado del servidor (indexable)
// y "ver más" es un <details> nativo, sin JavaScript. Solo recibe reseñas publicadas, sin datos
// personales (lib/resenas.ts → resenasPublicas).

import { CATEGORIAS, mesYAnio, notaGeneral, resumirResenas, type ResenaPublica } from "@/lib/resenas-reglas";

const VISIBLES = 6;
const decimal = (n: number) => n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function Estrellas({ nota, className = "size-4" }: { nota: number; className?: string }) {
  return (
    <span className="inline-flex text-madera" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} viewBox="0 0 24 24" className={`${className} ${n <= Math.round(nota) ? "fill-current" : "fill-transparent"}`}>
          <path stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
        </svg>
      ))}
    </span>
  );
}

function Tarjeta({ r }: { r: ResenaPublica }) {
  const nota = notaGeneral(r);
  return (
    <li className="border-t border-linea pt-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-bold">{r.nombre}</p>
        <p className="text-sm text-tinta-suave first-letter:uppercase">{mesYAnio(r.publicadaEn)}</p>
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-sm">
        <Estrellas nota={nota} />
        <span className="sr-only">Calificación:</span>
        <span className="font-semibold tabular-nums">{decimal(nota)}</span>
      </p>
      <p className="mt-2 leading-relaxed whitespace-pre-line text-tinta/90">{r.comentario}</p>
      {r.respuesta && (
        <div className="mt-3 rounded-2xl bg-papel-hondo/70 px-4 py-3 text-sm">
          <p className="font-semibold">Respuesta del anfitrión</p>
          <p className="mt-1 whitespace-pre-line text-tinta/90">{r.respuesta}</p>
        </div>
      )}
    </li>
  );
}

export function ResenasCabana({ resenas, className = "" }: { resenas: ResenaPublica[]; className?: string }) {
  const resumen = resumirResenas(resenas);
  // Sin reseñas publicadas no se muestra nada (ni un "0 reseñas").
  if (!resumen) return null;
  const [primeras, resto] = [resenas.slice(0, VISIBLES), resenas.slice(VISIBLES)];

  return (
    <section aria-labelledby="titulo-resenas" className={className}>
      <h2 id="titulo-resenas" className="flex flex-wrap items-baseline gap-x-3 font-display text-xl font-semibold text-tinta">
        Reseñas
        <span className="flex items-center gap-1.5 font-sans text-base">
          <Estrellas nota={resumen.promedio} />
          <strong className="tabular-nums">{decimal(resumen.promedio)}</strong>
          <span className="font-normal text-tinta-suave">
            · {resumen.cantidad} {resumen.cantidad === 1 ? "reseña" : "reseñas"}
          </span>
        </span>
      </h2>

      <dl className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
        {CATEGORIAS.map((c) => (
          <div key={c.clave} className="flex items-center gap-3 text-sm">
            <dt className="w-40 shrink-0">{c.nombre}</dt>
            <dd className="flex flex-1 items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-papel-hondo" aria-hidden="true">
                <span className="block h-full rounded-full bg-madera" style={{ width: `${(resumen.porCategoria[c.clave] / 5) * 100}%` }} />
              </span>
              <span className="w-7 text-right font-semibold tabular-nums">{decimal(resumen.porCategoria[c.clave])}</span>
            </dd>
          </div>
        ))}
      </dl>

      <ul className="mt-6 grid gap-5">
        {primeras.map((r) => (
          <Tarjeta key={r.id} r={r} />
        ))}
      </ul>
      {resto.length > 0 && (
        <details className="group mt-5">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-full border border-linea px-5 font-semibold hover:bg-papel-hondo group-open:hidden">
            Ver {resto.length} {resto.length === 1 ? "reseña más" : "reseñas más"}
          </summary>
          <ul className="grid gap-5">
            {resto.map((r) => (
              <Tarjeta key={r.id} r={r} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
