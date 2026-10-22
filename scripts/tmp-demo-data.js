// Mock data for demo church — PART 1: members, services, attendance, headcount, groups.
// Run: node scripts/tmp-demo-data.js   (then tmp-demo-data2.js)
const { Client } = require('pg');
const { randomUUID } = require('crypto');
const fs = require('fs');
const CHURCH = 'demo';
let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const MALE = ['Kofi','Kwame','Kwesi','Yaw','Kojo','Kwabena','Fiifi','Nii','Elikem','Selorm','Ebo','Akwasi','Emmanuel','Samuel','Isaac','Daniel','Michael','Prince','Nicholas','Bright','Gideon','Jonathan','Nana Yaw','Paa Kwasi'];
const FEMALE = ['Ama','Akua','Abena','Adjoa','Afua','Yaa','Esi','Naa','Priscilla','Grace','Mercy','Evelyn','Hannah','Esther','Josephine','Linda','Gifty','Vida','Sandra','Rita','Comfort','Vicky','Naa Adjeley','Adjoa Serwaa'];
const LAST = ['Mensah','Osei','Boateng','Asante','Owusu','Nkrumah','Agyeman','Danso','Amoah','Tetteh','Quartey','Lartey','Appiah','Baidoo','Koomson','Bediako','Antwi','Adjei','Boadu','Sarpong','Oppong','Frimpong','Gyamfi','Acheampong'];
const PREFIX = ['020','024','027','050','054','055','059'];
const STAGES = ['MEMBER','MEMBER','MEMBER','NEW_BELIEVER','WORKER','WORKER','LEADER'];

