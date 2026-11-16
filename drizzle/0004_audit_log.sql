CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid,
	"actor_user_id" uuid,
	"actor_label" text NOT NULL,
	"command" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"reservation_id" uuid,
	"input" jsonb NOT NULL,
	"result" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_user_id_staff_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_reservation_id_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_event_property_time_idx" ON "audit_event" USING btree ("property_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_event_reservation_idx" ON "audit_event" USING btree ("reservation_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_event_actor_idx" ON "audit_event" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
-- Audit trail is append-only, like the financial ledger.
CREATE TRIGGER audit_event_append_only BEFORE UPDATE OR DELETE ON "audit_event"
	FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();--> statement-breakpoint
CREATE TRIGGER audit_event_no_truncate BEFORE TRUNCATE ON "audit_event"
	FOR EACH STATEMENT EXECUTE FUNCTION forbid_ledger_mutation();
