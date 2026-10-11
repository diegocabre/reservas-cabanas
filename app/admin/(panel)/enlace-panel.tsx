"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Enlace del menú del panel, marcado cuando su sección está abierta. */
export function EnlacePanel({ href, children }: { href: string; children: ReactNode }) {
  const ruta = usePathname();
  const activo = href === "/admin" ? ruta === "/admin" : ruta === href || ruta.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className="flex min-h-11 shrink-0 items-center rounded-full px-2.5 text-sm sm:px-3 font-semibold text-tinta-suave hover:text-tinta aria-[current=page]:bg-papel-hondo aria-[current=page]:text-tinta"
    >
      {children}
    </Link>
  );
}
