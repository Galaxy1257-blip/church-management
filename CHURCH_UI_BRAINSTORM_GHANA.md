# ChMS UI Brainstorm — Ghana-Adapted Church Management Interface

Design thinking for the church management platform at `C:\Users\HP\Desktop\church`
(NestJS API + Next.js 15 PWA, plain CSS variables in `apps/web/src/app/globals.css`).
Everything below is written to be **directly implementable** against the existing
routes (`/dashboard /members /services /checkin /visitors /finance /sms /give
/portal /flyers /bible ...`) and existing tokens (`--brand:#1e3a5f`,
`--accent:#2f7d4f`, `--danger:#b3392f`).

---

## 1. Vision & design principles

**"Sunday-ready software."** The app must work in a hot, crowded auditorium with
weak MTN signal, on a 5-year-old Android phone, held by a usher in a queue — and
still feel premium to the head pastor reviewing reports in Accra.

1. **Service Mode first.** The Sunday experience (headcount, check-in, giving,
   run-of-show) is the product's spine. Everything else is administration.
2. **Offline is a status, not an error.** Never a red banner; always a calm
   amber chip: *"Saved on this phone — will sync"*.
3. **Two-thumb operation.** Minimum 48 px targets; primary actions live in the
   bottom third of the screen. Ushers work one-handed.
4. **Low-literacy friendly.** Icon + label everywhere; big-number mode for
   counters; SMS/WhatsApp parity for anything a member must read.
5. **Money is visual and exact.** Integer pesewas underneath; the UI shows
   `GH₵ 1,250.00` with fund colours and a running "count room" ritual.
6. **Ghanaian by content, universal by craft.** Local vocabulary, holidays,
  , and workflows; world-class spacing, hierarchy and motion.
7. **Trust cues on every money screen.** Two-person rule, audit badge, receipt
   numbers — visible, not buried.

## 2. Brand & visual identity

### 2.1 Palette (extends the current globals.css)

```css
:root {
  /* existing tokens stay */
  --brand: #1e3a5f;          /* deep navy — primary chrome */
  --accent: #2f7d4f;         /* green — positive / growth */
  --danger: #b3392f;         /* red — destructive / decline */
  --warn: #9a6b00;

  /* proposed Ghana accents */
  --kente-gold: #e4a11b;     /* highlights, streaks, badges */
  --black-star: #1a1a1a;     /* headlines on gold */
  --clay: #c2571b;           /* terracotta accent for cards */
  --shea: #f6efe3;           /* warm page tint (replaces cold #f5f6f8) */
  --ink-soft: #3d4a5c;

  /* fund colours (used in finance chips & charts) */
  --fund-tithe: #1e3a5f; --fund-offering: #2f7d4f; --fund-building: #e4a11b;
  --fund-welfare: #b3392f; --fund-harvest: #c2571b;
}
```

Rationale: the current navy/green/red already rhyme with the flag's
red/gold/green; adding **kente gold** and a **warm shea background** makes the
product unmistakably Ghanaian without novelty-act colouring. Gold is *accent
only* (≤10% of any screen) — for streaks under headings, active-tab dots, and
the "Harvest thermometer".

### 2.2 Kente & Adinkra as texture, not clip-art

- **Kente strip** (see `assets/placeholders/patterns/kente_stripes.png`): a 12 px
  tall band under the topbar or above page titles. Never a full-bleed background.
- **Adinkra-style geometric marks** (original, generated): use as section
  watermarks at 4–6% opacity behind empty states and login split-screen.
- **Black star** motif: only in "premium" moments — annual report covers, the
  `/flyers` generator, achievement badges ("100 Sundays of perfect attendance").
- Respect note: if a church supplies its *own* cloth patterns or symbols, they
  override defaults per-tenant (branding upload in `/settings`).

### 2.3 Typography

- UI: **system stack first** (current) or bundle *Manrope* / *Poppins* variable
  locally (`font-display: block`) — rounded, friendly, excellent numerals.
