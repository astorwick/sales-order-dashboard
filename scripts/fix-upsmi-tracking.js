// Corrects the tracking carrier on Shopify fulfillments for UPS Mail Innovations shipments
// (UNIS carrier "BTSHP", briefly "BatchShip"). Those labels carry USPS-format 92... tracking
// numbers, so Shopify inferred USPS and linked customers to a USPS page that doesn't track them.
//
// Dry run by default — prints what it would change. Pass --apply to write. Never notifies
// customers.
//
//   node _run_with_env.js scripts/fix-upsmi-tracking.js --order "#1031666" [--apply]
//   node _run_with_env.js scripts/fix-upsmi-tracking.js --all [--limit 25] [--apply]
//
// Sends only { company, number } (no url): confirmed on #1031666 (2026-10-08) that Shopify
// then builds a working ups.com WebTracking link on its own.

const fetch = require('node-fetch');
const db = require('../lib/db');
const { withRetry, httpRetryDecision } = require('../lib/retry');

const API_VERSION = '2025-10';
const COMPANY = 'UPS';

function parseArgs(argv) {
  const args = { order: null, all: false, limit: null, apply: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--order') args.order = argv[++i];
    else if (argv[i] === '--all') args.all = true;
    else if (argv[i] === '--limit') args.limit = parseInt(argv[++i], 10);
    else if (argv[i] === '--apply') args.apply = true;
  }
  return args;
}

