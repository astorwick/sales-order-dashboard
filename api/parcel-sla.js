const ShopifyClient = require('../lib/shopify');
const ThreePLClient = require('../lib/threepl');

const SLA_HOURS = 36;

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

    // 1. Fetch UNIS shipped orders and Shopify creation-date map in parallel —
    //    the two sources are independent so there's no reason to wait on one before starting the other.
    const threePL = new ThreePLClient();
    const shopify = new ShopifyClient();
    const [shippedOrders, shopifyOrders] = await Promise.all([
      threePL.getRecentShippedOrders(daysBack),
      shopify.getFulfilledOrders(daysBack)
    ]);

    console.log(`Parcel SLA: ${shippedOrders.length} shipped orders from UNIS DC`);
    console.log(`Parcel SLA: ${shopifyOrders.length} Shopify orders in lookup map`);

    if (shippedOrders.length === 0) {
      return res.status(200).json({
        success: true,
        timestamp: new Date().toISOString(),
        slaThresholdHours: SLA_HOURS,
        summary: { total: 0, withinSla: 0, pastSla: 0, ups: 0, usps: 0, fedex: 0, amazon: 0 },
        orders: []
      });
    }

    // 2. Build Shopify creation-date lookup map.
    const shopifyMap = {};
    shopifyOrders.forEach(o => { shopifyMap[o.name] = o.createdAt; });

    // 3. Combine data
    let withinSla = 0;
    let pastSla = 0;
    let upsCount = 0;
    let uspsCount = 0;
    let fedexCount = 0;
    let amazonCount = 0;

    const orders = [];

    for (const unis of shippedOrders) {
      // Prefer Shopify's precise creation timestamp; fall back to UNIS OrderedDate
      const createdAt = shopifyMap[unis.poNo] || unis.createdAt;
      const shippedDate = unis.shippedDate;

      // Calculate SLA (Shopify created -> UNIS shipped)
      let slaHours = null;
      let withinSlaFlag = null;

      if (createdAt && shippedDate) {
        const created = new Date(createdAt);
        const shipped = new Date(shippedDate);
        slaHours = calcBusinessHours(created, shipped);

        if (slaHours <= SLA_HOURS) {
          withinSla++;
          withinSlaFlag = true;
        } else {
          pastSla++;
          withinSlaFlag = false;
        }
      } else {
        pastSla++;
        withinSlaFlag = false;
      }

      // Carrier counts
      const carrierUpper = (unis.carrier || '').toUpperCase();
      if (carrierUpper.includes('USPS')) uspsCount++;
      else if (carrierUpper.includes('UPS')) upsCount++;
      else if (carrierUpper.includes('FEDEX') || carrierUpper.includes('FED EX')) fedexCount++;
      else if (carrierUpper.includes('AMAZON')) amazonCount++;

      orders.push({
        orderNo: unis.unisOrderNo || '',
        poNo: unis.poNo || '',
        createdAt: createdAt,
        shippedDate: shippedDate,
        trackingNumber: unis.trackingNumber || null,
        carrier: unis.carrier || '',
        slaHours: slaHours !== null ? Math.round(slaHours * 10) / 10 : null,
        withinSla: withinSlaFlag
      });
    }

    // Sort by shipped date descending (newest first)
    orders.sort((a, b) => {
      const dateA = a.shippedDate ? new Date(a.shippedDate) : new Date(0);
      const dateB = b.shippedDate ? new Date(b.shippedDate) : new Date(0);
      return dateB - dateA;
    });

    const summary = {
      total: orders.length,
      withinSla,
      pastSla,
      ups: upsCount,
      usps: uspsCount,
      fedex: fedexCount,
      amazon: amazonCount
    };

    console.log(`Parcel SLA: ${orders.length} Small Parcel orders (${withinSla} within SLA, ${pastSla} past SLA)`);

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      slaThresholdHours: SLA_HOURS,
      summary,
      orders
    });
  } catch (error) {
    console.error('Error fetching parcel SLA data:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
