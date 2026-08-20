const db = require('../lib/db');

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

    const { rows } = await db.query(`
      SELECT po_no, unis_order_no, order_created_at, shipped_date, tracking_number, carrier
      FROM parcel_shipments
      WHERE shipped_date >= now() - ($1 || ' days')::interval
      ORDER BY shipped_date DESC
    `, [daysBack]);

    console.log(`Parcel SLA: ${rows.length} shipped orders from Postgres`);

    let withinSla = 0;
    let pastSla = 0;

    const carrierStats = {
      ups: { count: 0 },
      usps: { count: 0 },
      fedex: { count: 0 },
      amazon: { count: 0 }
    };

    const orders = rows.map(row => {
      const createdAt = row.order_created_at ? row.order_created_at.toISOString() : null;
      const shippedDate = row.shipped_date ? row.shipped_date.toISOString() : null;

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
      const carrierUpper = (row.carrier || '').toUpperCase();
      let stats = null;
      if (carrierUpper.includes('USPS')) stats = carrierStats.usps;
      else if (carrierUpper.includes('UPS')) stats = carrierStats.ups;
      else if (carrierUpper.includes('FEDEX') || carrierUpper.includes('FED EX')) stats = carrierStats.fedex;
      else if (carrierUpper.includes('AMAZON')) stats = carrierStats.amazon;

      if (stats) stats.count++;

      return {
        orderNo: row.unis_order_no || '',
        poNo: row.po_no || '',
        createdAt: createdAt,
        shippedDate: shippedDate,
        trackingNumber: row.tracking_number || null,
        carrier: row.carrier || '',
        slaHours: slaHours !== null ? Math.round(slaHours * 10) / 10 : null,
        withinSla: withinSlaFlag
      };
    });

    const carrierSummary = (stats) => ({
      count: stats.count
    });

    const summary = {
      total: orders.length,
      withinSla,
      pastSla,
      ups: carrierSummary(carrierStats.ups),
      usps: carrierSummary(carrierStats.usps),
      fedex: carrierSummary(carrierStats.fedex),
      amazon: carrierSummary(carrierStats.amazon)
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
