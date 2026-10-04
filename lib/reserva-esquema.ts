import { z } from "zod";
import { normalizarRut, validarRut } from "@/lib/rut";

/**
 * Teléfono a formato internacional. Acepta celulares chilenos escritos de varias formas
 * ("9 1234 5678", "+56 9 1234 5678", "56912345678") y números extranjeros con "+".
 * Devuelve null si no parece un teléfono.
 */
export function normalizarTelefono(valor: string): string | null {
  const conMas = valor.trim().startsWith("+");
  const digitos = valor.replace(/\D/g, "");
  if (/^9\d{8}$/.test(digitos)) return `+56${digitos}`;
  if (/^569\d{8}$/.test(digitos)) return `+${digitos}`;
  if (conMas && /^\d{8,15}$/.test(digitos)) return `+${digitos}`;
  return null;
}

const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Elige las fechas en el calendario" });

/** Datos de una reserva web. Se valida igual en el navegador y en la Server Action. */
export const esquemaReserva = z
  .object({
    propiedad: z.string().min(1),
    cabana: z.string().min(1),
    checkIn: fechaIso,
    checkOut: fechaIso,
    adultos: z.coerce.number().int().min(1, { error: "Debe venir al menos un adulto" }).max(30),
    ninos: z.coerce.number().int().min(0).max(30).default(0),
    nombre: z
      .string()
      .trim()
      .min(3, { error: "Escribe tu nombre y apellido" })
      .max(120, { error: "El nombre es muy largo" }),
    email: z.string().trim().toLowerCase().pipe(z.email({ error: "Revisa el email" })),
    telefono: z
      .string()
      .transform((v, ctx) => {
        const tel = normalizarTelefono(v);
        if (!tel) {
          ctx.addIssue({ code: "custom", message: "Escribe un celular válido, ej. 9 1234 5678" });
          return z.NEVER;
        }
        return tel;
      }),
    rut: z
      .string()
      .trim()
      .min(1, { error: "El RUT es obligatorio" })
      .refine(validarRut, { error: "Revisa el RUT y su dígito verificador" })
      .transform(normalizarRut),
    notas: z.string().trim().max(1000, { error: "Máximo 1.000 caracteres" }).default(""),
  })
  .refine((d) => d.checkOut > d.checkIn, { error: "La salida debe ser posterior a la llegada", path: ["checkOut"] });

export type DatosReserva = z.output<typeof esquemaReserva>;
