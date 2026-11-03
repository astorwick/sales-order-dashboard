const ShopifyClient = require('../lib/shopify');
const db = require('../lib/db');
const { getWatermark, setSyncState } = require('./sync-state');

const SOURCE = 'shopify_tracking';
// Orders created within this window are kept current; older rows are pruned. A few days past the
// tab's longest range (30 days) so the oldest rows it shows are still being refreshed.
const WINDOW_DAYS = 35;
const OVERLAP_MS = 2 * 60 * 60 * 1000; // 2h safety buffer on the watermark
const DAY_MS = 24 * 60 * 60 * 1000;

const COLUMNS = [
  'order_name', 'tracking_number', 'order_created_at', 'order_updated_at', 'fulfilled_at',
  'carrier', 'service_level', 'tracking_url', 'shipment_status', 'pieces',
  'in_transit_at', 'delivered_at',
  'last_event_status', 'last_event_at', 'last_event_city', 'last_event_province', 'last_event_message',
  'ship_to_state', 'ship_to_city', 'ship_to_zip', 'ship_to_country', 'is_po_box', 'is_business'
];

function toRow(r) {
  return [
    r.orderName, r.trackingNumber, r.orderCreatedAt, r.orderUpdatedAt, r.fulfilledAt,
    r.carrier, r.serviceLevel, r.trackingUrl, r.shipmentStatus, r.pieces,
    r.inTransitAt, r.deliveredAt,
    r.lastEventStatus, r.lastEventAt, r.lastEventCity, r.lastEventProvince, r.lastEventMessage,
    r.shipToState, r.shipToCity, r.shipToZip, r.shipToCountry, r.isPoBox, r.isBusiness
  ];
}

const INSERT_CHUNK = 500;

// Replaces every row for the given orders in one transaction, so a run that dies midway
// leaves the table as it was.
async function replaceOrders(orderNames, rows) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM parcel_tracking WHERE order_name = ANY($1)`, [orderNames]);
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const chunk = rows.slice(i, i + INSERT_CHUNK);
      const params = [];
      const tuples = chunk.map(r => {
        const values = toRow(r);
        const start = params.length;
        params.push(...values);
        return `(${values.map((_, j) => `$${start + j + 1}`).join(',')})`;
      });
      await client.query(
        `INSERT INTO parcel_tracking (${COLUMNS.join(',')}) VALUES ${tuples.join(',')}`,
        params
      );
    }
    await client.query(
      `DELETE FROM parcel_tracking WHERE order_created_at < now() - ($1 || ' days')::interval`,
      [String(WINDOW_DAYS)]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function runTrackingSync() {
  const shopify = new ShopifyClient();

  const until = new Date(); // captured before fetching, so updates made mid-run are picked up next time
  // No watermark yet = first run, which loads the whole window
  const watermark = await getWatermark(SOURCE, WINDOW_DAYS * DAY_MS);
  const updatedSince = new Date(watermark.getTime() - OVERLAP_MS);
  const createdSince = new Date(until.getTime() - WINDOW_DAYS * DAY_MS);

  try {
    const { orderNames, rows } = await shopify.getTrackingFulfillments({ createdSince, updatedSince });
    await replaceOrders(orderNames, rows);
    await setSyncState(SOURCE, until, 'success');
    console.log(`Tracking sync OK: ${orderNames.length} changed orders, ${rows.length} tracking rows, updated since ${updatedSince.toISOString()}`);
  } catch (error) {
    console.error('Tracking sync failed:', error.message);
    // Don't advance the watermark on failure — the next run retries this same window.
    await setSyncState(SOURCE, watermark, 'error', error.message);
    process.exitCode = 1;
  }
}

module.exports = { runTrackingSync, SOURCE };
