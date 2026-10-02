const db = require('../lib/db');
const auth = require('../lib/auth');

// Admin-only user management for the dashboard's Basic auth (see middleware.mjs, lib/auth.js).
//   GET    /api/users                                     list users
//   POST   /api/users  { username, password, isAdmin }    add a user
//   PUT    /api/users  { username, password?, isAdmin? }  reset password and/or change role
//   DELETE /api/users?username=...                        remove a user

const USERNAME_PATTERN = /^[a-z0-9._@-]{2,64}$/; // no ":" — Basic auth splits on it
const MIN_PASSWORD_LENGTH = 10;

function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function passwordError(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

async function adminCount() {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM dashboard_users WHERE is_admin');
  return rows[0].n;
}

module.exports = async (req, res) => {
  let caller;
  try {
    caller = await auth.authenticate(req.headers.authorization);
  } catch (error) {
    console.error('Auth check failed:', error.message);
    return res.status(503).json({ success: false, error: 'Authentication unavailable' });
  }
  if (!caller) return res.status(401).json({ success: false, error: 'Not signed in' });
  if (!caller.isAdmin) return res.status(403).json({ success: false, error: 'Admins only' });

  const body = req.body || {};

  try {
    if (req.method === 'GET') {
      const { rows } = await db.query(
        'SELECT username, is_admin, created_at, created_by, updated_at FROM dashboard_users ORDER BY username'
      );
      return res.status(200).json({ success: true, users: rows });
    }

    if (req.method === 'POST') {
      const username = normalizeUsername(body.username);
      if (!USERNAME_PATTERN.test(username)) {
        return res.status(400).json({ success: false, error: 'Username must be 2-64 characters: letters, numbers, . _ @ -' });
      }
      const pwError = passwordError(body.password);
      if (pwError) return res.status(400).json({ success: false, error: pwError });

      const { rowCount } = await db.query(
        `INSERT INTO dashboard_users (username, password_hash, is_admin, created_by)
         VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO NOTHING`,
        [username, await auth.hashPassword(body.password), body.isAdmin === true, caller.username]
      );
      if (rowCount === 0) return res.status(409).json({ success: false, error: `User "${username}" already exists` });
      return res.status(201).json({ success: true });
    }

    if (req.method === 'PUT') {
      const username = normalizeUsername(body.username);
      const changes = [];
      const params = [username];

      if (body.password !== undefined) {
        const pwError = passwordError(body.password);
        if (pwError) return res.status(400).json({ success: false, error: pwError });
        params.push(await auth.hashPassword(body.password));
        changes.push(`password_hash = $${params.length}`);
      }
      if (typeof body.isAdmin === 'boolean') {
        if (!body.isAdmin && username === caller.username) {
          return res.status(400).json({ success: false, error: "You can't remove your own admin access" });
        }
        params.push(body.isAdmin);
        changes.push(`is_admin = $${params.length}`);
      }
      if (changes.length === 0) return res.status(400).json({ success: false, error: 'Nothing to change' });

      const { rowCount } = await db.query(
        `UPDATE dashboard_users SET ${changes.join(', ')}, updated_at = now() WHERE username = $1`,
        params
      );
      if (rowCount === 0) return res.status(404).json({ success: false, error: `No user "${username}"` });
      auth.clearAuthCache();
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const username = normalizeUsername(req.query.username);
      if (username === caller.username) {
        return res.status(400).json({ success: false, error: "You can't delete yourself" });
      }
      const { rows } = await db.query('SELECT is_admin FROM dashboard_users WHERE username = $1', [username]);
      if (rows.length === 0) return res.status(404).json({ success: false, error: `No user "${username}"` });
      if (rows[0].is_admin && (await adminCount()) <= 1) {
        return res.status(400).json({ success: false, error: "Can't delete the last admin" });
      }
      await db.query('DELETE FROM dashboard_users WHERE username = $1', [username]);
      auth.clearAuthCache();
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Error managing users:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
