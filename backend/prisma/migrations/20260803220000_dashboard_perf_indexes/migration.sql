-- Hot-path indexes for dashboard / analysis performance
CREATE INDEX IF NOT EXISTS "production_plans_deletedAt_productionDate_idx"
  ON "production_plans" ("deletedAt", "productionDate");

CREATE INDEX IF NOT EXISTS "production_plans_plantId_deletedAt_productionDate_idx"
  ON "production_plans" ("plantId", "deletedAt", "productionDate");

CREATE INDEX IF NOT EXISTS "production_entries_planId_deletedAt_status_idx"
  ON "production_entries" ("planId", "deletedAt", "status");

CREATE INDEX IF NOT EXISTS "downtime_entries_planId_deletedAt_idx"
  ON "downtime_entries" ("planId", "deletedAt");

CREATE INDEX IF NOT EXISTS "changeover_entries_planId_deletedAt_idx"
  ON "changeover_entries" ("planId", "deletedAt");

CREATE INDEX IF NOT EXISTS "changeover_entries_lineId_productionDate_deletedAt_idx"
  ON "changeover_entries" ("lineId", "productionDate", "deletedAt");

CREATE INDEX IF NOT EXISTS "notifications_userId_isRead_idx"
  ON "notifications" ("userId", "isRead");
