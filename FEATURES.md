# ChMS - Church Management System: Complete Features Specification

A modern, full-stack, enterprise-grade Church Management System tailored for African and international churches, featuring offline-first Sunday operations, Paystack Mobile Money integration, automated SMS/WhatsApp drip workflows, and multilingual Scripture support.

---

## 1. Executive Overview & Architecture

* **Multi-Tenant with Strict Isolation**: Enforces PostgreSQL Row-Level Security (RLS) per church tenant. One church can never access another church's records.
* **Modern Hybrid Cloud & Local Capability**:
  * **Frontend**: Next.js 15 App Router Progressive Web App (PWA) with responsive design for desktop, tablet, and mobile.
  * **Backend**: NestJS 11 modular TypeScript API with JWT token rotation and default-deny permission gates.
  * **Database**: PostgreSQL 16 (with custom migrations, triggers, audit logging, and RLS roles).
  * **Queues**: Redis & BullMQ for reliable asynchronous tasks, SMS dispatches, and drip timelines.
  * **Offline Sync**: Dexie-backed indexed storage with `/sync/batch` conflict resolution for unstable connectivity.

---

## 2. Membership & People Management

* **Complete Member Profiles**: Full demographic tracking including full name, phone (Ghana E.164 normalized), email, date of birth, gender, marital status, residential address, digital address, and profession.
* **Member Lifecycle & Statuses**: Track members across life stages (*First-Timer*, *New Convert*, *Active Member*, *Inactive*, *Transferred*).
* **Tagging & Dynamic Segmentation**: Tag members by interest, age bracket, ministry, or custom labels for targeted follow-up and bulk messaging.
* **CSV Bulk Import**: Smart CSV importer with duplicate phone detection, dry-run validation, and downloadable error files.
* **Household & Family Grouping**: Group family members under a single household with designated heads of household and emergency contacts.

---

## 3. Sunday Services & Usher Attendance (Offline-First)

* **Service Management**: Schedule Sunday services, mid-week services, vigils, and conferences with customizable service templates.
* **Automatic Sunday Service**: the week's service creates itself, opens check-in at the starting time and closes it at the ending time — Sunday 07:30–12:00 out of the box, with any Sunday ticked "no church" so nothing opens and nobody is counted. Nobody has to press Start.
* **Offline-First Usher Headcount**:
  * Ushers can count attendance section-by-section (Men, Women, Children, Visitors, Online).
  * Works 100% offline in airplane mode or during network outages using local client outbox queues; auto-syncs when signal returns.
* **Member Check-In**: Quick search or QR code scanning for verified physical attendance tracking.
* **Real-time Attendance Analytics**: Compare weekly attendance patterns, service-by-service breakdowns, and seasonal attendance trends.

---

## 4. Digital Giving & Paystack Mobile Money

* **Ghana Mobile Money (MoMo) & Card Processing**: Native integration with Paystack supporting MTN MoMo, Telecel Cash, AT Money, Visa, and Mastercard.
* **Pesewa-Level Financial Precision**: All transactions handled in integer minor currency units (pesewas/cents) to eliminate floating-point rounding errors.
* **Public Giving Portal (`/give`)**: Clean, mobile-friendly giving page for members and diaspora supporters with zero app login required.
* **Designated Funds**: Direct giving to Tithes, General Offering, Building Projects, Missions, Thanksgiving, or Pastor's Appreciation.
* **Fee Gross-Up Option**: Donors can choose to absorb processing fees so the church receives the exact intended donation amount.
* **Instant Automated Receipts**: Automatic SMS and email receipts dispatched via secure HMAC webhooks with compare-and-set idempotency.

---

## 5. Finance, Pledges & Expense Management

* **Multi-Fund Ledger**: Real-time balances and tracking across operating funds, capital accounts, and mission funds.
* **Cash & Cheque Batch Counting**: Dual-counter sign-off and separate supervisor approval workflow for Sunday physical collections.
* **Pledges & Capital Campaigns**: Set target amounts, track fulfillment milestones, and send automated pledge reminder messages.
* **Expense Tracking & Approval Workflow**:
  * Submit department expense requests with digital receipt attachments.
  * Multi-tier approval workflow (*Pending*, *Approved*, *Rejected*, *Disbursed*).
* **Audit Logs**: Tamper-evident ledger tracking for all financial modifications, adjustments, and approvals.

---

## 6. Smart SMS & Communication Engine

* **Multi-Gateway Adapter**: Native support for Ghana SMS providers (cSMS V3, Hubtel, Arkesel) with automatic fallback and local sandbox mock modes.
* **Sender ID Management**: Send branded SMS under the church's registered Sender ID.
* **SMS Credit Wallet & Ledger**: Real-time SMS balance tracking, usage history, threshold alerts (500 / 100 / 0 credits), and online Paystack credit top-up.
* **Personalized SMS Templates**: Dynamic placeholder tags (`{{name}}`, `{{church}}`, `{{service_time}}`, `{{pledge_balance}}`).
* **Opt-Out Compliance**: Automatic unsubscribe keyword (`STOP`) processing to respect recipient preferences.
* **Delivery Reports (DLR)**: Live tracking of sent, delivered, undelivered, and failed SMS messages.

---

## 7. Automated Follow-Up & Drip Retention Workflows

