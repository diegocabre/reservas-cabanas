import { PerfilVolcan } from "@/components/perfil-volcan";

export default function NoEncontrado() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <PerfilVolcan className="h-12 w-56" />
      <h1 className="mt-6 font-display text-3xl font-semibold text-balance">Esta cabaña se perdió en la neblina</h1>
      <p className="mt-3 max-w-sm text-tinta-suave">
        No encontramos la página que buscas. Puede que el enlace esté incompleto o que la cabaña ya no esté publicada.
      </p>
    </main>
  );
}
