# ChMS UI Brainstorm — Adapting the Interface to Ghana

A design exploration for the Church Management System at
`C:\Users\HP\Desktop\church` (NestJS API + Next.js PWA). It builds on the
current token set in `apps/web/src/app/globals.css`
(`--brand #1e3a5f`, `--accent #2f7d4f`, `--danger #b3392f`, `--warn #9a6b00`)
and proposes how the product should look, feel and behave **for Ghanaian
churches specifically** — from a ushers' phone in a Kumasi auditorium with no
network, to an accounts officer reconciling MoMo on Monday morning.

Companion material: `church-asset-kit/` (scraper cache + generated art +
seed data) supplies the imagery and demo data referenced throughout.

---

## 1. Design Philosophy: "Sunday-proof, Ghana-flavoured, frugal"

1. **Sunday-proof** — the busiest day has the weakest network. Every
   operational screen (headcount, check-in, offering count) must be usable
   offline-first and thumb-first.
2. **Ghana-flavoured, not Ghana-cluttered** — warmth and identity come from a
   few confident cues (black star, kente accent strip, cedi typography),
   never from clip-art overload. Denominations vary widely; the theme must
   feel at home in both a Presbyterian chapel and a charismatic auditorium.
3. **Frugal** — low-end Android phones (2–4 GB RAM), metered data, shared
   devices. Fast, small bundles, image placeholders instead of hero photos on
   cellular, SMS as a first-class channel alongside push.

---

## 2. Visual Identity

### 2.1 Palette (extends existing tokens)

| Token | Hex | Use |
|---|---|---|
| `--brand` (keep) | `#1e3a5f` | Deep navy — topbar, primary buttons (already in codebase) |
| `--accent` (keep) | `#2f7d4f` | Forest green — success, growth, "synced" |
| `--danger` (keep) | `#b3392f` | Terracotta red — alerts, declines |
| `--warn` (keep) | `#9a6b00` | Ochre — pending sync, low stock |
| `--gold` *(new)* | `#f6c93e` | Kente gold — highlights, stars, "Harvest" mode |
| `--star` *(new)* | `#161c24` | Black-star ink — headings, icons |
| `--kente-red` *(new)* | `#ba202e` | Ghana-flag red — sparingly, event badges |
| `--momo` *(new)* | `#ffcc00` | MoMo-yellow affordance for MTN MoMo CTAs (do not imitate brand logos) |

Rules: navy + white dominate; gold is an *accent of celebration* (milestones,
harvest totals, birthdays); kente-red only for flag moments (independence
events, national holidays). Dark mode optional later — most church offices
work in bright daylight; prioritize **contrast ≥ 4.5:1** for outdoor use.

### 2.2 The Kente Strip (signature component)

A 6–8 px horizontal woven band (generated in
`assets/placeholders/banners/kente-banner.png`) used as:

* a divider under page headers,
* the top edge of "celebration" cards (birthdays, anniversaries, harvest),
* the loading skeleton accent (gold stripe shimmer).

Never behind body text. One strip per screen is enough.

### 2.3 Black-star motif

The five-pointed star is the strongest Ghanaian signifier. Use it as:
* the logo anchor in the tenant's monogram placeholder
  (`assets/placeholders/logos/*.png` — already generated for 22 denominations),
* a rating glyph in volunteer/attendance streaks ("5-star usher month"),
* the bullet marker for milestones (baptism, wedding, dedication).

### 2.4 Typography

* **UI font:** the current `system-ui` stack is fine and free; if a brand font
  is ever added, bundle it locally (PWA must work offline).
* **Names & Twi:** ensure the font stack covers `ɔ ɛ Ɔ Ɛ ŋ` (Akan/Ewe) —
  Noto Sans (subset) is the safe choice; test `Kwabena`, `Ɔpanin`, `Dzidzor`.
* **Money:** tabular numerals (`font-variant-numeric: tabular-nums`) in every
  finance table so pesewa columns align. Format `GH₵ 1,250.00`; always store
  integer pesewas.

### 2.5 Photography & imagery rules

Use the scraped cache (`assets/` from `church-asset-kit/scraper.py`) for
onboarding, empty states and flyer templates:

