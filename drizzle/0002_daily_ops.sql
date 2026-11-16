CREATE TABLE "invoice_counter" (
	"property_id" uuid PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "folio" ADD COLUMN "company_name" text;--> statement-breakpoint
ALTER TABLE "folio" ADD COLUMN "tax_id" text;--> statement-breakpoint
ALTER TABLE "folio" ADD COLUMN "billing_address" text;--> statement-breakpoint
ALTER TABLE "folio" ADD COLUMN "invoice_number" text;--> statement-breakpoint
ALTER TABLE "folio" ADD COLUMN "invoice_issued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "property" ADD COLUMN "invoice_prefix" text DEFAULT 'INV-' NOT NULL;--> statement-breakpoint
ALTER TABLE "reservation" ADD COLUMN "no_show_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoice_counter" ADD CONSTRAINT "invoice_counter_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "folio_invoice_number_uq" ON "folio" USING btree ("property_id","invoice_number") WHERE "folio"."invoice_number" IS NOT NULL;