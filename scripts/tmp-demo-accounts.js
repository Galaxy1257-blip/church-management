// One-off: demo accounts for every role (password admin1234) + a Member record
// for the portal. Safe to re-run (upserts). Run: node scripts/tmp-demo-accounts.js
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const CHURCH = 'demo';
const PASSWORD = 'admin1234';
// phone (E.164) -> { name, roleKey }
const ACCOUNTS = [
  ['+233240000000', { name: 'Dev Admin', roleKey: 'SUPER_ADMIN' }],
  ['+233550449840', { name: 'Pastor', roleKey: 'SUPER_ADMIN' }],
  ['+233550449841', { name: 'Secretary', roleKey: 'SECRETARY' }],
  ['+233550449842', { name: 'Finance Officer', roleKey: 'FINANCE_ADMIN' }],
  ['+233550449843', { name: 'Usher', roleKey: 'USHER' }],
  ['+233550449844', { name: 'Elder', roleKey: 'ELDER' }],
  ['+233550449845', { name: 'Teacher', roleKey: 'LEADER' }],
  ['+233550449846', { name: 'Akosua Nyarko', roleKey: 'MEMBER', portalMember: true }],
];

// Credentials come from the environment only — never hardcode a DSN.
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required; run: node --env-file=.env ' + __filename);
  process.exit(1);
}
(async () => {
  const connectionString = process.env.DATABASE_URL;
  const c = new Client({ connectionString });
  await c.connect();
  try {
    const churches = await c.query('SELECT id, slug FROM "Church"');
    console.log('churches:', churches.rows.map((r) => r.slug).join(', ') || '(none)');
    if (churches.rows.length > 1) console.log('WARNING: multiple churches exist — using', CHURCH);
    const church = churches.rows.find((r) => r.slug === CHURCH) || churches.rows[0];
    if (!church) throw new Error('no church — run npm run db:seed first');

    const roles = await c.query('SELECT key, id FROM "Role" WHERE "churchId"=$1', [church.id]);
    const roleByKey = new Map(roles.rows.map((r) => [r.key, r.id]));
    console.log('roles:', [...roleByKey.keys()].join(', '));

    const hash = await bcrypt.hash(PASSWORD, 10);
    for (const [phone, acct] of ACCOUNTS) {
      if (!roleByKey.has(acct.roleKey)) throw new Error(`role ${acct.roleKey} missing in ${CHURCH}`);
      let memberId = null;
      if (acct.portalMember) {
        const m = await c.query(
          'SELECT id FROM "Member" WHERE "churchId"=$1 AND "phoneE164"=$2 AND "deletedAt" IS NULL',
          [church.id, phone],
        );
        if (m.rows[0]) memberId = m.rows[0].id;
        else {
          const ins = await c.query(
            `INSERT INTO "Member" (id, "churchId", "memberNo", "firstName", "lastName", "phoneE164", status)
             VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE') RETURNING id`,
            [randomUUID(), church.id, 'DEMO-1001', 'Akosua', 'Nyarko', phone],
          );
          memberId = ins.rows[0].id;
          console.log('member record created for', phone);
        }
      }
      const ex = await c.query('SELECT id FROM "User" WHERE "churchId"=$1 AND "phoneE164"=$2', [church.id, phone]);
      let userId;
      if (ex.rows[0]) {
        userId = ex.rows[0].id;
        await c.query(
          'UPDATE "User" SET "passwordHash"=$1, "isActive"=true, name=$2, "memberId"=COALESCE($3,"memberId") WHERE id=$4',
          [hash, acct.name, memberId, userId],
        );
      } else {
        const ins = await c.query(
          'INSERT INTO "User" (id, "churchId", name, "phoneE164", "passwordHash", "isActive", "memberId") VALUES ($1,$2,$3,$4,$5,true,$6) RETURNING id',
          [randomUUID(), church.id, acct.name, phone, hash, memberId],
        );
        userId = ins.rows[0].id;
      }
      await c.query(
        'INSERT INTO "UserRole" ("userId","roleId") VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [userId, roleByKey.get(acct.roleKey)],
      );
      console.log(`ok  ${phone}  0${phone.slice(6)}  ${acct.name.padEnd(15)} ${acct.roleKey}`);
    }
    const users = await c.query(
      `SELECT u.name, u."phoneE164", string_agg(r.key, '/') AS roles
       FROM "User" u LEFT JOIN "UserRole" ur ON ur."userId"=u.id LEFT JOIN "Role" r ON r.id=ur."roleId"
       WHERE u."churchId"=$1 GROUP BY 1,2 ORDER BY 2`,
      [church.id],
    );
    console.log('\nAll demo users:');
    for (const u of users.rows) console.log(`  ${u.phoneE164}  ${u.name.padEnd(16)} ${u.roles || '(no roles)'}`);
  } finally {
    await c.end();
  }
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
