const db = require('../lib/db');

const ALLOWED_ORIGINS = [
  'https://sales-order-dashboard-pi.vercel.app',
  'https://sales-order-dashboard-bquqnyeu0-anthonystorwick-1458s-projects.vercel.app'
];

const PRE_SHIPMENT_STATUSES = new Set([
  'CONFIRMED', 'LABEL_PURCHASED', 'LABEL_PRINTED', 'LABEL_VOIDED', 'MARKED_AS_FULFILLED', 'SUBMITTED'
]);

module.exports = async (req, res) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const daysBack = req.query.days === '14' ? 14 : req.query.days === '30' ? 30 : 7;

    // Filled every 15 min by sync-service/sync-tracking.js (source 'shopify_tracking')
    const [{ rows }, { rows: stateRows }] = await Promise.all([
      db.query(`
        SELECT order_name, order_created_at, fulfilled_at, carrier, service_level, ship_to_state,
               tracking_number, tracking_url, shipment_status
        FROM parcel_tracking
        WHERE order_created_at >= now() - ($1 || ' days')::interval
      `, [String(daysBack)]),
      db.query(`SELECT last_synced_through, last_run_status FROM sync_state WHERE source = 'shopify_tracking'`)
    ]);
    console.log(`USPS Tracker: ${rows.length} tracking rows from Postgres for last ${daysBack} days`);

    const results = rows.map(r => ({
      orderName: r.order_name,
      orderCreatedAt: r.order_created_at,
      fulfilledAt: r.fulfilled_at,
      carrier: r.carrier,
      trackingNumber: r.tracking_number || null,
      trackingUrl: r.tracking_url,
      shipmentStatus: r.shipment_status,
      serviceLevel: r.service_level,
      shipToState: r.ship_to_state,
      isPreShipment: PRE_SHIPMENT_STATUSES.has(r.shipment_status)
    }));

    // Pre-shipment first, then oldest fulfilled date first within each group
    results.sort((a, b) => {
      if (a.isPreShipment !== b.isPreShipment) return a.isPreShipment ? -1 : 1;
      return new Date(a.fulfilledAt) - new Date(b.fulfilledAt);
    });

    const byStatus = {};
    results.forEach(r => {
      byStatus[r.shipmentStatus] = (byStatus[r.shipmentStatus] || 0) + 1;
    });

    return res.status(200).json({
      success: true,
      shipments: results,
      summary: {
        total: results.length,
        preShipment: results.filter(r => r.isPreShipment).length,
        byStatus
      },
      dataAsOf: stateRows[0]?.last_synced_through || null,
      lastSyncStatus: stateRows[0]?.last_run_status || null
    });
  } catch (error) {
    console.error('USPS Tracker error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
