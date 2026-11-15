-- 18_push_members: web-push subscriptions can belong to a staff account OR a
-- portal member. A member subscribes from the phone companion, so the actor is
-- a Member (not a User); one column of the two is set.
ALTER TABLE "PushSubscription" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "PushSubscription" ADD COLUMN IF NOT EXISTS "memberId" UUID;
CREATE INDEX IF NOT EXISTS "PushSubscription_churchId_memberId_idx" ON "PushSubscription" ("churchId", "memberId");