- Numbers: tabular figures (`font-variant-numeric: tabular-nums`) on ALL money
  and attendance tables — columns of cedis must align.
- Local language support: bundle **Noto Sans** fallbacks that carry
  `ɔ ɛ ɔ̀ ǹ ŋ` (Twi/Ga/Ewe) for the `/bible` reader and language toggles.
- Scale: 15 px body (current), 13 px labels, 20/28/38 display — keep the current
  rem-based rhythm.

### 2.4 Logo & church branding

- Tenant logo top-left (from `assets/logos/{slug}/` or the generated stand-in
  monogram). Fallback order: real logo → uploaded logo → monogram → initials chip.
- Public `/give` and `/flyers` pages always show the church logo big — that's
  where trust is decided.

## 3. Information architecture

The app currently exposes ~20 routes via grouped topbar dropdowns. On phones
that collapses badly. Proposal: **6 clusters + 1 mode**.

```
┌─ HOME ──────── dashboard, announcements
├─ PEOPLE ────── members, visitors, groups, children, care
├─ SUNDAY ────── services, checkin, roster, drip (follow-up)
├─ MONEY ─────── finance, expenses, campaigns? no → see CONNECT
├─ CONNECT ───── sms, campaigns, drip, events, media
├─ ADMIN ─────── org, branches, settings
└─ SERVICE MODE ─ (full-screen overlay, see §5.1)
```

- **Desktop:** left sidebar with the 6 clusters (collapsible), topbar keeps
  global search + language switch + sync chip + user menu.
- **Mobile (PWA):** bottom bar with 4 items — `Home · People · Sunday · Money` —
  and a **centre raised "Service Mode" button** (the Ghana-WhatsApp-thumb rule:
  the most-used Sunday action must be the easiest to hit).
- `/bible`, `/flyers`, `/portal`, `/give` remain separate "public/utility"
  surfaces reachable from Home quick-actions.

---

## 4. Ghana-specific UX adaptations

### 4.1 Money & Mobile Money

- **Currency everywhere:** `GH₵ 1,250.00`, thousands separators, pesewas
  respected. Input fields accept "1200" and normalise; the classic Ghanaian
  "1.2" = "GH₵ 1.20" trap needs inline helper text.
- **MoMo channel picker** (on `/give` and giving forms) as big coloured tiles:
  `MTN MoMo` (yellow), `Telecel Cash` (red), `AT Money` (blue), `Card`. Show the
  **merchant code + name** on the payment step — feature-phone users dial the
  USSD themselves.
- **USSD fallback card** (from PROPOSED_FEATURES): a printable + shareable card:
  *“No smartphone? Dial `*xxx#` → Merchant ID `123456` → Amount → Reference
  `AKOSUA-1STFRUIT`”*. Render it on-screen AND as an A6 print.
- **Fee gross-up toggle:** “I’ll cover the fee so the church gets GH₵ 100.00”
  — show the exact split (`Gift 100.00 · Fee 1.95 · You pay 101.95`).
- **Give page rhythm:** amount chips (`₵20 ₵50 ₵100 ₵200` + custom), fund chips
  (Tithe / Offering / Building / Harvest / Thanksgiving from `data/funds.json`),
  one field for name & one for phone, receipt SMS promise right under the
  button. Keep it to **one scroll on a 360 px screen**.
- **Finance “count room” flow** encodes the two-person rule as a *ritual UI*:
  two counter slots side-by-side (A and B), comparison diff highlighting,
  approver signs on a separate screen with PIN. Errors like “Counter B differs
  by GH₵ 15.00” get a dedicated reconciliation state, not a toast.

### 4.2 Offline-first & network resilience (the Accra-network rule)

- **Sync chip** in topbar/bottom bar: `✓ All saved` / `↑ 3 pending` / `⏸ Offline`.
  Colour: green / amber / grey (never red — offline is normal here).
- Every mutating action writes to the IndexedDB outbox (already the headcount
  design) → extend the pattern to check-in, visitor registration and count
  entries. Show optimistic rows with a subtle “pending” dot.