* **Visual Workflow Builder**: Multi-step automated sequences triggered upon visitor intake or salvation commitments.
* **Scheduled Timeline Steps**: Deliver welcome messages, check-in prompts, invitations, and devotional content over days or weeks.
* **Quiet Hours Guard**: Prevents messages from sending during late-night hours; automatically queues them for delivery the next morning.
* **Two-Way Reply Tracking**: Automatically halts automated follow-ups when a visitor responds, instantly assigning a follow-up pastor or worker.
* **Care Tasks**: Automatically generates follow-up phone call and home visit tasks for the visitation team.

---

## 8. Pastoral Care, Counseling & Prayer Wall

* **Pastoral Counseling Records**: Encrypted counseling session logs restricted to authorized pastoral staff.
* **Who Sees Care**: the Care area is switched on per church in Settings and opens only for ushers and Sunday School teachers. An usher sees the whole church queue; a teacher sees only the class assigned to them in the office — their own children's visits, tasks and counselling notes, and nothing about anyone else. A teacher with no class assigned yet sees an empty list, not the church. Welfare and moderation stay closed to them.
* **Interactive Prayer Wall**: Collect prayer requests from members and the public with moderation tools (*Public*, *Ministry-Only*, *Private*).
* **Welfare & Compassion Ministry**: Record and track welfare requests, benevolent fund disbursements, and support cases.
* **Hospital & Home Visitation Tracking**: Assign visitors, log visit outcomes, and schedule reminders.

---

## 9. Children’s Ministry & Dual-Ticket Security Check-In

* **Dual-Ticket Security Check-In**: Generates matching physical/digital security pickup codes for child and parent.
* **Secure Child Checkout**: Verifies child pickup against parent credentials and emergency contact authorization.
* **Medical & Allergy Alerts**: Highlight allergies, dietary restrictions, and special medical conditions on check-in tags.
* **Room Capacity & Ratios**: Track child-to-teacher safety ratios in Sunday school classrooms.

---

## 10. Groups, Cells & Fellowships

* **Cell / Small Group Network**: Organize church members into home cells, fellowships, and ministry departments.
* **Leader Portals**: Cell leaders can view their rosters, record weekly meeting attendance, and submit group reports.
* **Geographical Mapping**: Group branches and cell zones by neighborhood or digital address.

---

## 11. Volunteer Rosters & Ministry Duty Scheduling

* **Ministry Scheduling**: Schedule worship team, ushers, tech crew, media team, and children's workers for upcoming services.
* **RSVP Confirmation**: Automated SMS/WhatsApp notifications allowing volunteers to confirm (*YES*) or decline (*NO*) shifts.
* **Conflict & Over-Scheduling Detection**: Alerts if a volunteer is assigned to overlapping roles or services.
* **Substitute Matching**: One-click reassignment to pre-qualified backups when a volunteer declines.

---

## 12. Events, RSVPs & Calendars

* **Church Event Calendar**: Schedule conferences, revivals, retreats, workshops, and youth events.
* **Public & Member RSVP**: Track event registrations, seat reservations, and meal preferences.
* **Ticket & Badge Generation**: Issue digital confirmation passes for special entrance events.

---

## 13. Worship Planning (removed)

* The media archive, song library and setlist pages were deleted: no church in the demo used them,
  and they were the reason the Worship area looked crowded on day one. Sermon audio, videos and
  orders of service now go out as **News** announcements instead.

---

## 14. Multilingual Offline Scripture / Bible Companion

* **Multi-Translation Engine**: Built-in offline Scripture reader and cross-reference search engine (`/bible`).
* **Pre-bundled Translations**:
  * **English**: King James Version (KJV), American Standard Version (ASV).
  * **Akuapem Twi**: Full 66-book Old and New Testament with phonetic characters (`ɔ`, `ɛ`).
  * **Asante Twi**: Complete 66 books, 1,189 chapters, 31,102 verses.
  * **Fante**: Complete 66 books, 31,051 verses.
  * **Ga**: Complete 66 books, 31,090 verses.
  * **Ewe**: Complete 66 books, local translation.
* **Search & Copy**: Chapter-by-chapter reading, keyword search across all local translations, and one-click copy verse references.

---

## 15. Public Outreach, Flyers & Member Self-Service Portal

* **Social Media Flyer Generator (`/flyers`)**: Instantly generate clean, branded service announcement graphics and sermon flyers.
* **Public Visitor Registration (`/public/:slug/visitors`)**: QR code link on flyers allowing first-time guests to register from their phones upon arrival.
* **Member Self-Service Portal (`/portal`)**:
  * Passwordless phone OTP login.
  * View personal giving history and download official annual tax statements (PDF).
  * View assigned volunteer shifts and RSVP to church events.
  * Submit prayer requests and update personal contact information.

---

## 16. Multi-Branch & Denominational Hierarchy

* **Multi-Campus / Multi-Branch Management**: Centralized headquarters oversight with branch-level operational autonomy.
* **Member Branch Transfers**: Seamless transfer of member history, giving records, and pastoral notes between church campuses.
* **Role-Based Access Control (RBAC)**: Fine-grained permissions (*Super Admin*, *Branch Pastor*, *Finance Admin*, *Usher Lead*, *Counselor*, *Media Volunteer*).
