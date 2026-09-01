const ThreePLClient = require('../lib/threepl');
const db = require('../lib/db');

// One-time backfill for the unis_created_at column added after the original backfill.js run —
// separate script (rather than folding into backfill.js) because it only needs to touch this
// one column on existing rows, not re-derive the whole record.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ORDER_LEVEL_LOOKBACK_MS = 10 * 24 * 60 * 60 * 1000; // orders can be placed before they ship — 10 days is enough margin per user

async function getShippedDateBounds() {
  const { rows } = await db.query(`SELECT MIN(shipped_date) AS min, MAX(shipped_date) AS max FROM parcel_shipments`);
  return { min: new Date(rows[0].min), max: new Date(rows[0].max) };
}

// Chunk the table's actual shipped_date span into weekly windows, rather than a fixed
// TOTAL_WEEKS like backfill.js — this script can run at any point after the original backfill,
// so it derives its range from what's actually in the table.
function weekChunks(min, max) {
  const chunks = [];
  const start = new Date(min);
  start.setUTCHours(0, 0, 0, 0);
  for (let cursor = start; cursor < max; cursor = new Date(cursor.getTime() + WEEK_MS)) {
    chunks.push({
      start: cursor,
      end: new Date(Math.min(cursor.getTime() + WEEK_MS, max.getTime() + 1))
    });
  }
  return chunks;
}

// Resumability check: a chunk is done once no row shipped in that window is still missing
// unis_created_at. Simpler than a separate progress table, and self-correcting if a prior
// run was interrupted mid-chunk.
async function pendingCountInRange(start, end) {
  const { rows } = await db.query(
    `SELECT COUNT(*) FROM parcel_shipments WHERE shipped_date >= $1 AND shipped_date < $2 AND unis_created_at IS NULL`,
    [start.toISOString(), end.toISOString()]
  );
  return parseInt(rows[0].count, 10);
}

async function applyCreateTimes(createTimes) {
  if (createTimes.size === 0) return 0;
  const entries = [...createTimes.entries()];
  const values = entries.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}::timestamptz)`).join(', ');
  const params = entries.flatMap(([orderNo, createdAt]) => [orderNo, createdAt]);
  const { rowCount } = await db.query(`
    UPDATE parcel_shipments AS p
    SET unis_created_at = v.created_at
    FROM (VALUES ${values}) AS v(order_no, created_at)
    WHERE p.unis_order_no = v.order_no AND p.unis_created_at IS NULL
  `, params);
  return rowCount;
}

async function runBackfill() {
  const threePL = new ThreePLClient();
  const { min, max } = await getShippedDateBounds();
  const chunks = weekChunks(min, max);

  let totalUpdated = 0;
  for (const { start, end } of chunks) {
    const pending = await pendingCountInRange(start, end);
    if (pending === 0) {
      console.log(`Skipping ${start.toISOString()} .. ${end.toISOString()} (already backfilled)`);
      continue;
    }

    const lookbackStart = new Date(start.getTime() - ORDER_LEVEL_LOOKBACK_MS);
    console.log(`Backfilling ${start.toISOString()} .. ${end.toISOString()} (${pending} rows pending, querying UNIS from ${lookbackStart.toISOString()})`);

    const createTimes = await threePL.getOrderLevelCreateTimesInRange(lookbackStart, end);
    const updated = await applyCreateTimes(createTimes);
    totalUpdated += updated;
    console.log(`  matched ${createTimes.size} UNIS orders, updated ${updated} rows`);
  }

  console.log(`Unis-created backfill complete. ${totalUpdated} rows updated.`);
}

runBackfill()
  .then(() => db.pool.end())
  .catch(err => {
    console.error('Unis-created backfill aborted:', err.message);
    db.pool.end().finally(() => process.exit(1));
  });
