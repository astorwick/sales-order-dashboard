const ShopifyClient = require('../lib/shopify');
const db = require('../lib/db');

// One-time backfill for the freight_paid column added after the original backfill.js run —
// separate script (rather than folding into backfill.js) because it only needs to touch this
// one column on existing rows, not re-derive the whole record. Unlike backfill-unis-created.js,
// this doesn't need weekly windowing: po_no is a direct Shopify order-name lookup key via
// getOrdersByNames, so it just batches every po_no still missing freight_paid.
const BATCH_SIZE = 500; // getOrdersByNames further chunks each batch into groups of 50 for the Shopify API itself

async function getPendingPoNos() {
  const { rows } = await db.query(
    `SELECT DISTINCT po_no FROM parcel_shipments WHERE po_no IS NOT NULL AND freight_paid IS NULL`
  );
  return rows.map(r => r.po_no);
}

// A po_no can match multiple rows (split shipments) — freight_paid is a Shopify order-level
// value, so every row sharing that po_no gets the same value, matching how service_level is
// already handled.
async function applyFreightPaid(shopifyOrders) {
  const entries = shopifyOrders.filter(o => o.freightPaid !== null).map(o => [o.name, o.freightPaid]);
  if (entries.length === 0) return 0;
  const values = entries.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}::numeric)`).join(', ');
  const params = entries.flatMap(([name, freightPaid]) => [name, freightPaid]);
  const { rowCount } = await db.query(`
    UPDATE parcel_shipments AS p
    SET freight_paid = v.freight_paid
    FROM (VALUES ${values}) AS v(po_no, freight_paid)
    WHERE p.po_no = v.po_no AND p.freight_paid IS NULL
  `, params);
  return rowCount;
}

async function runBackfill() {
  const shopify = new ShopifyClient();
  const poNos = await getPendingPoNos();
  console.log(`Freight-paid backfill: ${poNos.length} distinct PO #s pending`);

  let totalUpdated = 0;
  for (let i = 0; i < poNos.length; i += BATCH_SIZE) {
    const batch = poNos.slice(i, i + BATCH_SIZE);
    console.log(`Looking up ${batch.length} orders (${i + batch.length}/${poNos.length})...`);
    const shopifyOrders = await shopify.getOrdersByNames(batch);
    const updated = await applyFreightPaid(shopifyOrders);
    totalUpdated += updated;
    console.log(`  matched ${shopifyOrders.length} Shopify orders, updated ${updated} rows`);
  }

  console.log(`Freight-paid backfill complete. ${totalUpdated} rows updated.`);
}

runBackfill()
  .then(() => db.pool.end())
  .catch(err => {
    console.error('Freight-paid backfill aborted:', err.message);
    db.pool.end().finally(() => process.exit(1));
  });