- **Data-saver mode** (Settings): skip images on lists, compress uploads to
  ≤ 200 KB, defer non-urgent syncs to Wi-Fi. USSD/SMS stays the fallback channel.
- **Power-cut resilience:** forms keep state after refresh; Service Mode keeps a
  local countdown timer running even if the socket dies.

### 4.3 Low-literacy & language

- **Language switch** (topbar): English / Twi / Ga / Ewe — start with nav labels,
  fund names and service names (“Akawadeɛ” = Offering etc.), machine-assisted,
  reviewed by native speakers. `/bible` already has the local translations.
- **Icon + text labels** on every action; big-number mode for headcount
  (48 px+ numerals, huge +/− pads, one-tap gender/child tabs).
- **Voice-over-2G thinking:** anything critical also goes out as SMS (existing
  dispatcher) — birthday, receipt, service reminder.

### 4.4 Print culture (Ghana churches run on paper)

A `Print` action on: giving receipts, annual giving statements (for diaspora tax
letters), **contribution certificates for businesses**, count sheets, visitor
cards, **funeral donation lists**, **pledge cards**, and the USSD giving card.
A4 with the church logo, QR verification strip, and a signature line —
generated by the existing shared CSV/PDF helpers.

### 4.5 Trust, privacy & roles

- Role chips visible next to names (“Usher — attendance only”).
- Money screens show the audit badge: `Audit chain OK ✓` (nightly verifier).
- Children's check-in keeps matching security codes + allergy alerts (existing),
  presented as a **ticket stub** UI parents can hold.

---

## 5. Screen concepts (wireframes)

### 5.1 Service Mode — the Sunday overlay (full screen, offline-safe)

Activates from the raised centre button. Big type, high contrast, screensaver
resistant (stays awake). Tabs: `Count · Check-in · Run of show · Giving`.

```
┌───────────────────────────────────────────────┐
│ ⬤ Live   Main Worship Service · 2nd Service    │
│          09:00–11:30        ↑ 2 pending  ⏸    │
├───────────────────────────────────────────────┤
│        HEADCOUNT                CHECK-IN       │
│   ┌─────────────┐  ┌─────────────┐             │
│   │ MEN     132 │  │ Search name │ [QR icon]   │
│   │ WOMEN   210 │  │ AKOSUA A. ✓ │             │
│   │ CHILDREN  74 │  │ KOFI M.   ✓ │             │
│   │ VISITORS  18 │  │ + Register visitor        │
│   ├─────────────┤  └─────────────┘             │
│   │ TOTAL   434 │                              │
│   └─────────────┘                              │
│  [ − ]  big pads for one-thumb use  [ + ]      │
├───────────────────────────────────────────────┤
│ RUN OF SHOW          09:42 ▶ Praise & Worship  │
│ 09:00 Praise ███░░ 09:35 Announcements         │
│ 09:45 Sermon  ░░░░ 10:40 Offering · Thanksgiving│
│ 11:00 Communion (1st Sun) · 11:20 Benediction   │
├───────────────────────────────────────────────┤
│ GIVING TODAY    Tithe ₵2,410  Off. ₵1,180      │
│                 Building ₵500  → Open count    │
└───────────────────────────────────────────────┘
```

Ghana touches: service list pre-loaded from `data/service_templates.json`
(incl. the Twi first service and Friday all-night); overflow alert at 85%/95%
capacity (“Open overflow hall — 434/500”); a one-tap **“31 Dec Watchnight”**
preset that switches the run-of-show and thanksgiving fund.

### 5.2 Dashboard — “This Sunday at a glance”

Cards (reorderable per role): attendance trend sparkline (last 8 Sundays),
giving by fund chips, first-timers needing follow-up (with drip stage),
missing-members alert (3+ Sundays absent → welfare task), next-services strip,
Harvest thermometer (gold fill!), SMS wallet balance, and the
audit/quick-backup utilities that already exist. Pastors see roll-ups by
branch; ushers see only Sunday cards.

