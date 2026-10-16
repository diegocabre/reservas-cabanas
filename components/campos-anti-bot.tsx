import { CAMPO_MARCA, CAMPO_SENUELO } from "@/lib/anti-bot-campos";

/**
 * Campos ocultos del anti-bot (lib/anti-bot.ts): el señuelo queda fuera de la pantalla y fuera del
 * orden de tabulación, oculto a lectores de pantalla; la marca solo en formularios de páginas dinámicas.
 */
export function CamposAntiBot({ marca }: { marca?: string }) {
  return (
    <>
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Sitio web
          <input type="text" name={CAMPO_SENUELO} tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      {marca && <input type="hidden" name={CAMPO_MARCA} value={marca} />}
    </>
  );
}
