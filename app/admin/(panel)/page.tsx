import { requerirAdmin } from "@/lib/admin";

export default async function PaginaPanel() {
  const admin = await requerirAdmin();

  return (
    <>
      <h1 className="font-display text-3xl font-semibold">Panel</h1>
      <p className="mt-2 text-tinta-suave">Administras:</p>
      <ul className="mt-2 list-disc pl-5">
        {admin.propiedades.map((p) => (
          <li key={p.id}>{p.nombre}</li>
        ))}
      </ul>
    </>
  );
}