### 5.3 Members & families

- List rows: initials chip (monogram style), name, phone (`+233 24 …` grouped),
  status dot (active/visitor/inactive), department tag.
- **Household grouping** (“Mensah Household — 5”) because Ghanaian church rolls
  are family-based; bulk actions per household (SMS, transfer letter).
- Profile tabs: Overview · Giving · Attendance · Family · Milestones
  (baptism, wedding, dedication — from the milestones proposal).
- Import flow (existing CSV preview) styled as a 3-step wizard with the seed
  columns from `data/sample_members.csv` as the template download.

### 5.4 Visitors & follow-up

Visitor card = photo/avatar + “brought by …” + service attended + preferred
language. Follow-up timeline (drip) as a vertical stepper: `SMS day 1 → call
day 3 → invite day 7`, with WhatsApp-ready message text. The “first-timer
pew card” becomes a QR the usher scans at the door.

### 5.5 Finance — count room & funds

- **Count sheet ritual**: Service + date + denominations grid (GH₵ 200/100/50/20/
10/5/2/1 + coins + MoMo + cheques) auto-summing in pesewas; Counter A and B
  sheets compared; approver signs; deposit slip photo attach.
- Funds dashboard: coloured fund balances (from `data/funds.json`), by-Sunday
  bars, **remittance panel** (“HQ share 15% — GH₵ 1,830 due, remit by Tue”).
- Expense requests with receipt photos and approval queue — statuses as
  rubber-stamp style chips (Requested / Approved / Paid).

### 5.6 Give page `/give` (public, trust-critical)

Mobile-first, logo large, service name, amount chips, fund chips, MoMo tiles,
“cover the fee” toggle, USSD card link, SMS-receipt promise, and a thank-you
screen with the receipt number. Optional: livestream embed card for diaspora
giving (USD/EUR/GBP display with GHS settlement note).

### 5.7 SMS & campaigns

Composer with segment counter (160 chars/segment — the wallet burn meter),
audience builder (segment chips: Youth, Women, Absent 3+ Sundays, Harvest
pledgers), cost preview in GH₵, STOP/START policy note, and delivery stats as
simple stacked bars. Templates for: service reminder, fasting, funeral
announcement, harvest, birthday (signed by the pastor — existing proposal).

---

## 6. Cultural workflows (the Ghana church year)

These drive seasonal theming, campaign presets and dashboard widgets.

| Season | UI behaviour |
| --- | --- |
| **31 Dec Watchnight / Crossover** | Service Mode preset "Crossover": countdown to midnight, thanksgiving fund chip, live attendance record, photo-booth QR for the congregation |
| **January fasting (21 days)** | Home banner + daily devotional push; fasting pledge tracker; prayer-meeting headcounts count double in engagement metrics |
| **Harvest (Aug–Nov)** | Gold "Harvest thermometer" widget everywhere (target, %, countdown); harvest pledges; printable donation envelopes |
| **Mothering Sunday** (4th Sunday of Lent) | Women's fellowship takeover theme; special thanksgiving fund; family photo printing queue |
| **Funerals & one-week observances** | Bereavement workflow: family record, donation collection sheet (cash + MoMo references), printable donation list for the family, SMS to congregation, attendance register at burial |
| **Outdooring / naming** | Family event card; baby dedication certificate print; gift/welfare record |
| **Weddings & anniversaries** | Banns, certificate prints, anniversary SMS (pastor-signed) |
| **Easter convention / revivals** | Multi-day event pages with speaker cards, registration + bus seat booking |

Empty states can borrow the cached Ghana imagery (kente band, black star,
chapel photo) instead of generic grey boxes.

## 7. Component inventory & design system

Building blocks (all compatible with the current CSS-variable setup — no
Tailwind migration required):

