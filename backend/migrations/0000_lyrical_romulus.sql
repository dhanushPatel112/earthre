CREATE TABLE "health_check_observations" (
	"id" serial PRIMARY KEY NOT NULL,
	"upload_id" integer NOT NULL,
	"service_id" integer NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"status_code" integer NOT NULL,
	"latency_ms" numeric,
	"agent" text NOT NULL,
	"region" text NOT NULL,
	"is_available" boolean NOT NULL,
	"quality_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" serial PRIMARY KEY NOT NULL,
	"original_filename" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"total_source_rows" integer DEFAULT 0 NOT NULL,
	"total_cleaned_rows" integer DEFAULT 0 NOT NULL,
	"total_duplicate_rows" integer DEFAULT 0 NOT NULL,
	"total_quality_issues" integer DEFAULT 0 NOT NULL,
	"dataset_start" timestamp with time zone,
	"dataset_end" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL
);
