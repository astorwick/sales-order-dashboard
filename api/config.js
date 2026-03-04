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
      shopifyToSap: parseInt(process.env.THRESHOLD_SHOPIFY_TO_SAP) || 60,           // 1 hour
      sapTo3plRequest: parseInt(process.env.THRESHOLD_SAP_TO_3PL_REQUEST) || 120,    // 2 hours
      threePlRequestToReceived: parseInt(process.env.THRESHOLD_3PL_REQUEST_TO_RECEIVED) || 240, // 4 hours
      receivedToShipped: parseInt(process.env.THRESHOLD_RECEIVED_TO_SHIPPED) || 1440  // 24 hours
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
