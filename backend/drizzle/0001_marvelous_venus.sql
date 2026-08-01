ALTER TABLE "sessions" ADD COLUMN "label" text;--> statement-breakpoint
CREATE INDEX "idx_agents_created_by" ON "agents" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_user_id" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_agent_user" ON "sessions" USING btree ("agent_id","user_id");