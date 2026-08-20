const db = require('../lib/db');

const DRAFT_ORDER_SOURCE_NAME = 'shopify_draft_order';
const COLUMNS = [
  'unis_order_no', 'po_no', 'order_created_at', 'shipped_date', 'carrier', 'tracking_number',
  'ship_to_state', 'pcs', 'weight', 'freight_cost', 'service_level', 'source_name', 'is_draft_order'
];
const CONFLICT_UPDATE_SET = COLUMNS
  .filter(c => c !== 'unis_order_no')
  .map(c => `${c} = EXCLUDED.${c}`)
  .concat('synced_at = now()')
  .join(', ');

// unis: record from ThreePLClient.getShippedOrdersInRange
// shopifyOrder: matching record from ShopifyClient.getFulfilledOrdersInRange/getOrdersByNames, or null
function toRow(unis, shopifyOrder) {
  const orderCreatedAt = shopifyOrder ? shopifyOrder.createdAt : unis.createdAt;
  const serviceLevel = shopifyOrder ? shopifyOrder.serviceLevel : null;
  const sourceName = shopifyOrder ? shopifyOrder.sourceName : null;
  const isDraftOrder = sourceName === DRAFT_ORDER_SOURCE_NAME;
  return [
    unis.unisOrderNo, unis.poNo, orderCreatedAt, unis.shippedDate, unis.carrier, unis.trackingNumber,
    unis.shipToState, unis.pcs, unis.weight, unis.freightCost, serviceLevel, sourceName, isDraftOrder
  ];
}

async function upsertShipment(unis, shopifyOrder) {
  const row = toRow(unis, shopifyOrder);
  await db.query(`
    INSERT INTO parcel_shipments (${COLUMNS.join(', ')}, synced_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
    ON CONFLICT (unis_order_no) DO UPDATE SET ${CONFLICT_UPDATE_SET}
  `, row);
}

// Batched variant for bulk loads (backfill) — one round-trip per batch of rows instead of
// one per row. Over a public internet connection to Railway, sequential single-row upserts
// dominated backfill runtime (~1,200+ round-trips per weekly chunk); batching collapses that
// to a couple of round-trips per chunk. batchSize=500 keeps well under Postgres's 65535
// query-parameter limit (500 rows * 13 columns = 6,500 params).
async function upsertShipmentsBatch(pairs, batchSize = 500) {
  // Guard against the same unis_order_no appearing more than once in the input — observed
  // under very high-volume pulls (holiday peak weeks, 60+ pages), most likely pagination
  // drift on UNIS's side when the underlying dataset keeps changing while we're still
  // paginating through it. A single INSERT...ON CONFLICT statement can't update the same
  // row twice, so dedupe (keeping the last/most-recent occurrence) before batching.
  const deduped = [...new Map(pairs.map(p => [p.unis.unisOrderNo, p])).values()];

  for (let i = 0; i < deduped.length; i += batchSize) {
    const batch = deduped.slice(i, i + batchSize);
    const rows = batch.map(({ unis, shopifyOrder }) => toRow(unis, shopifyOrder));

    const valuesSql = rows
      .map((row, rowIndex) => {
        const placeholders = row.map((_, colIndex) => `$${rowIndex * COLUMNS.length + colIndex + 1}`);
        return `(${placeholders.join(',')}, now())`;
      })
      .join(', ');

    await db.query(`
      INSERT INTO parcel_shipments (${COLUMNS.join(', ')}, synced_at)
      VALUES ${valuesSql}
      ON CONFLICT (unis_order_no) DO UPDATE SET ${CONFLICT_UPDATE_SET}
    `, rows.flat());
  }
}

module.exports = { upsertShipment, upsertShipmentsBatch };
