-- Abono por noches (piloto Maicolpue: 1 noche). Si es null, rige abono_pct. Solo agrega una columna.

-- AlterTable
ALTER TABLE "propiedad" ADD COLUMN     "abono_noches" INTEGER;

alter table "propiedad" add constraint "propiedad_abono_noches_valido" check ("abono_noches" is null or "abono_noches" >= 1);
