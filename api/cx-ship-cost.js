const db = require('../lib/db');
const { buildShippedDateFilter } = require('../lib/date-range');

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
    const { whereClause, params } = buildShippedDateFilter(req.query);

    const { rows } = await db.query(`
      SELECT po_no, unis_order_no, order_created_at, carrier, service_level, pcs, ship_to_state, weight, freight_cost
      FROM parcel_shipments
      WHERE ${whereClause}
        AND is_draft_order = true
      ORDER BY order_created_at DESC NULLS LAST
    `, params);

    console.log(`CX Ship Cost: ${rows.length} draft-order shipments from Postgres`);

    const carrierStats = {
      ups: { count: 0, freightTotal: 0, freightCount: 0, weightTotal: 0, weightCount: 0 },
      usps: { count: 0, freightTotal: 0, freightCount: 0, weightTotal: 0, weightCount: 0 },
      fedex: { count: 0, freightTotal: 0, freightCount: 0, weightTotal: 0, weightCount: 0 },
      amazon: { count: 0, freightTotal: 0, freightCount: 0, weightTotal: 0, weightCount: 0 }
    };
    const overallStats = { freightTotal: 0, freightCount: 0, weightTotal: 0, weightCount: 0 };

    const orders = rows.map(row => {
      const freightCost = row.freight_cost !== null ? Number(row.freight_cost) : null;
      const weight = row.weight !== null ? Number(row.weight) : null;

      const carrierUpper = (row.carrier || '').toUpperCase();
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

      if (freightCost !== null) {
        overallStats.freightTotal += freightCost;
        overallStats.freightCount++;
      }
      if (weight !== null) {
        overallStats.weightTotal += weight;
        overallStats.weightCount++;
      }

      return {
        orderNo: row.unis_order_no || '',
        poNo: row.po_no || '',
        createdAt: row.order_created_at ? row.order_created_at.toISOString() : null,
        carrier: row.carrier || '',
        serviceLevel: row.service_level,
        pcs: row.pcs !== null && row.pcs !== undefined ? row.pcs : null,
        state: row.ship_to_state || '',
        weight: weight,
        freightCost: freightCost
      };
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
      avgWeight: overallStats.weightCount > 0 ? round2(overallStats.weightTotal / overallStats.weightCount) : null,
      avgFreight: overallStats.freightCount > 0 ? round2(overallStats.freightTotal / overallStats.freightCount) : null,
      totalFreight: round2(overallStats.freightTotal),
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
