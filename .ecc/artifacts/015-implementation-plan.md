# 015 — Implementation Plan: Fix All Non-Auth / Non-Paystack Audit Findings

## Requirements
Fix all actionable bugs, broken UI flows, and missing worker/API wiring identified in the full application audit (excluding Auth/Login and Paystack WIP areas):

1. **Roster shift assignment (`roster/page.tsx` + `roster.module.ts`)**
   - `RosterShift.groupId` is non-null UUID in `schema.prisma`, and `ShiftDto` requires `groupId`.
   - Update `RosterPage` to fetch `/groups`, provide a Group/Department select, and replace raw `Member ID` input with a shared `MemberPicker` component.
   - If a church has no groups yet or `departments` is off, show a clear inline message or fallback.

2. **Portal OTP SMS dispatch (`apps/api/src/portal/portal.module.ts`)**
   - Import `SmsModule` in `PortalModule` and inject `SmsDispatcher` into `PortalService`.
   - Replace the manual `smsWallet` / `smsLedger` / `smsLog` code in `requestOtp()` with `this.sms.dispatch(tx, ...)` + `this.sms.flush(outcome)` after the transaction commits.
   - Ensures immediate BullMQ enqueueing, `SmsLedger.refId` backfill, `SmsOptOut` check, and compliance with Ground Rule 4 (ONE SMS dispatcher).

3. **Counseling "Share with" (`apps/api/src/ministry/care.module.ts` + `apps/web/src/app/(app)/counseling/page.tsx`)**
   - Add `GET /counseling/colleagues` (`@RequirePermissions('care:write')`) returning active staff users (`{ id, name }[]`) in the church (excluding the caller).
   - Update `CounselingPage` to let the user toggle/select staff colleagues by name instead of typing raw `"member IDs"`.

4. **Shared `MemberPicker` & Households Linking (`apps/web/src/components/member-picker.tsx` + `campaigns/page.tsx`, `org/page.tsx`, `care/page.tsx`, `roster/page.tsx`)**
   - Create one shared `MemberPicker` component (`apps/web/src/components/member-picker.tsx`) that searches `/members?q=...&pageSize=20` and lets staff pick a member by name/memberNo (no raw UUID typing).
   - Wire `MemberPicker` into:
     - `roster/page.tsx` (assign shift)
     - `campaigns/page.tsx` (add pledge)
     - `org/page.tsx` (transfer request + household head)
     - `care/page.tsx` (non-class-scoped care tasks)
   - On `org/page.tsx`, add a UI to link additional members to an existing household via `POST /households/:id/link`.

5. **Scheduled SMS Campaigns Worker Dispatch (`apps/worker/src/sms-campaigns.ts`, `apps/worker/src/maintenance.ts`, `apps/worker/src/main.ts`, `apps/web/src/app/(app)/sms/page.tsx`)**
   - Add `processScheduledSmsCampaigns()` in `apps/worker/src/sms-campaigns.ts` (invoked by `maintenance.ts` on `campaign-schedule` every minute in `main.ts`).
   - Polls `SmsCampaign` where `status = 'SCHEDULED'` and `scheduledAt <= now`, checks church quiet hours (defers if blocked), atomically claims `SCHEDULED -> SENDING`, resolves consented/non-opted-out audience, reserves wallet units, creates `SmsLog` + `SmsLedger`, and enqueues to `campaign-send`.
   - Add optional `scheduledAt` datetime picker to `apps/web/src/app/(app)/sms/page.tsx` so staff can either Send now or Schedule for later.

6. **Minor Guard & Config Cleanups**
   - `apps/api/src/ministry/whatsapp.module.ts`: add `@ForModule('reach')` on `WhatsAppController`.
   - `.env.example`: document optional `TURNSTILE_SECRET_KEY=` and `VAPID_*` vars.

## Risks
- `PortalService.requestOtp()` signature/behavior: ensure `outcome` is flushed *after* `withTenant` commits, and existing portal tests still pass.
- `MemberPicker` on pages where a role might not have `members:read` (e.g., Sunday School teacher on `care/page.tsx`): `care/page.tsx` already branches on `classScoped` and uses `/care/class` for teachers, so `MemberPicker` is only rendered when `canOpenProfile` (`members:read`) is true.
- `processScheduledSmsCampaigns()` concurrency: use atomic `updateMany({ where: { id, status: 'SCHEDULED' }, data: { status: 'SENDING' } })` so overlapping ticks cannot double-fan-out.

## Exact Files
- `apps/api/src/portal/portal.module.ts`
- `apps/api/src/ministry/care.module.ts`
- `apps/api/src/ministry/whatsapp.module.ts`
- `apps/worker/src/sms-campaigns.ts` (new)
- `apps/worker/src/maintenance.ts`
- `apps/worker/src/main.ts`
- `apps/web/src/components/member-picker.tsx` (new)
- `apps/web/src/app/(app)/roster/page.tsx`
- `apps/web/src/app/(app)/campaigns/page.tsx`
- `apps/web/src/app/(app)/org/page.tsx`
- `apps/web/src/app/(app)/care/page.tsx`
- `apps/web/src/app/(app)/counseling/page.tsx`
- `apps/web/src/app/(app)/sms/page.tsx`
- `.env.example`

## Verification Plan
- Unit tests in `apps/api` (`vitest`) and `apps/worker` (`vitest`), including new unit tests for `processScheduledSmsCampaigns`.
- Workspace `typecheck`, `lint`, and `npm run check:secrets`.