| Cache category | Where it shines |
|---|---|
| `ghana_worship_scenes` | Login hero, onboarding carousel, dashboard greeting |
| `ghana_church_buildings` | Branch cards, property register, tenant picker |
| `church_artifacts` | Asset/equipment register thumbnails, offering UI illustrations |
| `ghana_culture_ui` | Theme backgrounds (kente, adinkra), event flyers |
| `ghana_church_events` | Calendar cards (harvest, funeral, wedding, watchnight) |
| `ghana_church_mark` | Dev/demo tenant logos (trademark-safe placeholders in prod) |

---

## 3. Ghana-Adapted UX Patterns

### 3.1 Mobile Money as a first-class flow

Giving is the emotional centre of the product. The give flow (`/give/[slug]`):

* **Channel picker first:** big tappable tiles — *MTN MoMo · Telecel Cash ·
  AT Money · Card · Bank*. Colour-code tiles (yellow/orange/green) but keep
  text labels; network logos can change.
* **Phone-number autofill:** accept `024…`, `+23324…`, `23324…` and normalise
  (the API already has `normalizeGhPhone` — mirror its rules in the UI).
* **Fee gross-up toggle:** "Cover the charge (GH₵ 0.75) so the church receives
  GH₵ 100.00" — one switch, plain-language explanation.
* **Prompt-screen copy:** after submitting, show the exact prompt the member
  will see on their phone ("Approve the prompt on your phone… enter PIN…")
  with a live countdown and a *Resend prompt* button.
* **Offline giving fallback card:** printable USSD/instruction card
  (merchant code + steps in Twi/English) for non-smartphone givers — the
  manual MoMo/cash entry module captures those gifts later.

### 3.2 Offline-first by default (the "Ushers' Mode")

* **Sync chip everywhere:** `● Saved on phone (3 pending)` → `⟳ Syncing` →
  `✓ Synced 12:04`. Same chip component on headcount, check-in, visitors.
* **Outbox drawer:** swipe-up sheet listing queued actions with retry/skip.
  Never a full-screen error for a queue issue.
* **Last-known totals:** headcount totals show cached numbers with an
  "as of 09:40" watermark when offline.
* **Optimistic counters:** men/women/children/visitors big +/- keypads that
  respond instantly; batching happens later (`POST /sync/batch` already does
  uuidv7 idempotency).

### 3.3 Low-literacy & big-thumb design

* Ushers' screens: **icons + large numerals**, minimal prose; targets ≥ 56 px.
* Number pads instead of dropdowns for counts and amounts.
* Every status is colour **and** shape **and** word (never colour alone).
* Optional pictorial onboarding: one idea per screen, local photos from the
  asset cache, "Tap here" with a pulsing ring.

### 3.4 Language strategy

* EN default; **Twi/Akan, Ga, Ewe, Dagbani** string packs for member-facing
  surfaces first (give page, portal, SMS templates, check-in prompts) — where
  it matters most to congregants. Admin UI can stay English-heavy.
* Bilingual SMS templates with `{{lang}}` interpolation ("Akwaaba! …").
* The existing multilingual Bible module (`/bible`) sets the precedent: keep
  book/chapter pickers language-aware.

### 3.5 Power & network realities

* **Data-saver mode** (auto on 2G/3G): text-first lists, thumbnails lazy,
  photos only on Wi-Fi — a toggle in Settings with an auto default.
* **Long-press to preview** instead of loading full images eagerly.
* **SMS fallback for everything important:** confirmations, receipts and
  reminders must work via SMS even when WhatsApp/push doesn't.
* Session resume: log users back into the exact screen after a reload —
  cheap with URL state, priceless on flaky connections.

---

## 4. Information Architecture

Current modules map cleanly into five nav groups (desktop mega-menu /
mobile bottom sheet):

```
🏠 Home        Dashboard · Sunday Service Mode · Announcements
👥 People      Members · Families · Visitors · Children · Groups/Cells · Care
📅 Church      Services · Events · Rosters · Calendar · Milestones
💰 Finance     Giving · Cash & Counting · Expenses · Pledges · Reports
⚙️ Admin       Branches · SMS & Campaigns · Drip · Settings · Org · Audit
```

