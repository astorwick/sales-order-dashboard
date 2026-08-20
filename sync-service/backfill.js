const ShopifyClient = require('../lib/shopify');
const ThreePLClient = require('../lib/threepl');
const db = require('../lib/db');
const { upsertShipmentsBatch } = require('./upsert-shipment');

const TOTAL_WEEKS = 52;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SHOPIFY_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000; // orders can be placed well before they ship

function weekChunks(totalWeeks) {
  const chunks = [];
  // Anchor to the start of the current UTC day, not the exact current instant — chunk
  // boundaries must be stable across separate script invocations (resuming after an
  // interruption) for isChunkDone()'s exact-timestamp lookup to actually match prior
  // runs. Using new Date() directly here made every re-run compute slightly different
  // chunk_start values and silently redo the whole backfill instead of resuming.
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  for (let i = totalWeeks; i >= 1; i--) {
    chunks.push({
      start: new Date(now.getTime() - i * WEEK_MS),
      end: new Date(now.getTime() - (i - 1) * WEEK_MS)
    });
  }
  return chunks;
}

async function isChunkDone(start) {
  const { rows } = await db.query(
    `SELECT status FROM backfill_progress WHERE chunk_start = $1`,
    [start.toISOString()]
  );
  return rows[0]?.status === 'done';
}

async function runBackfill() {
  const shopify = new ShopifyClient();
  const threePL = new ThreePLClient();

  for (const { start, end } of weekChunks(TOTAL_WEEKS)) {
    if (await isChunkDone(start)) {
      console.log(`Skipping already-completed chunk ${start.toISOString()}`);
      continue;
    }

    console.log(`Backfilling ${start.toISOString()} .. ${end.toISOString()}`);
    const chunkStartTime = Date.now();
    await db.query(
      `INSERT INTO backfill_progress (chunk_start, chunk_end, status) VALUES ($1,$2,'pending')
       ON CONFLICT (chunk_start) DO UPDATE SET status = 'pending', error = NULL`,
      [start.toISOString(), end.toISOString()]
    );

    try {
      const shopifyLookbackStart = new Date(start.getTime() - SHOPIFY_LOOKBACK_MS);

      const [unisOrders, shopifyOrders] = await Promise.all([
        threePL.getShippedOrdersInRange(start, end),
        shopify.getFulfilledOrdersInRange(shopifyLookbackStart.toISOString(), end.toISOString())
      ]);

      const shopifyMap = new Map(shopifyOrders.map(o => [o.name, o]));

      const pairs = unisOrders.map(unis => ({ unis, shopifyOrder: shopifyMap.get(unis.poNo) || null }));
      const matched = pairs.filter(p => p.shopifyOrder).length;
      await upsertShipmentsBatch(pairs);

      await db.query(
        `UPDATE backfill_progress
         SET status = 'done', shopify_count = $2, unis_count = $3, matched_count = $4, completed_at = now()
         WHERE chunk_start = $1`,
        [start.toISOString(), shopifyOrders.length, unisOrders.length, matched]
      );

      const elapsed = ((Date.now() - chunkStartTime) / 1000).toFixed(1);
      console.log(`  done in ${elapsed}s: ${unisOrders.length} UNIS shipments (${shopifyOrders.length} Shopify pulled), ${matched} matched`);
    } catch (error) {
      await db.query(
        `UPDATE backfill_progress SET status = 'error', error = $2 WHERE chunk_start = $1`,
        [start.toISOString(), error.message]
      );
      throw error; // stop — remaining chunks stay 'pending', re-running the script resumes from here
    }
  }

  console.log('Backfill complete.');
}

runBackfill()
  .then(() => db.pool.end())
  .catch(err => {
    console.error('Backfill aborted:', err.message);
    db.pool.end().finally(() => process.exit(1));
  });
