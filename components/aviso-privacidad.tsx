import Link from "next/link";

// Avisos de privacidad (Ley 21.719). PENDIENTE de revisión legal: ver docs/plan-resenas.md.

/** En el formulario de reserva: qué se registra del huésped y por qué. */
export function AvisoPrivacidadReserva({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs leading-relaxed text-tinta-suave ${className}`}>
      Usamos tu nombre, email, teléfono y RUT para gestionar tu reserva y avisarte por correo. Después de tu estadía te
      invitaremos a dejar una reseña, y el anfitrión puede escribir una reseña privada sobre la estadía que solo ven los
      administradores del alojamiento. Puedes ver lo que guardamos sobre ti y pedir corregirlo o eliminarlo en{" "}
      <Link href="/mis-datos" className="font-semibold text-lago underline underline-offset-2">
        Mis datos
      </Link>
      .
    </p>
  );
}

/** En las páginas de reseñas del huésped. */
export function AvisoPrivacidadResena({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs leading-relaxed text-tinta-suave ${className}`}>
      Publicamos tu nombre de pila, tus estrellas, tu comentario y el mes de la estadía. Nunca tu apellido, email ni
      teléfono. El anfitrión también puede reseñar tu estadía en privado; puedes verla y responderla en{" "}
      <Link href="/mis-datos" className="font-semibold text-lago underline underline-offset-2">
        Mis datos
      </Link>
      .
    </p>
  );
}
