// Silueta del volcán con su reflejo en el lago. Separador decorativo de la página.
export function PerfilVolcan({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 48" className={className} aria-hidden="true" preserveAspectRatio="xMidYMax meet">
      {/* cordillera lejana */}
      <path d="M0 40 L38 30 L62 34 L96 24 L120 31 L140 28 L160 40 Z" fill="var(--lago)" opacity="0.18" />
      <path d="M178 40 L206 29 L232 33 L262 25 L290 32 L320 30 L320 40 Z" fill="var(--lago)" opacity="0.18" />
      {/* volcán */}
      <path d="M104 40 L150 10 Q160 4 170 10 L216 40 Z" fill="var(--volcan)" opacity="0.85" />
      {/* nieve */}
      <path d="M140 16.5 L150 10 Q160 4 170 10 L180 16.5 L172 19 L165 15.5 L158 20 L151 16 L146 19 Z" fill="var(--nieve)" />
      {/* lago */}
      <path d="M0 40 H320" stroke="var(--lago)" strokeWidth="1.2" opacity="0.5" />
      <path d="M128 44 H192 M144 47 H176" stroke="var(--lago)" strokeWidth="1" opacity="0.3" />
    </svg>
  );
}
