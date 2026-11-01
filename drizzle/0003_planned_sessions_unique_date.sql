DROP INDEX "planned_sessions_date_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "planned_sessions_date_unique" ON "planned_sessions" USING btree ("date");