(async () => {
  const c = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/chms' });
  await c.connect();
  try {
    const church = (await c.query('SELECT id FROM "Church" WHERE slug=$1', [CHURCH])).rows[0];
    if (!church) throw new Error('demo church missing — run seed first');
    const n = (await c.query('SELECT count(*)::int AS n FROM "Member" WHERE "churchId"=$1', [church.id])).rows[0].n;
    const uq = async (p) => (await c.query('SELECT id FROM "User" WHERE "churchId"=$1 AND "phoneE164"=$2', [church.id, p])).rows[0].id;
    const users = { pastor: await uq('+233550449840'), secretary: await uq('+233550449841'), finance: await uq('+233550449842'), usher: await uq('+233550449843'), elder: await uq('+233550449844'), teacher: await uq('+233550449845') };
    const brackets = (await c.query('SELECT id, "segmentKey", "minAge", "maxAge" FROM "AgeBracket" WHERE "churchId"=$1 ORDER BY "minAge"', [church.id])).rows;
    const segments = (await c.query('SELECT id, key, kind FROM "HeadcountSegment" WHERE "churchId"=$1', [church.id])).rows;
    const segByKey = new Map(segments.map((s) => [s.key, s]));
    const bracketFor = (age) => brackets.find((b) => age >= b.minAge && (b.maxAge == null || age <= b.maxAge)) || brackets[4];
    const segForMember = (bracket, gender) => {
      const cand = [`${bracket.segmentKey}_${gender === 'MALE' ? 'M' : 'W'}`, bracket.segmentKey];
      return (cand.map((k) => segByKey.get(k)).find((s) => s && s.kind === 'IN_PERSON') || segByKey.get('ADULTS_M')).id;
    };

    // --- members (reused when already generated) ---
    let memberIds = []; const milestones = [];
    const existing = await c.query('SELECT id FROM "Member" WHERE "churchId"=$1 AND "memberNo" LIKE $2 ORDER BY "memberNo"', [church.id, 'MEM-%']);
    if (existing.rows.length >= 45) {
      memberIds = existing.rows.map((r) => r.id);
      console.log('members: reused', memberIds.length);
    } else {
    for (let i = 0; i < 45; i++) {
      const gender = i % 2 === 0 ? 'MALE' : 'FEMALE';
      const first = gender === 'MALE' ? MALE[i % MALE.length] : FEMALE[i % FEMALE.length];
      const last = LAST[(i * 7) % LAST.length];
      const age = [6,9,16,22,25,28,31,34,38,42,45,49,53,57,63,68][i % 16];
      const br = bracketFor(age);
      const dob = new Date(); dob.setUTCFullYear(dob.getUTCFullYear() - age); dob.setUTCMonth(0, 1 + ((i * 3) % 27));
      const nat = PREFIX[i % PREFIX.length].slice(1) + String(2000000 + i * 11111).slice(-7);
      const joined = new Date(Date.now() - ri(30, 1100) * 864e5);
      const stage = STAGES[i % STAGES.length];
      const salvation = ri(0, 9) < 7 ? new Date(Date.now() - ri(60, 2500) * 864e5) : null;
      const baptism = salvation && ri(0, 9) < 4 ? new Date(salvation.getTime() + ri(30, 400) * 864e5) : null;
      const marriage = age >= 26 && ri(0, 9) < 3 ? new Date(Date.now() - ri(200, 3000) * 864e5) : null;
      const ordination = stage === 'LEADER' && age >= 35 ? new Date(Date.now() - ri(100, 800) * 864e5) : null;
      const status = i === 37 || i === 43 ? 'INACTIVE' : 'ACTIVE';
      const mid = randomUUID();
      await c.query(
        `INSERT INTO "Member" (id,"churchId","memberNo","firstName","lastName","phoneE164","gender","dob","ageBracketId","status","joinedAt","smsConsent","preferredChannel","salvationDate","baptismDate","marriageDate","ordinationDate","discipleshipStage","createdAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,'SMS',$12,$13,$14,$15,$16, now() - interval '400 days')`,
        [mid, church.id, 'MEM-' + String(i + 1).padStart(4, '0'), first, last, '+233' + nat, gender, dob.toISOString().slice(0, 10), br.id, status, joined.toISOString().slice(0, 10), salvation, baptism, marriage, ordination, stage]);
      memberIds.push(mid);
      if (salvation) milestones.push({ memberId: mid, type: 'SALVATION', date: salvation.toISOString().slice(0, 10) });
      if (baptism) milestones.push({ memberId: mid, type: 'BAPTISM', date: baptism.toISOString().slice(0, 10) });
      if (marriage) milestones.push({ memberId: mid, type: 'WEDDING', date: marriage.toISOString().slice(0, 10) });
      if (ordination) milestones.push({ memberId: mid, type: 'ORDINATION', date: ordination.toISOString().slice(0, 10) });
    }
    console.log('members: 45');
    } // end members-else

    // --- services: reuse when present, else last 8 Sundays (CLOSED) + Wed + next Sunday ---
    const serviceIds = []; const now = new Date();
    const dow = now.getUTCDay(); const lastSunday = new Date(now); lastSunday.setUTCDate(now.getUTCDate() - ((dow + 7) % 7 || 7));
    const wedStart = new Date(lastSunday.getTime() - 3 * 864e5);
    const svcCount = (await c.query('SELECT count(*)::int AS n FROM "Service" WHERE "churchId"=$1', [church.id])).rows[0].n;
    if (svcCount > 0) {
      const sundays = (await c.query(`SELECT id FROM "Service" WHERE "churchId"=$1 AND name LIKE 'Sunday%' AND status='CLOSED' ORDER BY "startsAt"`, [church.id])).rows;
      const wedRows = (await c.query(`SELECT id FROM "Service" WHERE "churchId"=$1 AND name='Wednesday Bible Study'`, [church.id])).rows;
      serviceIds.push(...sundays.map((r) => r.id), wedRows[0].id);
      console.log('services: reused', serviceIds.length);
    } else {
      for (let k = 7; k >= 0; k--) {
        const d = new Date(lastSunday); d.setUTCDate(lastSunday.getUTCDate() - k * 7);
        const r = await c.query(`INSERT INTO "Service" (id,"churchId","name","startsAt","status","closedAt") VALUES ($1,$2,$3,$4,'CLOSED',$5) RETURNING id`,
          [randomUUID(), church.id, k === 2 ? 'Sunday Worship & Communion' : 'Sunday Worship', d.toISOString(), new Date(d.getTime() + 2 * 36e5).toISOString()]);
        serviceIds.push(r.rows[0].id);
      }
      const wed = await c.query(`INSERT INTO "Service" (id,"churchId","name","startsAt","status","closedAt") VALUES ($1,$2,'Wednesday Bible Study',$3,'CLOSED',$4) RETURNING id`,
        [randomUUID(), church.id, wedStart.toISOString(), new Date(wedStart.getTime() + 1.5 * 36e5).toISOString()]);
      serviceIds.push(wed.rows[0].id);
      const nextSun = new Date(lastSunday); nextSun.setUTCDate(lastSunday.getUTCDate() + 7);
      await c.query(`INSERT INTO "Service" (id,"churchId","name","startsAt","status") VALUES ($1,$2,'Sunday Worship',$3,'SCHEDULED')`,
        [randomUUID(), church.id, nextSun.toISOString()]);
      console.log('services: 9 past + 1 upcoming');
    }

    // --- attendance: members 0-11 attend Sundays 0-4 then miss last 3 (missing-member material) ---
    let att = 0;
    const startTimes = [];
    for (let si = 0; si < 8; si++) startTimes.push((await c.query('SELECT "startsAt" FROM "Service" WHERE id=$1', [serviceIds[si]])).rows[0].startsAt);
    for (let si = 0; si < 8; si++) {
      for (let mi = 0; mi < memberIds.length; mi++) {
        const lapsed = mi < 12 && si >= 5;
        const inactive = mi === 37 || mi === 43;
        const attend = !inactive && (lapsed ? si <= 4 : rnd() < 0.86);
        if (!attend) continue;
        const at = new Date(new Date(startTimes[si]).getTime() + ri(1, 14) * 6e4);
        const res = await c.query(`INSERT INTO "Attendance" (id,"churchId","serviceId","memberId","checkedInAt","method","deviceId") VALUES ($1,$2,$3,$4,$5,'MANUAL',$6) ON CONFLICT DO NOTHING`,
          [randomUUID(), church.id, serviceIds[si], memberIds[mi], at.toISOString(), mi % 5 === 0 ? 'mock-usher' : null]);
        att += res.rowCount;
      }
    }
    for (let mi = 0; mi < 45; mi += 2) {
      const res = await c.query(`INSERT INTO "Attendance" (id,"churchId","serviceId","memberId","checkedInAt","method") VALUES ($1,$2,$3,$4,$5,'MANUAL') ON CONFLICT DO NOTHING`,
        [randomUUID(), church.id, serviceIds[8], memberIds[mi], new Date(wedStart.getTime() + ri(1, 10) * 6e4).toISOString()]);
      att += res.rowCount;
    }
    console.log('attendance rows:', att);

    // --- headcount: one +1 row per present member (their segment) + online rows ---
    let hc = 0;
    for (let si = 0; si < 8; si++) {
      let seq = 1;
      const had = await c.query('SELECT 1 FROM "Headcount" WHERE "serviceId"=$1 LIMIT 1', [serviceIds[si]]);
      if (had.rows.length) continue; // rerun-safe
      for (let mi = 0; mi < memberIds.length; mi++) {
        const a = await c.query('SELECT 1 FROM "Attendance" WHERE "serviceId"=$1 AND "memberId"=$2', [serviceIds[si], memberIds[mi]]);
        if (!a.rows.length) continue;
        const m = (await c.query('SELECT gender, "ageBracketId" FROM "Member" WHERE id=$1', [memberIds[mi]])).rows[0];
        const br = brackets.find((b) => b.id === m.ageBracketId) || brackets[4];
        await c.query(`INSERT INTO "Headcount" (id,"churchId","serviceId","segmentId","delta","deviceId","clientSeq","recordedBy","recordedAt") VALUES ($1,$2,$3,$4,1,'mock-usher',$5,$6,$7)`,
          [randomUUID(), church.id, serviceIds[si], segForMember(br, m.gender), seq++, users.usher, new Date(new Date(startTimes[si]).getTime() + 20 * 6e4).toISOString()]);
        hc++;
      }
      const onl = segByKey.get('ONLINE') || [...segByKey.values()].find((s) => s.kind === 'ONLINE');
      if (onl) for (let j = 0; j < ri(4, 9); j++) {
        await c.query(`INSERT INTO "Headcount" (id,"churchId","serviceId","segmentId","delta","deviceId","clientSeq","recordedBy","recordedAt") VALUES ($1,$2,$3,$4,1,'stream-tv',$5,$6,$7)`,
          [randomUUID(), church.id, serviceIds[si], onl.id, seq++, users.teacher, new Date(new Date(startTimes[si]).getTime() + 30 * 6e4).toISOString()]);
        hc++;
      }
    }
    console.log('headcount rows:', hc);

    // --- groups ---
    const groups = [['CELL', "Men's Fellowship"], ['CELL', "Women's Fellowship"], ['MINISTRY', 'Youth & Teens'], ['DEPARTMENT', 'Choir & Music']];
    for (let g = 0; g < groups.length; g++) {
      const eg = await c.query('SELECT 1 FROM "Group" WHERE "churchId"=$1 AND name=$2 LIMIT 1', [church.id, groups[g][1]]);
      if (eg.rows.length) continue; // rerun-safe
      const gid = randomUUID();
      await c.query('INSERT INTO "Group" (id,"churchId","type","name","leaderId") VALUES ($1,$2,$3,$4,$5)', [gid, church.id, groups[g][0], groups[g][1], memberIds[(g * 5) % memberIds.length]]);
      for (let j = 0; j < 14; j++) {
        const mid = memberIds[(g * 5 + j * 3) % memberIds.length];
        await c.query('INSERT INTO "GroupMember" ("groupId","memberId","role") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [gid, mid, j === 0 ? 'LEADER' : 'MEMBER']);
      }
    }
    console.log('groups: 4');

    fs.writeFileSync(require('path').join(__dirname, '.demo-ctx.json'), JSON.stringify({ churchId: church.id, users, memberIds, serviceIds, milestones }));
    console.log('context saved — run: node scripts/tmp-demo-data2.js');
  } finally { await c.end(); }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });

