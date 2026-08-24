const ThreePLClient = require('../lib/threepl');

const ALLOWED_ORIGINS = [
  'https://sales-order-dashboard-pi.vercel.app',
  'https://sales-order-dashboard-bquqnyeu0-anthonystorwick-1458s-projects.vercel.app'
];

const DAYS_BACK = 7;

// Case-insensitive, both spellings — matched against UNIS's exact casing was
// only confirmed for "Shipped"; normalizing here avoids a silent no-op filter
// if cancellations come back as e.g. "CANCELLED" or "Canceled".
const EXCLUDED_STATUSES = new Set(['SHIPPED', 'CANCELLED', 'CANCELED']);

module.exports = async (req, res) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const threePL = new ThreePLClient();
    const { orders, windowFrom, windowTo } = await threePL.getRecentOrderLevelOrders(DAYS_BACK);

    // Once an order ships it can no longer be caught/canceled, and a canceled order
    // means action was already taken — neither needs to show up here. Historical
    // shipped-duplicate freight cost is still tracked separately (see
    // sync-service/find-duplicate-shipments.js against parcel_shipments).
    const openOrders = orders.filter(o => !EXCLUDED_STATUSES.has((o.status || '').toUpperCase()));

    const byPoNo = new Map();
    for (const order of openOrders) {
      if (!order.poNo) continue;
      if (!byPoNo.has(order.poNo)) byPoNo.set(order.poNo, []);
      byPoNo.get(order.poNo).push(order);
    }

    const groups = [...byPoNo.entries()].filter(([, group]) => group.length > 1);

    const orderRows = groups.flatMap(([, group]) =>
      group.map(order => ({ ...order, groupSize: group.length }))
    );

    orderRows.sort((a, b) => {
      if (a.poNo !== b.poNo) return a.poNo < b.poNo ? -1 : 1;
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      window: { from: windowFrom, to: windowTo, days: DAYS_BACK },
      summary: {
        duplicateGroups: groups.length,
        flaggedOrders: orderRows.length,
        openOrders: openOrders.length,
        totalOrders: orders.length
      },
      orders: orderRows
    });
  } catch (error) {
    console.error('Error fetching duplicate orders:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
