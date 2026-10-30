-- 6_password_reset: OTP challenges are tagged with the flow that sent them, so
-- a sign-in code cannot be redeemed as a password-reset code (and vice versa).
ALTER TABLE "OtpChallenge" ADD COLUMN IF NOT EXISTS "purpose" TEXT NOT NULL DEFAULT 'login';
