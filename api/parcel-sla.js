const ShopifyClient = require('../lib/shopify');
const ThreePLClient = require('../lib/threepl');

const SLA_HOURS = 36;

// Returns the day of the week (0=Sun … 6=Sat) for a UTC Date, evaluated in Pacific Time.
function ptDayOfWeek(date) {
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      weekday: 'short'
    }).format(date)
  );
}

// Returns the UTC Date corresponding to the next PT midnight after `date`.
// Uses noon UTC of that next day to compute the DST-safe PT offset.
function nextPTMidnight(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const y  = +parts.find(p => p.type === 'year').value;
  const mo = +parts.find(p => p.type === 'month').value - 1;
  const d  = +parts.find(p => p.type === 'day').value;

  // Noon UTC of the next PT calendar day — safely away from any DST transition
  const noonNextDay = new Date(Date.UTC(y, mo, d + 1, 12));
  const ptOff = new Date(noonNextDay.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
              - new Date(noonNextDay.toLocaleString('en-US', { timeZone: 'UTC' }));

  // PT midnight of next day = UTC midnight of next day shifted by the PT offset
  return new Date(Date.UTC(y, mo, d + 1) - ptOff);
}

// Count elapsed business hours between two dates, skipping Sat/Sun in Pacific Time.
function calcBusinessHours(start, end) {
  if (!(start instanceof Date)) start = new Date(start);
  if (!(end instanceof Date)) end = new Date(end);
  if (end <= start) return 0;

  let ms = 0;
  let cur = new Date(start);

  while (cur < end) {
    const dow = ptDayOfWeek(cur);
    if (dow !== 0 && dow !== 6) {
      ms += Math.min(nextPTMidnight(cur), end) - cur;
    }
    cur = nextPTMidnight(cur);
  }

  return ms / (1000 * 60 * 60);
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

    // 1. Bulk-paginate UNIS DC (newest-first, 200/page) stopping at the date cutoff.
    //    This replaces the old per-order query pattern which fired thousands of
    //    parallel requests and hit UNIS rate limits in production.
    const threePL = new ThreePLClient();
    const shippedOrders = await threePL.getRecentShippedOrders(daysBack);

    console.log(`Parcel SLA: ${shippedOrders.length} shipped orders from UNIS DC`);

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
    //    Use an extended window (daysBack + 45) so delayed orders are still found.
    const shopify = new ShopifyClient();
    const shopifyOrders = await shopify.getFulfilledOrders(daysBack);
    const shopifyMap = {};
    shopifyOrders.forEach(o => { shopifyMap[o.name] = o.createdAt; });
    console.log(`Parcel SLA: ${shopifyOrders.length} Shopify orders in lookup map`);

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