async function shopifyGraphql(query, variables) {
  return withRetry(async () => {
    const response = await fetch(
      `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query, variables })
      }
    );
    const decision = httpRetryDecision(response);
    if (decision) return decision;
    if (!response.ok) {
      throw new Error(`Shopify GraphQL API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    if (data.errors) {
      if (data.errors.some(e => e.extensions && e.extensions.code === 'THROTTLED')) {
        return { retry: true, error: 'Shopify throttled' };
      }
      throw new Error(`Shopify GraphQL errors: ${JSON.stringify(data.errors)}`);
    }
    return { retry: false, value: data.data };
  });
}

async function getOrderFulfillments(orderName) {
  const data = await shopifyGraphql(`
    query ($q: String!) {
      orders(first: 1, query: $q) {
        edges { node { id name fulfillments { id status trackingInfo { company number url } } } }
      }
    }
  `, { q: `name:${orderName}` });
  const node = data.orders.edges[0] && data.orders.edges[0].node;
  if (!node || node.name !== orderName) return null;
  return node;
}

async function updateTracking(fulfillmentId, number) {
  const data = await shopifyGraphql(`
    mutation ($fulfillmentId: ID!, $trackingInfoInput: FulfillmentTrackingInput!) {
      fulfillmentTrackingInfoUpdate(
        fulfillmentId: $fulfillmentId,
        trackingInfoInput: $trackingInfoInput,
        notifyCustomer: false
      ) {
        fulfillment { id trackingInfo { company number url } }
        userErrors { field message }
      }
    }
  `, { fulfillmentId, trackingInfoInput: { company: COMPANY, number } });
  return data.fulfillmentTrackingInfoUpdate;
}

// Only touch tracking numbers UNIS says went out on UPS MI.
async function getUpsmiShipments(orderName) {
  const params = [];
  let where = `upper(carrier) IN ('BTSHP', 'BATCHSHIP') AND tracking_number IS NOT NULL`;
  if (orderName) {
    params.push(orderName);
    where += ` AND po_no = $1`;
  }
  const { rows } = await db.query(
    `SELECT po_no, unis_order_no, tracking_number FROM parcel_shipments
     WHERE ${where} ORDER BY shipped_date`,
    params
  );
  const byOrder = new Map();
  for (const r of rows) {
    if (!byOrder.has(r.po_no)) byOrder.set(r.po_no, new Map());
    byOrder.get(r.po_no).set(r.tracking_number, r);
  }
  return byOrder;
}

async function processOrder(orderName, upsmiNumbers, apply, stats, verbose) {
  const shopifyOrder = await getOrderFulfillments(orderName);
  if (!shopifyOrder) {
    stats.notFound.push(orderName);
    console.log(`${orderName}: not found in Shopify`);
    return;
  }

  const seen = new Set();
  for (const f of shopifyOrder.fulfillments) {
    for (const t of f.trackingInfo) {
      const unis = upsmiNumbers.get(t.number);
      if (!unis) continue;
      seen.add(t.number);
      if (t.company === COMPANY) {
        stats.alreadyUps++;
        if (verbose) console.log(`${orderName} ${unis.unis_order_no} ${t.number}: already ${COMPANY} — skipping`);
        continue;
      }
      stats.byCurrentCompany[t.company || '(none)'] = (stats.byCurrentCompany[t.company || '(none)'] || 0) + 1;
      if (!apply) {
        stats.wouldUpdate++;
        if (verbose) {
          console.log(`${orderName} ${unis.unis_order_no} ${f.id}`);
          console.log(`  before: ${JSON.stringify(t)}`);
          console.log(`  would set company: ${COMPANY} (dry run — pass --apply to write)`);
        }
        continue;
      }
      const result = await updateTracking(f.id, t.number);
      if (result.userErrors.length > 0) {
        stats.failed.push(`${orderName} ${t.number}: ${JSON.stringify(result.userErrors)}`);
        console.log(`${orderName} ${t.number}: FAILED ${JSON.stringify(result.userErrors)}`);
        continue;
      }
      stats.updated++;
      if (verbose) {
        console.log(`${orderName} ${unis.unis_order_no} ${f.id}`);
        console.log(`  before: ${JSON.stringify(t)}`);
        console.log(`  after:  ${JSON.stringify(result.fulfillment.trackingInfo)}`);
      } else {
        const after = result.fulfillment.trackingInfo.find(x => x.number === t.number) || {};
        console.log(`${orderName} ${unis.unis_order_no} ${t.number}: ${t.company} -> ${after.company} ${after.url}`);
      }
    }
  }

  // UNIS shipped it on UPS MI but no Shopify fulfillment carries that tracking number.
  for (const number of upsmiNumbers.keys()) {
    if (!seen.has(number)) stats.unmatched.push(`${orderName} ${number}`);
  }
}

async function main() {
  const { order, all, limit, apply } = parseArgs(process.argv.slice(2));
  if (!order && !all) throw new Error('Usage: --order "#1031666" | --all [--limit N]  [--apply]');

  const byOrder = await getUpsmiShipments(all ? null : order);
  let orderNames = [...byOrder.keys()];
  if (limit) orderNames = orderNames.slice(0, limit);
  if (orderNames.length === 0) {
    console.log('No BTSHP/BatchShip shipments in parcel_shipments — nothing to do');
    return;
  }

  const stats = {
    wouldUpdate: 0, updated: 0, alreadyUps: 0, byCurrentCompany: {},
    notFound: [], unmatched: [], failed: []
  };
  const verbose = !all;
  console.log(`${apply ? 'APPLYING' : 'DRY RUN'}: ${orderNames.length} order(s)`);

  for (let i = 0; i < orderNames.length; i++) {
    await processOrder(orderNames[i], byOrder.get(orderNames[i]), apply, stats, verbose);
    if (all && (i + 1) % 100 === 0) console.log(`  ...${i + 1}/${orderNames.length}`);
  }

  console.log('\nSummary:');
  console.log(`  ${apply ? 'updated' : 'would update'}: ${apply ? stats.updated : stats.wouldUpdate}`);
  console.log(`  current carrier on those: ${JSON.stringify(stats.byCurrentCompany)}`);
  console.log(`  already ${COMPANY}: ${stats.alreadyUps}`);
  console.log(`  order not found in Shopify: ${stats.notFound.length}${stats.notFound.length ? ' ' + JSON.stringify(stats.notFound.slice(0, 10)) : ''}`);
  console.log(`  UNIS tracking # not on any Shopify fulfillment: ${stats.unmatched.length}${stats.unmatched.length ? ' ' + JSON.stringify(stats.unmatched.slice(0, 10)) : ''}`);
  console.log(`  failed: ${stats.failed.length}${stats.failed.length ? ' ' + JSON.stringify(stats.failed.slice(0, 10)) : ''}`);
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error(err.message); process.exit(1); });
