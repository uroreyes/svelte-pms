ALTER TABLE "guest" ADD COLUMN "id_document_last4" text;--> statement-breakpoint
ALTER TABLE "guest" ADD CONSTRAINT "guest_id_document_last4_ck" CHECK ("guest"."id_document_last4" IS NULL OR (char_length("guest"."id_document_last4") = 4 AND "guest"."id_document_number" IS NOT NULL));--> statement-breakpoint
-- Hand-written (not in drizzle snapshot): guest ID numbers must be v1 envelopes (PR-21). NOT VALID: legacy plaintext is encrypted + VALIDATEd by scripts/reencrypt-id-documents.ts.
ALTER TABLE "guest" ADD CONSTRAINT "guest_id_document_number_encrypted"
  CHECK ("id_document_number" IS NULL OR "id_document_number" ~ '^v1:[A-Za-z0-9_-]{1,32}:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]+$') NOT VALID;
