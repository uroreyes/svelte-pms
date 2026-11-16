CREATE TYPE "public"."channel_name" AS ENUM('BOOKING_COM', 'AGODA', 'AIRBNB', 'EXPEDIA', 'ICAL');--> statement-breakpoint
CREATE TYPE "public"."folio_item_type" AS ENUM('ROOM', 'POS_ORDER', 'TAX', 'DISCOUNT');--> statement-breakpoint
CREATE TYPE "public"."folio_status" AS ENUM('OPEN', 'SETTLED');--> statement-breakpoint
CREATE TYPE "public"."housekeeping_status" AS ENUM('CLEAN', 'DIRTY', 'INSPECTED', 'OUT_OF_ORDER');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('PENDING', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('PAYMENT', 'REFUND', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'CARD', 'TRANSFER');--> statement-breakpoint
CREATE TYPE "public"."reservation_source" AS ENUM('DIRECT', 'FRONT_DESK', 'BOOKING_COM', 'AGODA', 'AIRBNB', 'EXPEDIA', 'ICAL');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW');--> statement-breakpoint
CREATE TYPE "public"."room_posting_mode" AS ENUM('UPFRONT', 'NIGHTLY');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('ADMIN', 'MANAGER', 'FRONT_DESK', 'POS');--> statement-breakpoint
CREATE TABLE "catalog_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"taxable" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_item_price_nn" CHECK ("catalog_item"."unit_price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "channel_mapping" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"channel_name" "channel_name" NOT NULL,
	"external_room_id" text NOT NULL,
	"ical_url" text,
	"push_url" text,
	"export_token" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_mapping_export_token_unique" UNIQUE("export_token")
);
--> statement-breakpoint
CREATE TABLE "channel_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"channel_mapping_id" uuid NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"status" "outbox_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "folio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"label" text NOT NULL,
	"payer_name" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"receives_room_charges" boolean DEFAULT false NOT NULL,
	"status" "folio_status" DEFAULT 'OPEN' NOT NULL,
	"total_charges_cents" integer DEFAULT 0 NOT NULL,
	"total_payments_cents" integer DEFAULT 0 NOT NULL,
	"balance_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "folio_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folio_id" uuid NOT NULL,
	"type" "folio_item_type" NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"tax_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"service_date" date,
	"reverses_item_id" uuid,
	"void_reason" text,
	"staff_user_id" uuid NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folio_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folio_id" uuid NOT NULL,
	"method" "payment_method" NOT NULL,
	"kind" "payment_kind" NOT NULL,
	"amount_cents" integer NOT NULL,
	"reference_no" text,
	"related_payment_id" uuid,
	"reason" text,
	"staff_user_id" uuid NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "folio_payment_sign_ck" CHECK (("folio_payment"."kind" = 'PAYMENT' AND "folio_payment"."amount_cents" > 0) OR ("folio_payment"."kind" <> 'PAYMENT' AND "folio_payment"."amount_cents" < 0 AND "folio_payment"."related_payment_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "guest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"id_document_type" text,
	"id_document_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"currency" char(3) DEFAULT 'USD' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"tax_rate_bp" integer DEFAULT 0 NOT NULL,
	"room_posting_mode" "room_posting_mode" DEFAULT 'NIGHTLY' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_slug_unique" UNIQUE("slug"),
	CONSTRAINT "property_tax_rate_range" CHECK ("property"."tax_rate_bp" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE TABLE "reservation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"room_unit_id" uuid,
	"confirmation_code" text NOT NULL,
	"source" "reservation_source" NOT NULL,
	"external_ref" text,
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"adults" integer DEFAULT 1 NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"status" "reservation_status" DEFAULT 'CONFIRMED' NOT NULL,
	"quoted_total_cents" integer NOT NULL,
	"overbooked" boolean DEFAULT false NOT NULL,
	"notes" text,
	"deposit_cents" integer,
	"deposit_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_in_at" timestamp with time zone,
	"checked_out_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "reservation_confirmation_code_unique" UNIQUE("confirmation_code"),
	CONSTRAINT "reservation_dates_ck" CHECK ("reservation"."check_out" > "reservation"."check_in"),
	CONSTRAINT "reservation_party_ck" CHECK ("reservation"."adults" >= 1 AND "reservation"."children" >= 0)
);
--> statement-breakpoint
CREATE TABLE "reservation_night" (
	"reservation_id" uuid NOT NULL,
	"date" date NOT NULL,
	"rate_cents" integer NOT NULL,
	CONSTRAINT "reservation_night_reservation_id_date_pk" PRIMARY KEY("reservation_id","date")
);
--> statement-breakpoint
CREATE TABLE "room_block" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"room_unit_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_block_dates_ck" CHECK ("room_block"."end_date" > "room_block"."start_date")
);
--> statement-breakpoint
CREATE TABLE "room_inventory_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_type_id" uuid NOT NULL,
	"date" date NOT NULL,
	"available_count" integer NOT NULL,
	"sold_count" integer DEFAULT 0 NOT NULL,
	"rate_override_cents" integer,
	"min_los" integer,
	"is_closed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rid_available_nn" CHECK ("room_inventory_daily"."available_count" >= 0),
	CONSTRAINT "rid_sold_nn" CHECK ("room_inventory_daily"."sold_count" >= 0),
	CONSTRAINT "rid_rate_nn" CHECK ("room_inventory_daily"."rate_override_cents" IS NULL OR "room_inventory_daily"."rate_override_cents" >= 0),
	CONSTRAINT "rid_min_los_ck" CHECK ("room_inventory_daily"."min_los" IS NULL OR "room_inventory_daily"."min_los" >= 1)
);
--> statement-breakpoint
CREATE TABLE "room_type" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"name" text NOT NULL,
	"base_rate_cents" integer NOT NULL,
	"base_occupancy" integer DEFAULT 2 NOT NULL,
	"max_occupancy" integer NOT NULL,
	"amenities" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_type_base_rate_nn" CHECK ("room_type"."base_rate_cents" >= 0),
	CONSTRAINT "room_type_occupancy_ck" CHECK ("room_type"."base_occupancy" >= 1 AND "room_type"."max_occupancy" >= "room_type"."base_occupancy")
);
--> statement-breakpoint
CREATE TABLE "room_unit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"room_number" text NOT NULL,
	"floor" integer DEFAULT 1 NOT NULL,
	"housekeeping_status" "housekeeping_status" DEFAULT 'CLEAN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "staff_role" NOT NULL,
	"password_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "catalog_item" ADD CONSTRAINT "catalog_item_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_mapping" ADD CONSTRAINT "channel_mapping_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_mapping" ADD CONSTRAINT "channel_mapping_room_type_id_room_type_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_outbox" ADD CONSTRAINT "channel_outbox_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_outbox" ADD CONSTRAINT "channel_outbox_channel_mapping_id_channel_mapping_id_fk" FOREIGN KEY ("channel_mapping_id") REFERENCES "public"."channel_mapping"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folio" ADD CONSTRAINT "folio_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folio" ADD CONSTRAINT "folio_reservation_id_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folio_item" ADD CONSTRAINT "folio_item_folio_id_folio_id_fk" FOREIGN KEY ("folio_id") REFERENCES "public"."folio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folio_item" ADD CONSTRAINT "folio_item_reverses_item_id_folio_item_id_fk" FOREIGN KEY ("reverses_item_id") REFERENCES "public"."folio_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folio_item" ADD CONSTRAINT "folio_item_staff_user_id_staff_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folio_payment" ADD CONSTRAINT "folio_payment_folio_id_folio_id_fk" FOREIGN KEY ("folio_id") REFERENCES "public"."folio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folio_payment" ADD CONSTRAINT "folio_payment_related_payment_id_folio_payment_id_fk" FOREIGN KEY ("related_payment_id") REFERENCES "public"."folio_payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folio_payment" ADD CONSTRAINT "folio_payment_staff_user_id_staff_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest" ADD CONSTRAINT "guest_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_guest_id_guest_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guest"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_room_type_id_room_type_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_room_unit_id_room_unit_id_fk" FOREIGN KEY ("room_unit_id") REFERENCES "public"."room_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_night" ADD CONSTRAINT "reservation_night_reservation_id_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_block" ADD CONSTRAINT "room_block_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_block" ADD CONSTRAINT "room_block_room_unit_id_room_unit_id_fk" FOREIGN KEY ("room_unit_id") REFERENCES "public"."room_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_block" ADD CONSTRAINT "room_block_created_by_staff_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_inventory_daily" ADD CONSTRAINT "room_inventory_daily_room_type_id_room_type_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_type" ADD CONSTRAINT "room_type_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_unit" ADD CONSTRAINT "room_unit_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_unit" ADD CONSTRAINT "room_unit_room_type_id_room_type_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_staff_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."staff_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_user" ADD CONSTRAINT "staff_user_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_item_property_name_uq" ON "catalog_item" USING btree ("property_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_mapping_type_channel_uq" ON "channel_mapping" USING btree ("room_type_id","channel_name");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_mapping_external_uq" ON "channel_mapping" USING btree ("channel_name","external_room_id");--> statement-breakpoint
CREATE INDEX "channel_outbox_status_idx" ON "channel_outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "folio_reservation_idx" ON "folio" USING btree ("reservation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "folio_one_primary_uq" ON "folio" USING btree ("reservation_id") WHERE "folio"."is_primary";--> statement-breakpoint
CREATE UNIQUE INDEX "folio_one_room_router_uq" ON "folio" USING btree ("reservation_id") WHERE "folio"."receives_room_charges";--> statement-breakpoint
CREATE UNIQUE INDEX "folio_item_reverses_uq" ON "folio_item" USING btree ("reverses_item_id");--> statement-breakpoint
CREATE INDEX "folio_item_folio_idx" ON "folio_item" USING btree ("folio_id");--> statement-breakpoint
CREATE INDEX "folio_item_posted_at_idx" ON "folio_item" USING btree ("posted_at");--> statement-breakpoint
CREATE INDEX "folio_payment_folio_idx" ON "folio_payment" USING btree ("folio_id");--> statement-breakpoint
CREATE UNIQUE INDEX "folio_payment_single_void_uq" ON "folio_payment" USING btree ("related_payment_id") WHERE "folio_payment"."kind" = 'VOID';--> statement-breakpoint
CREATE INDEX "guest_property_last_name_idx" ON "guest" USING btree ("property_id","last_name");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_external_uq" ON "reservation" USING btree ("property_id","source","external_ref") WHERE "reservation"."external_ref" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "reservation_property_check_in_idx" ON "reservation" USING btree ("property_id","check_in");--> statement-breakpoint
CREATE INDEX "reservation_property_status_idx" ON "reservation" USING btree ("property_id","status");--> statement-breakpoint
CREATE INDEX "reservation_night_date_idx" ON "reservation_night" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "room_inventory_daily_type_date_uq" ON "room_inventory_daily" USING btree ("room_type_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "room_type_property_name_uq" ON "room_type" USING btree ("property_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "room_unit_property_number_uq" ON "room_unit" USING btree ("property_id","room_number");--> statement-breakpoint
CREATE INDEX "room_unit_type_idx" ON "room_unit" USING btree ("room_type_id");