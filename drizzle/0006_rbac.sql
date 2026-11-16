ALTER TYPE "public"."staff_role" ADD VALUE 'REVENUE_MANAGER';--> statement-breakpoint
CREATE TABLE "role_permission" (
	"property_id" uuid NOT NULL,
	"role" "staff_role" NOT NULL,
	"permission" text NOT NULL,
	"granted" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permission_property_id_role_permission_pk" PRIMARY KEY("property_id","role","permission"),
	CONSTRAINT "role_permission_not_admin" CHECK ("role_permission"."role" <> 'ADMIN'),
	CONSTRAINT "role_permission_key_format" CHECK ("role_permission"."permission" ~ '^[a-z][A-Za-z]*[.][a-z][A-Za-z]*$')
);
--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;