CREATE TYPE "public"."rate_adjustment" AS ENUM('NONE', 'PERCENT', 'FIXED');--> statement-breakpoint
CREATE TYPE "public"."tax_kind" AS ENUM('PERCENT', 'PER_NIGHT', 'PER_PERSON_NIGHT');--> statement-breakpoint
CREATE TYPE "public"."tax_scope" AS ENUM('ROOM', 'POS', 'ALL');--> statement-breakpoint
CREATE TABLE "booking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"confirmation_code" text NOT NULL,
	"guest_id" uuid NOT NULL,
	"source" "reservation_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_confirmation_code_unique" UNIQUE("confirmation_code")
);
--> statement-breakpoint
CREATE TABLE "folio_item_tax" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folio_item_id" uuid NOT NULL,
	"tax_rule_id" uuid,
	"name" text NOT NULL,
	"amount_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"adjustment_kind" "rate_adjustment" DEFAULT 'NONE' NOT NULL,
	"adjustment_value" integer DEFAULT 0 NOT NULL,
	"included_occupancy" integer NOT NULL,
	"extra_adult_cents" integer DEFAULT 0 NOT NULL,
	"extra_child_cents" integer DEFAULT 0 NOT NULL,
	"refundable" boolean DEFAULT true NOT NULL,
	"free_cancellation_days" integer,
	"breakfast_included" boolean DEFAULT false NOT NULL,
	"min_los" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_plan_values_ck" CHECK ("rate_plan"."included_occupancy" >= 1 AND "rate_plan"."extra_adult_cents" >= 0 AND "rate_plan"."extra_child_cents" >= 0 AND ("rate_plan"."min_los" IS NULL OR "rate_plan"."min_los" >= 1))
);
--> statement-breakpoint
CREATE TABLE "rate_plan_daily" (
	"rate_plan_id" uuid NOT NULL,
	"date" date NOT NULL,
	"rate_override_cents" integer,
	"is_closed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "rate_plan_daily_rate_plan_id_date_pk" PRIMARY KEY("rate_plan_id","date"),
	CONSTRAINT "rate_plan_daily_rate_ck" CHECK ("rate_plan_daily"."rate_override_cents" IS NULL OR "rate_plan_daily"."rate_override_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "tax_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "tax_kind" NOT NULL,
	"rate_bp" integer DEFAULT 0 NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"applies_to" "tax_scope" DEFAULT 'ALL' NOT NULL,
	"inclusive" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_rule_rate_ck" CHECK ("tax_rule"."rate_bp" BETWEEN 0 AND 10000 AND "tax_rule"."amount_cents" >= 0),
	CONSTRAINT "tax_rule_inclusive_ck" CHECK (NOT "tax_rule"."inclusive" OR "tax_rule"."kind" = 'PERCENT'),
	CONSTRAINT "tax_rule_fixed_scope_ck" CHECK ("tax_rule"."kind" = 'PERCENT' OR "tax_rule"."applies_to" = 'ROOM')
);
--> statement-breakpoint
DROP INDEX "channel_mapping_type_channel_uq";--> statement-breakpoint
DROP INDEX "channel_mapping_external_uq";--> statement-breakpoint
ALTER TABLE "channel_mapping" ADD COLUMN "rate_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "channel_mapping" ADD COLUMN "external_rate_id" text;--> statement-breakpoint
ALTER TABLE "reservation" ADD COLUMN "rate_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "reservation" ADD COLUMN "booking_id" uuid;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_guest_id_guest_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guest"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folio_item_tax" ADD CONSTRAINT "folio_item_tax_folio_item_id_folio_item_id_fk" FOREIGN KEY ("folio_item_id") REFERENCES "public"."folio_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folio_item_tax" ADD CONSTRAINT "folio_item_tax_tax_rule_id_tax_rule_id_fk" FOREIGN KEY ("tax_rule_id") REFERENCES "public"."tax_rule"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plan" ADD CONSTRAINT "rate_plan_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plan" ADD CONSTRAINT "rate_plan_room_type_id_room_type_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plan_daily" ADD CONSTRAINT "rate_plan_daily_rate_plan_id_rate_plan_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rule" ADD CONSTRAINT "tax_rule_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "folio_item_tax_item_idx" ON "folio_item_tax" USING btree ("folio_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_plan_type_code_uq" ON "rate_plan" USING btree ("room_type_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_plan_one_default_uq" ON "rate_plan" USING btree ("room_type_id") WHERE "rate_plan"."is_default";--> statement-breakpoint
CREATE INDEX "tax_rule_property_idx" ON "tax_rule" USING btree ("property_id");--> statement-breakpoint
ALTER TABLE "channel_mapping" ADD CONSTRAINT "channel_mapping_rate_plan_id_rate_plan_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_rate_plan_id_rate_plan_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservation_booking_idx" ON "reservation" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_mapping_type_channel_uq" ON "channel_mapping" USING btree ("room_type_id","channel_name","rate_plan_id") NULLS NOT DISTINCT;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_mapping_external_uq" ON "channel_mapping" USING btree ("channel_name","external_room_id","external_rate_id") NULLS NOT DISTINCT;--> statement-breakpoint
-- ---------- data migration (hand-written) ----------
-- Legacy single tax rate → one PERCENT rule; the column is then zeroed so it never double-applies.
INSERT INTO "tax_rule" ("property_id", "name", "kind", "rate_bp", "applies_to")
	SELECT "id", 'Tax', 'PERCENT', "tax_rate_bp", 'ALL' FROM "property" WHERE "tax_rate_bp" > 0;--> statement-breakpoint
UPDATE "property" SET "tax_rate_bp" = 0;--> statement-breakpoint
-- Every room type gets a default plan that reproduces current pricing (all guests included, no extras).
INSERT INTO "rate_plan" ("property_id", "room_type_id", "name", "code", "included_occupancy", "is_default")
	SELECT "property_id", "id", 'Standard rate', 'STD', "max_occupancy", true FROM "room_type";--> statement-breakpoint
UPDATE "reservation" r SET "rate_plan_id" = rp."id" FROM "rate_plan" rp WHERE rp."room_type_id" = r."room_type_id" AND rp."is_default";--> statement-breakpoint
-- Tax breakdown is part of the immutable ledger.
CREATE TRIGGER folio_item_tax_append_only BEFORE UPDATE OR DELETE ON "folio_item_tax"
	FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();
