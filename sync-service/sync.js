const ShopifyClient = require('../lib/shopify');
const ThreePLClient = require('../lib/threepl');
const db = require('../lib/db');
const { upsertShipment } = require('./upsert-shipment');
const { getWatermark, setSyncState } = require('./sync-state');
const { runTrackingSync } = require('./sync-tracking');

// Railway skips a cron run while the previous one is still running, so one hung network call
// (most fetches here have no timeout) would block every later run until a redeploy. Kill the
// process instead; the next run picks up from the unchanged watermark.
const WATCHDOG_MS = 25 * 60 * 1000; // under the 30-min cron interval
let step = 'starting';
setTimeout(() => {
  console.error(`Sync watchdog: still running after ${WATCHDOG_MS / 60000} min (stuck at: ${step}), exiting`);
  process.exit(1);
}, WATCHDOG_MS).unref();

function logStep(name) {
  step = name;
  console.log(`[${new Date().toISOString()}] ${name}`);
}

const SOURCE = 'unis_dc';
const OVERLAP_MS = 2 * 60 * 60 * 1000; // 2h safety buffer on the watermark
const FALLBACK_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000; // used only if sync_state has no row yet

async function runSync() {
  const shopify = new ShopifyClient();
  const threePL = new ThreePLClient();

  const until = new Date(); // captured before fetching, so shipments confirmed mid-run aren't lost
  logStep('Reading UNIS watermark');
  const watermark = await getWatermark(SOURCE, FALLBACK_LOOKBACK_MS);
  const from = new Date(watermark.getTime() - OVERLAP_MS);

  try {
    logStep(`Fetching UNIS shipments from ${from.toISOString()}`);
    const unisOrders = await threePL.getShippedOrdersInRange(from, until);

    const poNos = unisOrders.map(o => o.poNo).filter(Boolean);
    logStep(`Fetching ${poNos.length} Shopify orders`);
    const shopifyOrders = await shopify.getOrdersByNames(poNos);
    const shopifyMap = new Map(shopifyOrders.map(o => [o.name, o]));

    logStep(`Fetching UNIS create times for ${unisOrders.length} shipments`);
    const unisCreateTimes = await threePL.getOrderCreateTimesForShipments(
      unisOrders.map(o => ({ unisOrderNo: o.unisOrderNo, poNo: o.poNo }))
    );

    logStep(`Writing ${unisOrders.length} shipments to Postgres`);
    for (const unis of unisOrders) {
      await upsertShipment(unis, shopifyMap.get(unis.poNo) || null, unisCreateTimes.get(unis.unisOrderNo) || null);
    }

    await setSyncState(SOURCE, until, 'success');
    console.log(`Sync OK: ${unisOrders.length} shipments, window ${from.toISOString()}..${until.toISOString()}`);
  } catch (error) {
    console.error('Sync tick failed:', error.message);
    // Don't advance the watermark on failure — the next run retries this same window.
    await setSyncState(SOURCE, watermark, 'error', error.message);
    process.exitCode = 1;
  }
}

// The two syncs are independent: each catches its own errors and keeps its own watermark
runSync()
  .catch(error => { console.error('Sync tick failed:', error.message); process.exitCode = 1; })
  .then(() => { logStep('Running Shopify tracking sync'); return runTrackingSync(); })
  .catch(error => { console.error('Tracking sync failed:', error.message); process.exitCode = 1; })
  .finally(async () => {
    logStep('Closing database pool');
    await db.pool.end();
    // Exit explicitly so a leftover open handle can't keep the container alive after the work is done
    process.exit(process.exitCode || 0);
  });