- **Chip** variants: status (green/amber/grey), fund-coloured, role, language.
- **StatCard** with sparkline slot + big tabular number + delta arrow.
- **MoneyInput** (pesewa-aware), **AmountChips**, **FundPicker**, **ChannelTiles**.
- **SyncChip** (offline status), **AuditBadge**, **PendingDot** row marker.
- **CountSheetGrid** (denomination matrix, auto-sum), **SignOffStep** (PIN pad).
- **RunOfShowTimeline** (live highlight, drag-reorder for planners).
- **Thermometer** (fundraising progress, gold fill).
- **TicketStub** (children's check-in codes, USSD card).
- **BigPad** (huge ± counter for headcount), **SearchWithQR**.
- **LocalisedLabel** (EN/Twi/Ga/Ewe dictionary lookup).
- **PrintButton** (routes to A4/A6 templates with logo + QR verification).

Motion: subtle only — 150 ms fades, sheet slides, thermometer fill on load.
No autoplaying anything; church phones are on metered data.

## 8. Data visualisation

- **Attendance:** 8-Sunday sparkline + stacked bands (men/women/children/visitors);
  "missing members" as a small waffle grid (each dot a member, 3+ absences amber).
- **Giving:** by-fund stacked bars, by-Sunday line, MoMo-vs-cash split donut;
  remittance waterfall for branch→HQ.
- **SMS:** segments sent vs delivered vs failed stacked bars; wallet burn meter.
- Colour-blind-safe: never colour alone — always pattern/label pairing (fund
  chips carry abbreviations; waffle dots carry counts).

## 9. Accessibility & device strategy

- Contrast: all text pairs ≥ 4.5:1 on both `--shea` light and a future dark mode
  (navy `#1e3a5f` chrome works in both).
- Tap targets ≥ 48 px; Service Mode ≥ 64 px.
- Test matrix: 360×640 (Tecno/Itel class), 390×844, 412×915, tablet (ushers'
  desk), 1280+ desktop (pastor/office).
- PWA installability + Add-to-Home-Screen prompt after first login (most users
  will live in the installed shell).
- USSD + SMS parity for: giving instructions, receipts, service reminders,
  balance queries (wallet), STOP/START — because feature phones are real here.
- Voice note in WhatsApp is the de-facto support channel: the help page should
  publish the church's WhatsApp number with a click-to-chat link.

## 10. Where the downloaded assets plug in

| Cache folder | UI usage |
| --- | --- |
| `assets/logos/{church}/` | Tenant branding: topbar, `/give`, `/portal`, prints, flyers |
| `assets/photos/churches/` | Onboarding church picker, branch cards, report covers |
| `assets/artifacts/**` | Onboarding illustrations (bible = Bible study event, communion = ordinance, drums = choir, offering = finance, bus = transport module, funeral = bereavement workflow) |
| `assets/ghana/**` | Login split-screen, empty states, event covers (kente, black star, cities) |
| `assets/placeholders/patterns/` | Header bands, card textures, flyer backgrounds |
| `assets/placeholders/icons/` | Nav + module icons (currentColor, themeable) |
| `assets/placeholders/logos/` | Fallback tenant logos (original monograms — safe to ship) |

Attribution for CC-BY files lives in `assets/manifest.csv` — surface it in
`/settings › About › Asset credits` for public deployments.

## 11. Suggested build order (maps to the existing codebase)

1. **Design tokens + chips + cards** (extend `globals.css`; no route changes).
2. **Service Mode overlay** (wraps existing headcount + check-in + sync outbox).
3. **Give page refresh** (channel tiles, fund chips, fee toggle, USSD card).
4. **Count-room flow** (two-counter + approver screens around existing batches).
5. **Household view + missing-member widget** (uses existing attendance data).
6. **Seasonal presets** (Harvest thermometer, Crossover, funerals).
7. **Language toggle + print templates**.
8. **Asset-credits page + branding upload**.

Quick wins that need almost no backend: Service Mode big pads, sync chip,
fund colour chips, USSD printable card, Harvest thermometer, monogram fallback
logos (already generated in `assets/placeholders/logos/`).