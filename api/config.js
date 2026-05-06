function requireEnvInt(name) {
  const val = process.env[name];
  if (val === undefined || val === '') throw new Error(`Missing required environment variable: ${name}`);
  const parsed = parseInt(val);
  if (isNaN(parsed)) throw new Error(`Environment variable ${name} must be an integer, got: ${val}`);
  return parsed;
}

const ALLOWED_ORIGINS = [
  'https://sales-order-dashboard-pi.vercel.app',
  'https://sales-order-dashboard-bquqnyeu0-anthonystorwick-1458s-projects.vercel.app'
];

module.exports = async (req, res) => {
  // Set CORS headers (restricted to known origins)
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

  // Thresholds in minutes
  const config = {
    thresholds: {
      shopifyToSap: requireEnvInt('THRESHOLD_SHOPIFY_TO_SAP'),
      sapTo3plRequest: requireEnvInt('THRESHOLD_SAP_TO_3PL_REQUEST'),
      threePlRequestToReceived: requireEnvInt('THRESHOLD_3PL_REQUEST_TO_RECEIVED'),
      receivedToShipped: requireEnvInt('THRESHOLD_RECEIVED_TO_SHIPPED')
    },
    stages: [
      { id: 'shopify', name: 'Shopify', description: 'Order created in Shopify' },
      { id: 'sap', name: 'SAP ERP', description: 'Order synced to SAP' },
      { id: '3pl_request', name: '3PL Request Sent', description: 'Shipment request sent to warehouse' },
      { id: 'warehouse_received', name: 'Warehouse Received', description: '3PL acknowledged order' },
      { id: 'shipped', name: 'Shipped', description: 'Tracking available' }
    ],
    refreshInterval: 900000 // 15 minutes in milliseconds
  };

  return res.status(200).json(config);
};
