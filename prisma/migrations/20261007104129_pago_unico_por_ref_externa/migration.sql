-- Un pago externo (ej. id de pago de Mercado Pago) se registra una sola vez aunque el aviso llegue repetido.
-- DropIndex
DROP INDEX "pago_ref_externa_idx";

-- CreateIndex
CREATE UNIQUE INDEX "pago_proveedor_ref_externa_key" ON "pago"("proveedor", "ref_externa");
