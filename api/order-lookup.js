const ThreePLClient = require('../lib/threepl');

const ALLOWED_ORIGINS = [
  'https://sales-order-dashboard-pi.vercel.app',
  'https://sales-order-dashboard-bquqnyeu0-anthonystorwick-1458s-projects.vercel.app'
];

const FIELDS = ['poNo', 'referenceNo', 'createdWhenFrom', 'createdWhenTo'];

module.exports = async (req, res) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const criteria = {};
  for (const field of FIELDS) {
    criteria[field] = typeof body[field] === 'string' ? body[field].trim() : '';
  }

  // With every field blank UNIS returns the entire order history (~138K orders,
  // 1,300+ pages) rather than nothing — require at least one criterion.
  if (!FIELDS.some(field => criteria[field])) {
    return res.status(400).json({ success: false, error: 'Enter at least one search field' });
  }

  const pageNo = parseInt(body.pageNo, 10);
  criteria.pageNo = pageNo > 0 ? pageNo : 1;

  try {
    const threePL = new ThreePLClient();
    const data = await threePL.searchOrderLevelRaw(criteria);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error looking up orders:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
