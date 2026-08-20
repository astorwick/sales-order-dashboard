const ShopifyClient = require('../lib/shopify');
const ThreePLClient = require('../lib/threepl');
const db = require('../lib/db');
const { upsertShipment } = require('./upsert-shipment');

const SOURCE = 'unis_dc';
const OVERLAP_MS = 2 * 60 * 60 * 1000; // 2h safety buffer on the watermark
const FALLBACK_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000; // used only if sync_state has no row yet

async function getWatermark() {
  const { rows } = await db.query(
    `SELECT last_synced_through FROM sync_state WHERE source = $1`,
    [SOURCE]
  );
  if (rows.length > 0) return new Date(rows[0].last_synced_through);
  const fallback = new Date();
  fallback.setTime(fallback.getTime() - FALLBACK_LOOKBACK_MS);
  return fallback;
}

async function setSyncState(until, status, error = null) {
  await db.query(`
    INSERT INTO sync_state (source, last_synced_through, last_run_at, last_run_status, last_error)
    VALUES ($1,$2,now(),$3,$4)
    ON CONFLICT (source) DO UPDATE SET
      last_synced_through = EXCLUDED.last_synced_through,
      last_run_at = now(),
      last_run_status = EXCLUDED.last_run_status,
      last_error = EXCLUDED.last_error
  `, [SOURCE, until.toISOString(), status, error]);
}

async function runSync() {
  const shopify = new ShopifyClient();
  const threePL = new ThreePLClient();

  const until = new Date(); // captured before fetching, so shipments confirmed mid-run aren't lost
  const watermark = await getWatermark();
  const from = new Date(watermark.getTime() - OVERLAP_MS);

  try {
    const unisOrders = await threePL.getShippedOrdersInRange(from, until);

    const poNos = unisOrders.map(o => o.poNo).filter(Boolean);
    const shopifyOrders = await shopify.getOrdersByNames(poNos);
    const shopifyMap = new Map(shopifyOrders.map(o => [o.name, o]));

    for (const unis of unisOrders) {
      await upsertShipment(unis, shopifyMap.get(unis.poNo) || null);
    }

    await setSyncState(until, 'success');
    console.log(`Sync OK: ${unisOrders.length} shipments, window ${from.toISOString()}..${until.toISOString()}`);
  } catch (error) {
    console.error('Sync tick failed:', error.message);
    // Don't advance the watermark on failure — the next run retries this same window.
    await setSyncState(watermark, 'error', error.message);
    process.exitCode = 1;
  }
}

runSync().finally(() => db.pool.end());
