const crypto = require('crypto');
const { promisify } = require('util');
const db = require('./db');

// Basic auth against the dashboard_users table. Used by middleware.mjs (every request) and by
// api/users.js / api/me.js (to know who is calling and whether they're an admin).

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

// Successful logins are cached per server instance for this long, keyed by a hash of the
// Authorization header, so every page asset and API call doesn't re-run scrypt + a DB query.
// It's also the longest a deleted user or a changed password can keep working.
const CACHE_TTL_MS = 60 * 1000;
const verifiedCache = new Map(); // sha256(authorization header) -> { user, expiresAt }

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, saltB64, hashB64] = (stored || '').split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function parseBasicAuth(header) {
  const match = /^Basic\s+(.+)$/i.exec(header || '');
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  if (sep < 0) return null;
  return { username: decoded.slice(0, sep).trim().toLowerCase(), password: decoded.slice(sep + 1) };
}

// Returns { username, isAdmin } for valid credentials, otherwise null. Throws if the database
// can't be reached, so callers fail closed.
async function authenticate(authorizationHeader) {
  const creds = parseBasicAuth(authorizationHeader);
  if (!creds || !creds.username || !creds.password) return null;

  const cacheKey = crypto.createHash('sha256').update(authorizationHeader).digest('hex');
  const cached = verifiedCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.user;
  verifiedCache.delete(cacheKey);

  const { rows } = await db.query(
    'SELECT username, password_hash, is_admin FROM dashboard_users WHERE username = $1',
    [creds.username]
  );
  const row = rows[0];
  if (!row || !(await verifyPassword(creds.password, row.password_hash))) return null;

  const user = { username: row.username, isAdmin: row.is_admin };
  verifiedCache.set(cacheKey, { user, expiresAt: Date.now() + CACHE_TTL_MS });
  return user;
}

// Drops every cached login, so user changes made through this instance apply immediately here
// (other warm instances still pick them up within CACHE_TTL_MS).
function clearAuthCache() {
  verifiedCache.clear();
}

module.exports = { hashPassword, authenticate, clearAuthCache };
