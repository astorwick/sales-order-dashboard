const ShopifyClient = require('./lib/shopify');
const ThreePLClient = require('./lib/threepl');
(async () => {
  const s = new ShopifyClient(), t = new ThreePLClient();
  const from = new Date('2026-10-09T07:02:24Z'), until = new Date();
  let t0 = Date.now();
  const u = await t.getShippedOrdersInRange(from, until);
  console.log(`UNIS shipped: ${u.length} in ${(Date.now()-t0)/1000}s`); t0 = Date.now();
  const so = await s.getOrdersByNames(u.map(o=>o.poNo).filter(Boolean));
  console.log(`Shopify: ${so.length} in ${(Date.now()-t0)/1000}s`); t0 = Date.now();
  const ct = await t.getOrderCreateTimesForShipments(u.map(o=>({unisOrderNo:o.unisOrderNo,poNo:o.poNo})));
  console.log(`Create times: ${ct.size}/${u.length} in ${(Date.now()-t0)/1000}s`);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
