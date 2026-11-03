const db = require('../lib/db');

// One sync_state row per source ('unis_dc', 'shopify_tracking'), each with its own watermark
// so one source failing never holds the other back.
async function getWatermark(source, fallbackLookbackMs) {
  const { rows } = await db.query(
    `SELECT last_synced_through FROM sync_state WHERE source = $1`,
    [source]
  );
  if (rows.length > 0) return new Date(rows[0].last_synced_through);
  const fallback = new Date();
  fallback.setTime(fallback.getTime() - fallbackLookbackMs);
  return fallback;
}

async function setSyncState(source, until, status, error = null) {
  await db.query(`
    INSERT INTO sync_state (source, last_synced_through, last_run_at, last_run_status, last_error)
    VALUES ($1,$2,now(),$3,$4)
    ON CONFLICT (source) DO UPDATE SET
      last_synced_through = EXCLUDED.last_synced_through,
      last_run_at = now(),
      last_run_status = EXCLUDED.last_run_status,
      last_error = EXCLUDED.last_error
  `, [source, until.toISOString(), status, error]);
}

module.exports = { getWatermark, setSyncState };
