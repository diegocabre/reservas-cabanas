import { redirect } from "next/navigation";

// Mientras no haya portada propia, la raíz lleva directo a la cabaña piloto (Maicolpue tiene una sola
// cabaña, así que se salta la lista de la propiedad). Las demo siguen en /lago-llanquihue.
export default function Inicio() {
  redirect("/maicolpue/maicolpue");
}