* **"Sunday Service Mode"** is a special state, not a page: one tap turns the
  app into a large-tile operational console (headcount, check-in, visitors,
  offering) with everything else hidden until service closes.
* Mobile bottom nav: 4 items + center **Service** FAB (gold ring) — reachable
  with one thumb while holding a count sheet.

---

## 5. Key Screens (ASCII wireframes)

### 5.1 Dashboard — "Akwaaba, Pastor Kofi" (desktop)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ▓ kente-strip                                                            │
│ [CHMS  ★]  Grace Chapel · Adenta        🔍 search     [Service Mode] 👤  │
├──────────────────────────────────────────────────────────────────────────┤
│ Good morning, Pastor Kofi        Sun 12 Jul · 2nd Service (Twi) 10:00    │
│                                                                        │
│ ┌─This Sunday───────┐ ┌─Giving (July)────────┐ ┌─Follow-up────────────┐ │
│ │ ▁▂▃ attendance    │ │ GH₵ 48,250  (+12%)   │ │ ⚠ 14 missing 3+ wks  │ │
│ │ 412 / 520 seats   │ │ [gold kente progress]│ │ 💌 6 first-timers     │ │
│ │ ● synced 09:40    │ │ Harvest GH₵ 62k/100k │ │ → Open care queue     │ │
│ └───────────────────┘ └──────────────────────┘ └──────────────────────┘ │
│ ┌─Quick actions───────────────────────────────────────────────────────┐  │
│ │ [+ Headcount] [+ Check-in] [Count cash] [Send SMS] [Add visitor]    │  │
│ └────────────────────────────────────────────────────────────────────┘  │
│ ┌─Today in church──────────────┐ ┌─Birthdays 🎂 (kente top)──────────┐  │
│ │ 07:00 1st Service  ✓ closed  │ │ Ama Mensah · Kwabena Osei · +3     │  │
│ │ 10:00 2nd Service  ● open    │ │ [Send wishes →]                    │  │
│ │ 14:00 Choir rehearsal        │ └────────────────────────────────────┘  │
│ └──────────────────────────────┘                                        │
└──────────────────────────────────────────────────────────────────────────┘
```

Notes: attendance sparkline uses green; harvest thermometer uses gold;
"missing members" alert card is the single most valuable retention feature —
give it a permanent slot.

### 5.2 Sunday Service Mode (mobile, landscape-friendly)

```
┌────────────────────────────┐   Principles:
│ ◀ SERVICE MODE      ● 2/4  │   • four big tiles, one job each
│                            │   • counters work 100% offline
│ ┌─────────┐ ┌─────────┐   │   • each tile shows its sync state
│ │ HEADCOUNT│ │ CHECK-IN │   │   • huge numerals (men/women/children/
│ │   412    │ │   233    │   │     visitors) with +/− steppers
│ │ +   −    │ │ QR / name│   │   • "offering" tile opens the two-person
│ └─────────┘ └─────────┘   │     count sheet (see 5.4)
│ ┌─────────┐ ┌─────────┐   │
│ │ VISITORS│ │ OFFERING │   │
│ │   18    │ │  count…  │   │
│ └─────────┘ └─────────┘   │
│ [ ⌫ Exit service mode ]    │
└────────────────────────────┘
```

### 5.3 Public Give page `/give/[slug]` (mobile-first)

```
┌────────────────────────────┐
│ ▓▓ kente-strip             │
│   [church monogram]        │   Monogram = generated placeholder until
│   Grace Chapel, Adenta     │   the real logo is uploaded per tenant
│                            │
│  I want to give to:        │
│  ┌──────┐┌──────┐┌──────┐  │
│  │Tithe ││Offer.││Harvest│ │   fund tiles (Ghanaian categories first)
│  └──────┘└──────┘└──────┘  │
│  ┌──────┐┌──────────┐      │
│  │Build.││Welfare…  │      │
│  └──────┘└──────────┘      │
│  Amount: [ GH₵ 100.00    ] │   preset chips: 20 / 50 / 100 / 200 / 500
│  Phone:  [ 024 412 …    ]  │   normalises 024 / +23324 / 23324
│  Name:   [ optional     ]  │
│  ☑ Cover GH₵ 0.75 charge   │   fee gross-up toggle
│  ┌──────────────────────┐  │
│  │  GIVE WITH MOBO      │  │   primary CTA (gold on navy)
│  └──────────────────────┘  │
│  📱 Waiting for prompt… 0:45│   post-submit: PIN prompt guidance
│  Having trouble? See USSD   │   + USSD fallback card for feature phones
└────────────────────────────┘
```

### 5.4 Cash counting room (the "two-person rule", desktop)

```
┌─ Sunday 12 Jul · 2nd Service · Count sheet ──────────────────────────────┐
│ Denomination      Quantity      Total                                    │
│ GH₵ 200            [  2   ]     GH₵ 400.00                              │
│ GH₵ 100            [  9   ]     GH₵ 900.00                              │
│ …coins…                                                             Σ:    │
│                                                              GH₵ 4,312.50│
│ Cheques: 2  (GH₵ 1,200.00)          MoMo payouts matched: GH₵ 8,450.00  │
├──────────────────────────────────────────────────────────────────────────┤
│ Counter 1: [Ama Mensah  ✓ PIN]   Counter 2: [Kojo Asante  ✓ PIN]        │
│ Approver:  [Mrs Vanderpuye  ⏳ waiting for both counters]                │
│ [ Submit for approval ]        status chips: ✗ mismatch · ⏳ pending      │
└──────────────────────────────────────────────────────────────────────────┘
```

UX rule: the approver cannot see the "Submit" button until BOTH counters have
signed; the UI should teach this rule with a friendly helper line
("Two counters sign, then the treasurer approves — protects everybody.")
rather than a dead disabled button.

---

## 6. Ghanaian Workflows the UI Must Honour

### 6.1 Bereavement (One-Week & Funeral)

Death-care logistics are central to Ghanaian congregational life. Dedicated
workflow (not just "an event"):

* **Case header:** deceased name, family, date of passing, one-week date,
  funeral date, widow/widower & children contacts.
* **Donations register:** cash & MoMo contributions per sympathiser with a
  printed receipt book layout (two copies — family + church). Amounts stay
  discreet: totals only on shared screens, full list behind finance role.
* **Support automation:** welfare fund release request, church bus booking,
  delegation list (exco, department reps), thanksgiving service follow-up
  (usually 3 Sundays after burial).
* **Tone:** dark, quiet theme variant; no confetti animations; "Our deepest
  condolences" language packs in Twi/Ewe/Ga.

### 6.2 Outdooring / Naming & Dedication

* 8-day outdooring tracker: child record → parents/household link →
  dedication service date → certificate print (A5, with kente border).
* Print certificates on any printer: A4 margin-safe templates are the norm.

### 6.3 Harvest & Project Fundraising

* **Thermometer widget** (gold fill on navy) for Harvest / bus / building
  targets — shareable as an image for WhatsApp status.
* Pledge cards: personal pledge → fulfilment progress → gentle SMS reminders
  before/after service, "Akwaaba, your pledge of GH₵ 500 is now GH₵ 200 away".
* Harvest Sunday planning: decoration budget, food stalls, thanksgiving
  categories, "harvest committee" roster.

### 6.4 Denominational hierarchy & remittances

* Branch switcher in the topbar: **HQ → Region → Area/District → Assembly**;
  roll-up dashboards at HQ level ("Northern Region remittance 92% ✓").
* Preset terminology packs: COP (Society/Assembly/District/Area),
  PCG (Congregation/Pastorate/Presbytery), MCG (Society/Circuit/Diocese),
  RCC (Parish/Deanery/Diocese) — labels change, screens don't.
* Remittance widget: monthly % of tithe/harvest due to HQ with
  "prepared by / approved by" stamps.

### 6.5 Calendar moments (from `seed-data/events_calendar.json`)

Watchnight/Crossover (max capacity planning!), Easter conventions, Mother's
Day (May), Father's Day (June), Harvest season (Aug–Dec), anniversaries,
baptism services, love feast. Each gets a themed event card template using
`ghana_church_events` imagery from the asset cache.

### 6.6 Communication tone

* SMS sender IDs show church names ("GRACE-ADENTA") — preview exactly so.
* Warm, respectful register: "Beloved, …", "Ayekoo!", "Akwaaba!", "See you on
  Sunday 🙏🏾". Emoji sparingly — feature phones drop them to `?`.
* Birthday/anniversary messages signed by the pastor (existing drip feature).

---

## 7. Components, Data-viz & Accessibility

### 7.1 Core component inventory (map to one CSS system)

| Component | Variants | Ghana notes |
|---|---|---|
| `SyncChip` | synced / syncing / pending / offline | on every operational screen |
| `MoneyText` | plain / big / tabular | `GH₵ 1,250.00`, pesewa-safe |
| `FundTile` | icon + label + kente edge | give page, quick-entry |
| `Thermometer` | target / raised / deadline | harvest, bus, building projects |
| `BigCounter` | stepper 0–9999 | headcount, denomination counting |
| `StatusPill` | active/visitor/inactive/transferred | shape + colour + word |
| `MomTile` | MTN/Telecel/AT/Card/Bank | colour-coded, text-labelled |
| `PrintSheet` | receipt / certificate / count-sheet | A4 margin-safe, grayscale-friendly |
| `MissingMemberCard` | 3+ Sundays absent | → assign follow-up in 1 tap |
| `BranchSwitcher` | HQ→Region→Area→Assembly | respects RLS roles |

### 7.2 Data-viz rules

* Sparklines and bars in brand navy + accent green; **gold reserved for
  giving/harvest series** so money reads instantly.
* Always pair charts with the exact number (GH₵ tabular) — charts are a bonus,
  not the source of truth for treasurers.
* "Sunday-to-Sunday" comparisons beat calendar-month comparisons for
  attendance/giving; make that the default axis.

### 7.3 Accessibility & inclusion

* Contrast ≥ 4.5:1 for text; ≥ 3:1 for large numerals outdoors.
* Tap targets ≥ 44 px (ushers use the app standing, one-handed, in sunlight).
* Respect `prefers-reduced-motion` — no confetti for first-timers' birthdays
  for users who opt out.
* Colour-blind safe status set (navy / gold / red / green distinguishable via
  shape badges ● ▲ ■ ◆ as well).
* Full keyboard support in the count room (number keys, tab, enter-to-sign).

---

## 8. Where the Asset Kit Plugs In

| Asset kit output | Product surface |
|---|---|
| `assets/<6 categories>/` (scraped) | onboarding carousels, login hero, branch cards, flyer templates, empty states |
| `assets/placeholders/logos/*.png` (22 monograms) | tenant onboarding default logo, demo churches, org chart avatars |
| `assets/placeholders/icons/*.png` (10 icons) | department icons (choir=music, ushers=hands, finance=offering…) |
| `assets/placeholders/banners/*.png` | dashboard header strip, certificate borders, event cards |
| `seed-data/regions.json` | member form region→town cascading selects |
| `seed-data/names.json` | demo data, import-testing fixtures |
| `seed-data/departments.json` | org module presets + roster defaults |
| `seed-data/funds.json` | giving fund presets incl. remittance % |
| `seed-data/service_templates.json` | service scheduler seeds (incl. Twi 2nd service) |
| `seed-data/events_calendar.json` | yearly calendar scaffolding |
| `seed-data/sample_members.csv` | CSV import preview testing (400 rows) |
| `seed-data/sample_giving.csv` | finance reports & dashboard fixtures (1,500 rows) |

## 9. Suggested Build Order (UI)

1. **Design tokens + core components** (SyncChip, MoneyText, BigCounter,
   StatusPill) — extend `globals.css`, no visual redesign needed.
2. **Sunday Service Mode shell** — the signature experience.
3. **Give page revamp** (channel tiles, prompt screen, USSD card).
4. **Count room polish** (two-person flow made obvious).
5. **Missing-member / care queue cards** on dashboard.
6. **Themed event kits** (harvest thermometer, funeral mode, certificates).
7. **i18n packs (Twi first)** for member-facing surfaces.

Each step reuses existing API surfaces (`/sync/batch`, giving quote/init,
SMS dispatcher) — this is a UI-layer transformation, not a rewrite.






