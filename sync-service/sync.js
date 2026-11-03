const ShopifyClient = require('../lib/shopify');
const ThreePLClient = require('../lib/threepl');
const db = require('../lib/db');
const { upsertShipment } = require('./upsert-shipment');
const { getWatermark, setSyncState } = require('./sync-state');
const { runTrackingSync } = require('./sync-tracking');

const SOURCE = 'unis_dc';
const OVERLAP_MS = 2 * 60 * 60 * 1000; // 2h safety buffer on the watermark
const FALLBACK_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000; // used only if sync_state has no row yet

async function runSync() {
  const shopify = new ShopifyClient();
  const threePL = new ThreePLClient();

  const until = new Date(); // captured before fetching, so shipments confirmed mid-run aren't lost
  const watermark = await getWatermark(SOURCE, FALLBACK_LOOKBACK_MS);
  const from = new Date(watermark.getTime() - OVERLAP_MS);

  try {
    const unisOrders = await threePL.getShippedOrdersInRange(from, until);

    const poNos = unisOrders.map(o => o.poNo).filter(Boolean);
    const shopifyOrders = await shopify.getOrdersByNames(poNos);
    const shopifyMap = new Map(shopifyOrders.map(o => [o.name, o]));

    const unisCreateTimes = await threePL.getOrderCreateTimesForShipments(
      unisOrders.map(o => ({ unisOrderNo: o.unisOrderNo, poNo: o.poNo }))
    );

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
  .then(runTrackingSync)
  .finally(() => db.pool.end());
