// Íconos de línea propios (sin librería). Heredan el color con currentColor.
type Props = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export function IconoPersonas({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M15.6 14.3c2.4-.4 4.4 1.1 4.9 4.2" />
    </svg>
  );
}

export function IconoCama({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M3 18V7" />
      <path d="M3 14h18v4" />
      <path d="M21 14v-2.5A2.5 2.5 0 0 0 18.5 9H11v5" />
      <circle cx="7" cy="11" r="1.8" />
    </svg>
  );
}

export function IconoLuna({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5Z" />
    </svg>
  );
}

export function IconoHoja({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14Z" />
      <path d="M5 19 13 11" />
    </svg>
  );
}

export function IconoFlecha({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
