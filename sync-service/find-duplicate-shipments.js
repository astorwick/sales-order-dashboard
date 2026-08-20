// One-off/periodic report: flags any Shopify order (po_no) with more than one UNIS
// shipment (DC) record. A po_no should map to exactly one shipment request — more than
// one usually means a duplicate got created upstream (e.g. an ERP integration glitch),
// not a legitimate multi-package split. Run manually: node sync-service/find-duplicate-shipments.js
const db = require('../lib/db');

async function main() {
  const { rows } = await db.query(`
    SELECT po_no, count(*) AS shipment_count,
           array_agg(unis_order_no ORDER BY shipped_date) AS unis_order_nos,
           array_agg(shipped_date ORDER BY shipped_date) AS shipped_dates,
           array_agg(tracking_number ORDER BY shipped_date) AS tracking_numbers,
           array_agg(carrier ORDER BY shipped_date) AS carriers,
           array_agg(weight ORDER BY shipped_date) AS weights,
           array_agg(freight_cost ORDER BY shipped_date) AS freight_costs
    FROM parcel_shipments
    WHERE po_no IS NOT NULL AND po_no != ''
    GROUP BY po_no
    HAVING count(*) > 1
    ORDER BY po_no
  `);

  if (rows.length === 0) {
    console.log('No duplicate shipments found — every po_no maps to exactly one UNIS shipment.');
    await db.pool.end();
    return;
  }

  console.log(`Found ${rows.length} Shopify order(s) with more than one UNIS shipment record:\n`);

  let totalExtraFreight = 0;
  for (const row of rows) {
    console.log(`${row.po_no} (${row.shipment_count} shipments):`);
    for (let i = 0; i < row.unis_order_nos.length; i++) {
      const freight = row.freight_costs[i];
      console.log(
        `  - ${row.unis_order_nos[i]}: shipped ${row.shipped_dates[i]?.toISOString?.() || row.shipped_dates[i]}, ` +
        `carrier ${row.carriers[i]}, tracking ${row.tracking_numbers[i]}, weight ${row.weights[i]}, freight $${freight}`
      );
    }
    // Count every shipment past the first as "extra" cost attributable to the duplicate
    const extra = row.freight_costs.slice(1).reduce((sum, f) => sum + (Number(f) || 0), 0);
    totalExtraFreight += extra;
    console.log('');
  }

  console.log(`Total "extra" freight cost across all duplicates (sum of all but the first shipment per order): $${totalExtraFreight.toFixed(2)}`);

  await db.pool.end();
}

main().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
