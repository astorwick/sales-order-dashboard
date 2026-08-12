const ShopifyClient = require('../lib/shopify');
const ThreePLClient = require('../lib/threepl');

const SLA_HOURS = 36;
const DRAFT_ORDER_SOURCE_NAME = 'shopify_draft_order';

// Count elapsed business hours between two dates, skipping Sat/Sun in Pacific Time.
// Uses UTC-8 as a fixed PT approximation — DST error is ≤1h on 2 days/year, immaterial vs. 36h SLA.
function calcBusinessHours(start, end) {
  if (!(start instanceof Date)) start = new Date(start);
  if (!(end instanceof Date)) end = new Date(end);
  if (end <= start) return 0;

  const DAY_MS = 86400000;
  const PT_OFFSET_MS = 8 * 3600000; // UTC-8

  // Shift into PT space so day boundaries align with PT midnight
  const s = start.getTime() - PT_OFFSET_MS;
  const e = end.getTime() - PT_OFFSET_MS;

  // In PT space, day 0 starts at 1970-01-01 00:00 PT = 1970-01-01 08:00 UTC (a Thursday).
  // dow: (dayNum + 4) % 7 gives 0=Sun … 6=Sat.
  const startDay = Math.floor(s / DAY_MS);
  const endDay   = Math.floor(e / DAY_MS);

  let totalMs = 0;
  for (let d = startDay; d <= endDay; d++) {
    const dow = ((d % 7) + 7 + 4) % 7;
    if (dow === 0 || dow === 6) continue; // skip weekends
    const overlapStart = Math.max(s, d * DAY_MS);
    const overlapEnd   = Math.min(e, (d + 1) * DAY_MS);
    if (overlapEnd > overlapStart) totalMs += overlapEnd - overlapStart;
  }

  return totalMs / 3600000;
}

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
        slaThresholdHours: SLA_HOURS,
        summary: { total: 0, withinSla: 0, pastSla: 0, ups: emptyCarrier, usps: emptyCarrier, fedex: emptyCarrier, amazon: emptyCarrier },
        orders: []
      });
    }

    // 2. Build Shopify creation-date lookup map — only draft orders are present here,
    //    so any UNIS order not found in this map is not a draft order and gets excluded below.
    const shopifyDraftMap = {};
    shopifyDraftOrders.forEach(o => { shopifyDraftMap[o.name] = o.createdAt; });

    // 3. Combine data, keeping only orders that originated as Shopify draft orders
    let withinSla = 0;
    let pastSla = 0;

    const carrierStats = {
      ups: { count: 0, freightTotal: 0, freightCount: 0, weightTotal: 0, weightCount: 0 },
      usps: { count: 0, freightTotal: 0, freightCount: 0, weightTotal: 0, weightCount: 0 },
      fedex: { count: 0, freightTotal: 0, freightCount: 0, weightTotal: 0, weightCount: 0 },
      amazon: { count: 0, freightTotal: 0, freightCount: 0, weightTotal: 0, weightCount: 0 }
    };

    const orders = [];

    for (const unis of shippedOrders) {
      const createdAt = shopifyDraftMap[unis.poNo];
      if (!createdAt) continue; // Not a Shopify draft order — exclude

      const shippedDate = unis.shippedDate;
      const freightCost = unis.freightCost !== null && unis.freightCost !== undefined ? unis.freightCost : null;
      const weight = unis.weight !== null && unis.weight !== undefined ? unis.weight : null;

      // Calculate SLA (Shopify created -> UNIS shipped)
      const created = new Date(createdAt);
      const shipped = new Date(shippedDate);
      const slaHours = calcBusinessHours(created, shipped);
      const withinSlaFlag = slaHours <= SLA_HOURS;
      if (withinSlaFlag) withinSla++;
      else pastSla++;

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
        createdAt: createdAt,
        shippedDate: shippedDate,
        trackingNumber: unis.trackingNumber || null,
        carrier: unis.carrier || '',
        slaHours: Math.round(slaHours * 10) / 10,
        withinSla: withinSlaFlag,
        pcs: unis.pcs !== null && unis.pcs !== undefined ? unis.pcs : null,
        state: unis.shipToState || '',
        weight: weight,
        freightCost: freightCost
      });
    }

    // Sort by shipped date descending (newest first)
    orders.sort((a, b) => {
      const dateA = a.shippedDate ? new Date(a.shippedDate) : new Date(0);
      const dateB = b.shippedDate ? new Date(b.shippedDate) : new Date(0);
      return dateB - dateA;
    });

    const round2 = (n) => Math.round(n * 100) / 100;
    const freightSummary = (stats) => ({
      count: stats.count,
      avgWeight: stats.weightCount > 0 ? round2(stats.weightTotal / stats.weightCount) : null,
      avgFreight: stats.freightCount > 0 ? round2(stats.freightTotal / stats.freightCount) : null,
      totalFreight: round2(stats.freightTotal)
    });

    const summary = {
      total: orders.length,
      withinSla,
      pastSla,
      ups: freightSummary(carrierStats.ups),
      usps: freightSummary(carrierStats.usps),
      fedex: freightSummary(carrierStats.fedex),
      amazon: freightSummary(carrierStats.amazon)
    };

    console.log(`CX Ship Cost: ${orders.length} draft-order shipments (${withinSla} within SLA, ${pastSla} past SLA)`);

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      slaThresholdHours: SLA_HOURS,
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
