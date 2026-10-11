import { requerirAdmin } from "@/lib/admin";

export default async function PaginaPanel() {
  const admin = await requerirAdmin();

  return (
    <>
      <h1 className="font-display text-3xl font-semibold">Hola</h1>
      <p className="mt-2 text-tinta-suave">Este es el panel de {admin.propiedad.nombre}. Pronto verás aquí el resumen del día.</p>
    </>
  );
}
