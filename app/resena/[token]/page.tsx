import type { Metadata } from "next";
import Link from "next/link";
import { AvisoPrivacidadResena } from "@/components/aviso-privacidad";
import { PerfilVolcan } from "@/components/perfil-volcan";
import { abrirInvitacion } from "@/lib/resenas";
import { DIAS_DOBLE_CIEGO } from "@/lib/resenas-reglas";
import { FormularioResena } from "./formulario";

// El link es personal: no se indexa ni se filtra por el Referer al salir de la página.
export const metadata: Metadata = {
  title: "Tu reseña",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

function Marco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-5 pt-12 pb-16">
      <div className="text-center">
        <PerfilVolcan className="mx-auto h-10 w-48" />
        <h1 className="mt-5 font-display text-3xl font-semibold text-balance">{titulo}</h1>
      </div>
      {children}
    </main>
  );
}

const caja = "vetas mt-8 rounded-3xl border border-linea bg-nieve p-5";

export default async function PaginaResena({ params, searchParams }: PageProps<"/resena/[token]">) {
  const { token } = await params;
  const aviso = await searchParams;
  const inv = await abrirInvitacion(decodeURIComponent(token));

  if (inv.estado === "invalido") {
    return (
      <Marco titulo="Este link ya no sirve">
        <p className="mt-3 text-center text-tinta-suave">
          El link no es válido o ya se usó. Si ya enviaste tu reseña, gracias: usa el último link que te mostramos para editarla.
        </p>
      </Marco>
    );
  }
  if (inv.estado === "vencido" || inv.estado === "no_elegible") {
    return (
      <Marco titulo={inv.cabana}>
        <p className="mt-3 text-center text-tinta-suave">{inv.motivo}</p>
      </Marco>
    );
  }
  if (inv.estado === "publicada") {
    return (
      <Marco titulo="¡Gracias por tu reseña!">
        <p className="mt-3 text-center text-tinta-suave">
          Tu reseña de {inv.cabana} ya está publicada y no se puede editar.{" "}
          <Link href={inv.urlCabana} className="font-semibold text-lago underline underline-offset-2">
            Verla en la página de la cabaña
          </Link>
          .
        </p>
      </Marco>
    );
  }

  const guardada = aviso.guardada !== undefined;
  return (
    <Marco titulo={guardada ? "¡Gracias! Guardamos tu reseña" : `¿Cómo te fue en ${inv.cabana}?`}>
      <p className="mt-2 text-center text-tinta-suave">
        {inv.nombre}, estadía del {inv.llegada} al {inv.salida} · {inv.propiedad}
      </p>

      {guardada && (
        <section role="status" className="mt-6 rounded-2xl border border-lago/30 bg-lago/10 p-4 text-sm">
          <p className="font-bold">Se publicará cuando el anfitrión escriba la suya o pasen {DIAS_DOBLE_CIEGO} días desde tu salida.</p>
          <p className="mt-1">
            Hasta entonces puedes editarla desde <strong>este link</strong> (guárdalo: el del correo ya no sirve). Una vez
            publicada no se puede cambiar.
          </p>
          {inv.previa && <p className="mt-1 text-tinta-suave">Te quedan {inv.previa.edicionesRestantes} ediciones.</p>}
        </section>
      )}
      {inv.desbloqueado && !inv.previa && (
        <p className="mt-6 rounded-2xl border border-linea bg-papel-hondo/60 p-4 text-sm">
          El anfitrión ya publicó su parte: tu reseña se publicará apenas la envíes y no se podrá editar.
        </p>
      )}

      <div className={caja}>
        <FormularioResena token={decodeURIComponent(token)} previa={inv.previa} />
      </div>
      <AvisoPrivacidadResena className="mt-5" />
    </Marco>
  );
}
