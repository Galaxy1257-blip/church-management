// Mock data PART 2: giving, expenses, pledges, events, visitors, care, pastoral.
// Run after tmp-demo-data.js (needs scripts/.demo-ctx.json).
const { Client } = require('pg');
const { randomUUID } = require('crypto');
const path = require('path');
const ctx = require(path.join(__dirname, '.demo-ctx.json'));
const { churchId, users, memberIds, serviceIds } = ctx;
let seed = 777; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const days = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const iso = (n) => new Date(Date.now() + n * 864e5).toISOString(); // n in DAYS
const at = (ms) => new Date(Date.now() + ms).toISOString(); // n in MILLISECONDS

(async () => {
  const c = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/chms' });
  await c.connect();
  try {
    const cnt = async (t) => (await c.query(`SELECT count(*)::int AS n FROM "${t}" WHERE "churchId"=$1`, [churchId])).rows[0].n;
    const funds = (await c.query('SELECT id, type FROM "Fund" WHERE "churchId"=$1', [churchId])).rows;
    const F = Object.fromEntries(funds.map((f) => [f.type, f.id]));
    const cats = (await c.query('SELECT id, name FROM "ExpenseCategory" WHERE "churchId"=$1', [churchId])).rows;
    const C = Object.fromEntries(cats.map((x) => [x.name, x.id]));

    // --- campaign + pledges ---
    if (await cnt('Campaign') === 0) {
      const campId = randomUUID();
      await c.query(`INSERT INTO "Campaign" (id,"churchId","fundId","name","goalMinor","startsOn","endsOn","isPublic") VALUES ($1,$2,$3,$4,$5,$6,$7,true)`,
        [campId, churchId, F.BUILDING, '2026 Sanctuary Building Project', 20000000, days(-60), days(120)]);
      const pl = [[1, 200000, 'MONTHLY'], [5, 500000, 'MONTHLY'], [9, 300000, 'WEEKLY'], [13, 1000000, 'ONE_TIME'], [17, 150000, 'MONTHLY'], [21, 250000, 'WEEKLY'], [25, 750000, 'ONE_TIME'], [29, 400000, 'MONTHLY']];
      for (const [mi, amt, freq] of pl) {
        await c.query(`INSERT INTO "Pledge" (id,"churchId","memberId","fundId","campaignId","amountMinor","frequency","startsOn","status") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE')`,
          [randomUUID(), churchId, memberIds[mi], F.BUILDING, campId, amt, freq, days(-45)]);
      }
      console.log('campaign: 1, pledges: 8');
    }

    // --- giving: batch per past Sunday + transactions ---
    if (await cnt('GivingBatch') === 0) {
      const sundays = serviceIds.slice(0, 8);
      let n = 0;
      for (let si = 0; si < sundays.length; si++) {
        const svc = (await c.query('SELECT "startsAt" FROM "Service" WHERE id=$1', [sundays[si]])).rows[0].startsAt;
        const batchId = randomUUID(); let total = 0; const rows = [];
        for (let j = 0; j < ri(11, 15); j++) {
          const type = ['TITHE', 'OFFERING', 'OFFERING', 'WELFARE', 'THANKSGIVING', 'BUILDING'][ri(0, 5)];
          const ghs = type === 'TITHE' ? ri(10, 90) * 10 : type === 'OFFERING' ? ri(5, 80) : ri(20, 50) * 10;
          rows.push({ gift: ghs * 100, mem: rnd() < 0.72 ? memberIds[ri(0, memberIds.length - 1)] : null, type, j });
          total += ghs * 100;
        }
        // batch row must exist BEFORE its transactions (FK)
        await c.query(
          `INSERT INTO "GivingBatch" (id,"churchId","serviceId","label","status","countedBy1","countedBy2","countedMinor","approvedBy","createdAt")
           VALUES ($1,$2,$3,$4,'APPROVED',$5,$6,$7,$8,$9)`,
          [batchId, churchId, sundays[si], 'Sunday Collection ' + days(-((7 - si) * 7)).slice(0, 10), users.usher, users.finance, total, users.pastor, new Date(new Date(svc).getTime() + 3 * 36e5).toISOString()]);
        for (const r of rows) {
          const ch = r.j % 3 === 0 ? 'CASH' : r.j % 3 === 1 ? 'MOBILE_MONEY' : (r.j % 7 === 0 ? 'CHEQUE' : 'CASH');
          await c.query(
            `INSERT INTO "Transaction" (id,"churchId","fundId","memberId","giverName","giverPhoneE164","giftMinor","chargedMinor","currency","channel","momoProvider","status","reference","paidAt","recordedBy","batchId","receiptSent","createdAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$7,'GHS',$8,$9,'SUCCESS',$10,$11,$12,$13,$14,$11)`,
            [randomUUID(), churchId, F[r.type], r.mem, r.mem ? null : ['Kwesi Amankwah', 'Adjoa Oppong', 'Visitor Guest'][r.j % 3],
             r.mem ? null : '+23324' + String(7000000 + r.j).slice(-7), r.gift, ch,
             ch === 'MOBILE_MONEY' ? ['MTN', 'TELECEL', 'AT'][r.j % 3] : null,
             'GHT-26' + String(si) + String(r.j).padStart(3, '0'),
             new Date(new Date(svc).getTime() + ri(5, 60) * 6e4).toISOString(), users.finance, batchId, r.j % 3 !== 0]);
          n++;
        }
      }
      console.log('giving: 8 batches,', n, 'tx, GHS total', (await c.query('SELECT sum("chargedMinor")::int AS s FROM "Transaction" WHERE "churchId"=$1', [churchId])).rows[0].s / 100);
    }

    // --- expenses ---
    if (await cnt('Expense') === 0) {
      const ex = [
        ['Utilities', 'ECG Prepaid Meter â€” Church', 45000, -34], ['Utilities', 'GOIL Station 37 â€” Generator fuel', 30000, -27],
        ['Media', 'Stage Sound Accra â€” Monitor repair', 65000, -21], ['Events', 'Aburi Gardens â€” Youth picnic deposit', 150000, -12],
        ['Welfare', 'Hospital support â€” Bro Kwame surgery', 40000, -9], ['Missions', 'Tract Press Ltd â€” Easter tracts', 35000, -30],
        ['Other', 'Melcom â€” Office supplies', 28000, -16], ['Utilities', 'Glo Fibre â€” Office internet', 39900, -5],
        ['Media', 'Fredrick Electronics â€” Projector lamp', 48000, -3], ['Events', 'Adom Drinks â€” Bible study refreshments', 26000, -2],
      ];
      for (const [cat, payee, amt, off] of ex) {
        await c.query(`INSERT INTO "Expense" (id,"churchId","categoryId","amountMinor","spentOn","payee","note","status","submittedBy","approvedBy") VALUES ($1,$2,$3,$4,$5,$6,$7,'APPROVED',$8,$9)`,
          [randomUUID(), churchId, C[cat], amt, days(off), payee, null, users.secretary, users.pastor]);
      }
      console.log('expenses: 10');
    }

    // --- events + RSVPs ---
    if (await cnt('Event') === 0) {
      const ev = [
        ['All-Night Prayer & Thanksgiving', at(-6 * 864e5 + 22 * 36e5), 'Demo Church Auditorium', 150],
        ['Baptism Service', at((7 - new Date().getUTCDay()) * 864e5 + 14 * 36e5), 'Church Premises, Accra', 100],
        ['Church Picnic â€” Aburi Gardens', at(12 * 864e5 + 9 * 36e5), 'Aburi Botanical Gardens', 80],
        ["Men's Retreat â€” Kumasi", at(35 * 864e5 + 8 * 36e5), 'Kumasi Retreat Centre', 40],
      ];
      const eventIds = [];
      for (const [title, starts, venue, cap] of ev) {
        const id = randomUUID(); eventIds.push(id);
        await c.query(`INSERT INTO "Event" (id,"churchId","title","description","startsAt","endsAt","venue","capacity","isPublic","status") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,'PUBLISHED')`,
          [id, churchId, title, 'All are welcome â€” invite a friend.', starts, new Date(new Date(starts).getTime() + 3 * 36e5).toISOString(), venue, cap]);
      }
      let r = 0;
      for (const ei of [eventIds[2], eventIds[3]]) {
        for (let j = 0; j < 12; j++) {
          await c.query(`INSERT INTO "EventRsvp" (id,"churchId","eventId","memberId","partySize","status") VALUES ($1,$2,$3,$4,$5,$6)`,
            [randomUUID(), churchId, ei, memberIds[(j * 3 + 2) % memberIds.length], ri(1, 3), j === 11 ? 'WAITLIST' : 'GOING']);
          r++;
        }
        await c.query(`INSERT INTO "EventRsvp" (id,"churchId","eventId","guestName","guestPhoneE164","partySize","status") VALUES ($1,$2,$3,$4,$5,2,'GOING')`,
          [randomUUID(), churchId, ei, 'Nana Ama Guest', '+23355' + String(1000000 + r).slice(-7)]);
        r++;
      }
      console.log('events: 4, rsvps:', r);
    }

    // --- announcements ---
    if (await cnt('Announcement') === 0) {
      const ann = [
        ['Welcome & Notices', 'Welcome to service! Bible study resumes Wednesday 7pm. Connect at the info desk.', 'GENERAL'],
        ['One-week observation â€” Mama Adjoa Mensah', 'The one-week observation for Mama Adjoa Mensah is on Saturday at the family house, Nima. Welfare team, please coordinate transport.', 'FUNERAL'],
        ['Outdooring â€” Baby Mensah', 'Thanksgiving & outdooring for Baby Mensah this Sunday at 12:30pm. Cards available at the office.', 'OUTDOORING'],
        ['Church Picnic â€” Aburi Gardens', 'Bus departs the church premises at 6:30am sharp. Register with the usher desk.', 'EVENT'],
      ];
      for (const [title, body, cat] of ann) {
        await c.query(`INSERT INTO "Announcement" (id,"churchId","title","body","category","audience","channels","publishAt","createdBy") VALUES ($1,$2,$3,$4,$5,$6,$7::text[],$8,$9)`,
          [randomUUID(), churchId, title, body, cat, JSON.stringify({ scope: 'ALL' }), ['INAPP'], at(-ri(1, 12) * 864e5), users.pastor]);
      }
      console.log('announcements: 4');
    }

    // --- visitors + follow-up progress ---
    if (await cnt('Visitor') === 0) {
      const vis = [
        ['Kofi', 'Antwi', 'NEW'], ['Naa', 'Dede', 'NEW'], ['Yaw', 'Boateng', 'IN_FOLLOWUP'], ['Efua', 'Sarpong', 'IN_FOLLOWUP'],
        ['Nii', 'Lartey', 'IN_FOLLOWUP'], ['Ama', 'Quartey', 'RETURNED'], ['Selorm', 'Amoah', 'RETURNED'], ['Akua', 'Frimpong', 'CONVERTED'],
      ];
      const wf = (await c.query('SELECT id FROM "FollowUpWorkflow" WHERE "churchId"=$1 LIMIT 1', [churchId])).rows[0];
      const wv = wf ? (await c.query('SELECT id FROM "FollowUpWorkflowVersion" WHERE "workflowId"=$1 LIMIT 1', [wf.id])).rows[0] : null;
      let p = 0;
      for (let j = 0; j < vis.length; j++) {
        const [f, l, st] = vis[j];
        const id = randomUUID();
        await c.query(`INSERT INTO "Visitor" (id,"churchId","firstName","lastName","phoneE164","firstServiceId","status","visitCount","assignedToUserId","notes","createdAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now() - ($11 || ' days')::interval)`,
          [id, churchId, f, l, '+233' + ['054', '055', '020', '027'][j % 4].slice(1) + String(3000000 + j * 137).slice(-7),
           serviceIds[6], st, ri(1, 3), users.usher, 'Came via a friend\'s invitation', String(j + 2)]);
        if (wf && wv && st !== 'CONVERTED' && st !== 'NEW') {
          await c.query(`INSERT INTO "FollowUpProgress" (id,"churchId","workflowId","versionId","visitorId","state","nextPosition","nextRunAt","enrolledAt","version")
           VALUES ($1,$2,$3,$4,$5,'ACTIVE',0,$6,$7,0)`,
            [randomUUID(), churchId, wf.id, wv.id, id, iso(1), iso(-2)]);
          p++;
        }
      }
      console.log('visitors: 8, followup progress:', p);
    }

    // --- care tasks (incl. missing-member material) ---
    if (await cnt('CareTask') === 0) {
      const care = [
        ['VISIT_HOSPITAL', memberIds[5], users.elder, 'OPEN', 1, 'Surgery at Ridge Hospital â€” visit with communion and welfare package.'],
        ['VISIT_BEREAVEMENT', memberIds[12], users.pastor, 'OPEN', 2, 'Mama Adjoa one-week observation â€” coordinate welfare support & transport.'],
        ['VISIT_HOME', memberIds[20], users.elder, 'IN_PROGRESS', -1, 'New convert home follow-up â€” tea & discipleship class invite.'],
        ['MISSING_MEMBER', memberIds[1], users.pastor, 'OPEN', 1, 'Missed 3 Sundays â€” elder to call and check on the family.'],
        ['MISSING_MEMBER', memberIds[7], users.elder, 'OPEN', 2, 'Missed 3 Sundays â€” WhatsApp check-in and schedule a visit.'],
        ['CALL_REQUESTED', memberIds[30], users.secretary, 'OPEN', 3, 'Prayer request â€” Friday job interview; call to agree prayer times.'],
      ];
      for (const [type, mid, who, status, off, note] of care) {
        await c.query(`INSERT INTO "CareTask" (id,"churchId","memberId","type","assignedTo","status","dueAt","note") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [randomUUID(), churchId, mid, type, who, status, iso(off), note]);
      }
      console.log('care tasks: 6');
    }

    // --- pastoral actions from member milestone dates ---
    if (await cnt('PastoralAction') === 0) {
      const ins = async (mid, type, date, note) => c.query(
        `INSERT INTO "PastoralAction" (id,"churchId","memberId","type","actionDate","note","performedBy") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [randomUUID(), churchId, mid, type, String(date).slice(0, 10), note, users.pastor]);
      let pa = 0;
      for (const m of (await c.query(`SELECT id,"baptismDate"::text AS "baptismDate" FROM "Member" WHERE "churchId"=$1 AND "baptismDate" IS NOT NULL LIMIT 3`, [churchId])).rows) { await ins(m.id, 'BAPTISM', m.baptismDate, 'Water baptism â€” River Pool, Madina'); pa++; }
      for (const m of (await c.query(`SELECT id,"salvationDate"::text AS "salvationDate" FROM "Member" WHERE "churchId"=$1 AND "salvationDate" IS NOT NULL LIMIT 2`, [churchId])).rows) { await ins(m.id, 'SALVATION', m.salvationDate, 'Altar call â€” Wednesday service'); pa++; }
      for (const m of (await c.query(`SELECT id,"marriageDate"::text AS "marriageDate" FROM "Member" WHERE "churchId"=$1 AND "marriageDate" IS NOT NULL LIMIT 1`, [churchId])).rows) { await ins(m.id, 'WEDDING', m.marriageDate, 'Holy matrimony â€” church auditorium'); pa++; }
      for (const m of (await c.query(`SELECT id,"ordinationDate"::text AS "ordinationDate" FROM "Member" WHERE "churchId"=$1 AND "ordinationDate" IS NOT NULL LIMIT 1`, [churchId])).rows) { await ins(m.id, 'ORDINATION', m.ordinationDate, 'Lay leader ordination'); pa++; }
      console.log('pastoral actions:', pa);
    }

    const summary = {};
    for (const t of ['Member', 'Service', 'Attendance', 'Headcount', 'Group', 'GivingBatch', 'Transaction', 'Expense', 'Pledge', 'Campaign', 'Event', 'EventRsvp', 'Announcement', 'Visitor', 'FollowUpProgress', 'CareTask', 'PastoralAction'])
      summary[t] = await cnt(t);
    console.log('DONE â€”', JSON.stringify(summary));
  } finally { await c.end(); }
})().catch((e) => { console.error('ERR', e.stack || e.message); process.exit(1); });
