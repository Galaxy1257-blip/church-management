-- 5_onboarder: a third staff role. Onboarders set up and support churches
-- (profile, modules, people, imports, custom features) but cannot touch money,
-- create churches or manage the office team — those stay OWNER-only.
ALTER TYPE "PlatformRole" ADD VALUE IF NOT EXISTS 'ONBOARDER';
