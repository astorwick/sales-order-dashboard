const db = require('../lib/db');

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
    // Groups: one row per po_no that has more than one UNIS shipment record, with
    // per-shipment detail as parallel arrays (ordered by shipped_date) — used to compute
    // the "extra" freight cost (every shipment past the first one per order).
    const { rows: groups } = await db.query(`
      SELECT po_no, count(*) AS shipment_count,
             array_agg(freight_cost ORDER BY shipped_date) AS freight_costs
      FROM parcel_shipments
      WHERE po_no IS NOT NULL AND po_no != ''
      GROUP BY po_no
      HAVING count(*) > 1
    `);

    const duplicatePoNos = groups.map(g => g.po_no);

    let extraShipments = 0;
    let totalExtraFreightCost = 0;
    for (const g of groups) {
      extraShipments += g.shipment_count - 1;
      const extraCosts = g.freight_costs.slice(1);
      totalExtraFreightCost += extraCosts.reduce((sum, f) => sum + (f !== null ? Number(f) : 0), 0);
    }

    // Flat, one-row-per-shipment view for the table. Duplicate pairs are always shipped
    // within seconds/minutes of each other in practice, so sorting by shipped_date alone
    // naturally keeps each pair adjacent without needing an explicit group-by sort.
    const { rows } = duplicatePoNos.length > 0
      ? await db.query(`
          SELECT po_no, unis_order_no, order_created_at, shipped_date, carrier, tracking_number,
                 weight, freight_cost, count(*) OVER (PARTITION BY po_no) AS group_size
          FROM parcel_shipments
          WHERE po_no = ANY($1::text[])
          ORDER BY shipped_date DESC
        `, [duplicatePoNos])
      : { rows: [] };

    const shipments = rows.map(row => ({
      poNo: row.po_no || '',
      orderNo: row.unis_order_no || '',
      createdAt: row.order_created_at ? row.order_created_at.toISOString() : null,
      shippedDate: row.shipped_date ? row.shipped_date.toISOString() : null,
      carrier: row.carrier || '',
      trackingNumber: row.tracking_number || null,
      weight: row.weight !== null ? Number(row.weight) : null,
      freightCost: row.freight_cost !== null ? Number(row.freight_cost) : null,
      groupSize: Number(row.group_size)
    }));

    const round2 = (n) => Math.round(n * 100) / 100;

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        duplicateGroups: groups.length,
        extraShipments,
        totalExtraFreightCost: round2(totalExtraFreightCost)
      },
      shipments
    });
  } catch (error) {
    console.error('Error fetching duplicate shipments:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
