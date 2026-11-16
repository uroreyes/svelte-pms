ALTER TABLE "staff_user" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_user" ADD COLUMN "is_system" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "staff_user" SET "is_system" = true, "active" = false WHERE "email" LIKE 'night-audit@%';--> statement-breakpoint
ALTER TABLE "staff_user" ADD CONSTRAINT "staff_user_system_inactive" CHECK (NOT "staff_user"."is_system" OR NOT "staff_user"."active");--> statement-breakpoint
UPDATE "staff_user" SET "email" = lower("email") WHERE "email" <> lower("email");--> statement-breakpoint
ALTER TABLE "staff_user" ADD CONSTRAINT "staff_user_email_lower" CHECK ("staff_user"."email" = lower("staff_user"."email"));