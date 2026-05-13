const ShopifyClient = require('../lib/shopify');

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

    const shopify = new ShopifyClient();
    const fulfillments = await shopify.getUSPSFulfillments(daysBack);
    console.log(`USPS Tracker: ${fulfillments.length} USPS fulfillments in last ${daysBack} days`);

    const results = fulfillments.map(f => ({
      ...f,
      isPreShipment: PRE_SHIPMENT_STATUSES.has(f.shipmentStatus)
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
      }
    });
  } catch (error) {
    console.error('USPS Tracker error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
