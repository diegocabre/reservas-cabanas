import { redirect } from "next/navigation";

// Mientras no haya portada propia, la raíz lleva a la propiedad de ejemplo.
export default function Inicio() {
  redirect("/lago-llanquihue");
}
