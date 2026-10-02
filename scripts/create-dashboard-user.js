// Creates (or resets the password of) a dashboard user directly in Postgres — used to create the
// first admin before the login is switched on, or to recover if every admin is locked out.
// Everyone else is managed from the dashboard's Users tab.
//
// Usage, from the repo root:
//   node _run_with_env.js scripts/create-dashboard-user.js <username> [--admin]
// The password is prompted for and not echoed.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const db = require('../lib/db');
const auth = require('../lib/auth');

function promptHidden(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    rl._writeToOutput = text => { if (!muted) rl.output.write(text); };
    rl.question(question, answer => {
      rl.output.write('\n');
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  const args = process.argv.slice(2);
  const username = (args.find(a => !a.startsWith('--')) || '').trim().toLowerCase();
  const isAdmin = args.includes('--admin');
  if (!/^[a-z0-9._@-]{2,64}$/.test(username)) {
    console.error('Usage: node _run_with_env.js scripts/create-dashboard-user.js <username> [--admin]');
    process.exit(1);
  }

  const password = await promptHidden(`Password for ${username}: `);
  if (password.length < 10) {
    console.error('Password must be at least 10 characters');
    process.exit(1);
  }
  if ((await promptHidden('Confirm password: ')) !== password) {
    console.error("Passwords don't match");
    process.exit(1);
  }

  // Creates dashboard_users if it doesn't exist yet (same statement as sync-service/schema.sql)
  const schema = fs.readFileSync(path.join(__dirname, '../sync-service/schema.sql'), 'utf8');
  const createTable = schema.match(/CREATE TABLE IF NOT EXISTS dashboard_users[\s\S]*?\);/)[0];
  await db.query(createTable);

  await db.query(
    `INSERT INTO dashboard_users (username, password_hash, is_admin, created_by)
     VALUES ($1, $2, $3, 'create-dashboard-user script')
     ON CONFLICT (username) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, is_admin = EXCLUDED.is_admin, updated_at = now()`,
    [username, await auth.hashPassword(password), isAdmin]
  );
  console.log(`Saved ${username}${isAdmin ? ' (admin)' : ''}`);
  await db.pool.end();
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
