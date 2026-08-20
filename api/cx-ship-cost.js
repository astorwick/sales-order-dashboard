const ShopifyClient = require('../lib/shopify');
const ThreePLClient = require('../lib/threepl');

const DRAFT_ORDER_SOURCE_NAME = 'shopify_draft_order';

const ALLOWED_ORIGINS = [
  'https://sales-order-dashboard-pi.vercel.app',
  'https://sales-order-dashboard-bquqnyeu0-anthonystorwick-1458s-projects.vercel.app'
];

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
    const daysBack = Math.min(parseInt(req.query.days) || 7, 90);

    // 1. Fetch UNIS shipped orders and Shopify draft orders in parallel —
    //    the two sources are independent so there's no reason to wait on one before starting the other.
    const threePL = new ThreePLClient();
    const shopify = new ShopifyClient();
    const [shippedOrders, shopifyDraftOrders] = await Promise.all([
      threePL.getRecentShippedOrders(daysBack),
      shopify.getFulfilledOrders(daysBack, { sourceName: DRAFT_ORDER_SOURCE_NAME })
    ]);

    console.log(`CX Ship Cost: ${shippedOrders.length} shipped orders from UNIS DC`);
    console.log(`CX Ship Cost: ${shopifyDraftOrders.length} Shopify draft orders (source_name:${DRAFT_ORDER_SOURCE_NAME})`);

    if (shippedOrders.length === 0 || shopifyDraftOrders.length === 0) {
      const emptyCarrier = { count: 0, avgWeight: null, avgFreight: null, totalFreight: 0 };
      return res.status(200).json({
        success: true,
        timestamp: new Date().toISOString(),
        summary: { total: 0, ups: emptyCarrier, usps: emptyCarrier, fedex: emptyCarrier, amazon: emptyCarrier },
        orders: []
      });
    }

    // 2. Build Shopify draft-order creation-date / service-level lookup map — only draft orders are present
    //    here, so any UNIS order not found in this map is not a draft order and gets excluded below.
    const shopifyDraftMap = {};
    shopifyDraftOrders.forEach(o => { shopifyDraftMap[o.name] = o; });

    // 3. Combine data, keeping only orders that originated as Shopify draft orders
    const carrierStats = {
      ups: { count: 0, freightTotal: 0, freightCount: 0, weightTotal: 0, weightCount: 0 },
      usps: { count: 0, freightTotal: 0, freightCount: 0, weightTotal: 0, weightCount: 0 },
      fedex: { count: 0, freightTotal: 0, freightCount: 0, weightTotal: 0, weightCount: 0 },
      amazon: { count: 0, freightTotal: 0, freightCount: 0, weightTotal: 0, weightCount: 0 }
    };

    const orders = [];

    for (const unis of shippedOrders) {
      const shopifyOrder = shopifyDraftMap[unis.poNo];
      if (!shopifyOrder) continue; // Not a Shopify draft order — exclude

      const freightCost = unis.freightCost !== null && unis.freightCost !== undefined ? unis.freightCost : null;
      const weight = unis.weight !== null && unis.weight !== undefined ? unis.weight : null;

      // Carrier counts + freight cost / weight aggregation
      const carrierUpper = (unis.carrier || '').toUpperCase();
      let stats = null;
      if (carrierUpper.includes('USPS')) stats = carrierStats.usps;
      else if (carrierUpper.includes('UPS')) stats = carrierStats.ups;
      else if (carrierUpper.includes('FEDEX') || carrierUpper.includes('FED EX')) stats = carrierStats.fedex;
      else if (carrierUpper.includes('AMAZON')) stats = carrierStats.amazon;

      if (stats) {
        stats.count++;
        if (freightCost !== null) {
          stats.freightTotal += freightCost;
          stats.freightCount++;
        }
        if (weight !== null) {
          stats.weightTotal += weight;
          stats.weightCount++;
        }
      }

      orders.push({
        orderNo: unis.unisOrderNo || '',
        poNo: unis.poNo || '',
        createdAt: shopifyOrder.createdAt,
        carrier: unis.carrier || '',
        serviceLevel: shopifyOrder.serviceLevel,
        pcs: unis.pcs !== null && unis.pcs !== undefined ? unis.pcs : null,
        state: unis.shipToState || '',
        weight: weight,
        freightCost: freightCost
      });
    }

    // Sort by created date descending (newest first)
    orders.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
      const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
      return dateB - dateA;
    });

    const round2 = (n) => Math.round(n * 100) / 100;
    const carrierSummary = (stats) => ({
      count: stats.count,
      avgWeight: stats.weightCount > 0 ? round2(stats.weightTotal / stats.weightCount) : null,
      avgFreight: stats.freightCount > 0 ? round2(stats.freightTotal / stats.freightCount) : null,
      totalFreight: round2(stats.freightTotal)
    });

    const summary = {
      total: orders.length,
      ups: carrierSummary(carrierStats.ups),
      usps: carrierSummary(carrierStats.usps),
      fedex: carrierSummary(carrierStats.fedex),
      amazon: carrierSummary(carrierStats.amazon)
    };

    console.log(`CX Ship Cost: ${orders.length} draft-order shipments`);

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      summary,
      orders
    });
  } catch (error) {
    console.error('Error fetching CX ship cost data:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
