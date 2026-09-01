const fs = require('fs');
for (const rawLine of fs.readFileSync('.env', 'utf8').split('\n')) {
  const line = rawLine.trim();
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const fetch = require('node-fetch');

const baseUrl = process.env.THREEPL_API_URL;
const auth = 'Basic ' + Buffer.from(`${process.env.THREEPL_USERNAME}:${process.env.THREEPL_PASSWORD}`).toString('base64');

async function tryStatusParam(extraFields) {
  const body = {
    CompanyID: process.env.THREEPL_COMPANY_ID,
    CustomerID: process.env.THREEPL_CUSTOMER_ID,
    FacilityID: process.env.THREEPL_FACILITY_ID,
    CreatedWhenFrom: '2025-08-07T00:00:00.000',
    CreatedWhenTo: '2025-08-28T00:00:00.000',
    Paging: { PageNo: 1, Limit: 200 },
    ...extraFields
  };
  const res = await fetch(`${baseUrl}/edi/outbound/order-level/search-by-paging`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  const rows = data.results?.data || [];
  const statuses = {};
  for (const r of rows) statuses[r.Status] = (statuses[r.Status] || 0) + 1;
  console.log(JSON.stringify(extraFields), '-> totalPage:', data.paging?.totalPage, 'rowsOnPage:', rows.length, 'statuses:', statuses);
}

(async () => {
  await tryStatusParam({});
  await tryStatusParam({ Status: 'Shipped' });
  await tryStatusParam({ Status: 'SHIPPED' });
  await tryStatusParam({ OrderStatus: 'Shipped' });
})().catch(e => console.error(e));
