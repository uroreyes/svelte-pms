-- Invariants that must hold even if application code is wrong.

-- 1. A physical room can never be allocated to two active reservations on overlapping nights
--    (half-open [check_in, check_out) ranges).
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_room_no_overlap"
	EXCLUDE USING gist ("room_unit_id" WITH =, daterange("check_in", "check_out", '[)') WITH &&)
	WHERE ("room_unit_id" IS NOT NULL AND "status" IN ('CONFIRMED', 'CHECKED_IN'));--> statement-breakpoint

-- 2. Immutable financial audit trail: posted folio lines and payments are append-only.
CREATE OR REPLACE FUNCTION forbid_ledger_mutation() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'Ledger table "%" is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
		USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER folio_item_append_only BEFORE UPDATE OR DELETE ON "folio_item"
	FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();--> statement-breakpoint
CREATE TRIGGER folio_payment_append_only BEFORE UPDATE OR DELETE ON "folio_payment"
	FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();--> statement-breakpoint
CREATE TRIGGER folio_item_no_truncate BEFORE TRUNCATE ON "folio_item"
	FOR EACH STATEMENT EXECUTE FUNCTION forbid_ledger_mutation();--> statement-breakpoint
CREATE TRIGGER folio_payment_no_truncate BEFORE TRUNCATE ON "folio_payment"
	FOR EACH STATEMENT EXECUTE FUNCTION forbid_ledger_mutation();--> statement-breakpoint

-- 3. Inventory can never be oversold silently: sold may exceed allotment only via flagged OTA
--    overbookings, so no CHECK here — the app enforces sold <= available for direct sales.
COMMENT ON COLUMN "room_inventory_daily"."sold_count" IS 'Units consumed by active reservations; remaining = available_count - sold_count';
