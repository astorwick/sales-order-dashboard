const ShopifyClient = require('../lib/shopify');
const ThreePLClient = require('../lib/threepl');

function computeRunRates(salesItems, daysInPeriod, available) {
  const unitsSold = salesItems.reduce((sum, item) => sum + item.quantity, 0);
  const unitsPerDay = daysInPeriod > 0 ? unitsSold / daysInPeriod : 0;
  const unitsPerHour = unitsPerDay / 24;
  const unitsPerWeek = unitsPerDay * 7;
  const percentOfDailyInventory = available > 0 ? (unitsPerDay / available) * 100 : 0;

  return {
    unitsSold,
    unitsPerDay: Math.round(unitsPerDay * 100) / 100,
    unitsPerHour: Math.round(unitsPerHour * 100) / 100,
    unitsPerWeek: Math.round(unitsPerWeek * 100) / 100,
    percentOfDailyInventory: Math.round(percentOfDailyInventory * 100) / 100
  };
}

function classifyStockLevel(estimatedWeeksOfStock, hasSales) {
  if (!hasSales) return 'no-sales';
  if (estimatedWeeksOfStock < 4) return 'critical';
  if (estimatedWeeksOfStock < 8) return 'low';
  return 'healthy';
}

async function getInventoryData() {
  const shopify = new ShopifyClient();
  const threePL = new ThreePLClient();

  // Fetch inventory and 30-day sales in parallel
  const [inventoryItems, salesData] = await Promise.all([
    threePL.getInventoryLevels(),
    shopify.getOrdersByDateRange(30)
  ]);

  const now = new Date();
  const cutoff7d = new Date(now);
  cutoff7d.setDate(cutoff7d.getDate() - 7);
  const cutoff14d = new Date(now);
  cutoff14d.setDate(cutoff14d.getDate() - 14);

  // Group sales by SKU
  const salesBySku = {};
  salesData.forEach(item => {
    if (!salesBySku[item.sku]) {
      salesBySku[item.sku] = [];
    }
    salesBySku[item.sku].push(item);
  });

  // Compute run rates for each inventory SKU
  const skus = inventoryItems.map(inv => {
    const sku = inv.sku;
    const available = inv.available;
    const allSales = salesBySku[sku] || [];

    // Slice sales into time windows
    const sales7d = allSales.filter(s => s.orderDate >= cutoff7d);
    const sales14d = allSales.filter(s => s.orderDate >= cutoff14d);
    const sales30d = allSales; // all data is within 30 days

    const rates7d = computeRunRates(sales7d, 7, available);
    const rates14d = computeRunRates(sales14d, 14, available);
    const rates30d = computeRunRates(sales30d, 30, available);

    // Estimated weeks of stock uses 30-day rate
    const estimatedWeeksOfStock = rates30d.unitsPerWeek > 0
      ? Math.round((available / rates30d.unitsPerWeek) * 100) / 100
      : null;

    const hasSales = rates30d.unitsSold > 0;
    const stockLevel = classifyStockLevel(estimatedWeeksOfStock, hasSales);

    return {
      sku,
      description: inv.description,
      available,
      allocated: inv.allocated,
      incoming: inv.incoming,
      rates: {
        '7d': rates7d,
        '14d': rates14d,
        '30d': rates30d
      },
      estimatedWeeksOfStock,
      stockLevel
    };
  });

  // Summary
  const summary = {
    totalSkus: skus.length,
    totalAvailable: skus.reduce((sum, s) => sum + s.available, 0),
    critical: skus.filter(s => s.stockLevel === 'critical').length,
    low: skus.filter(s => s.stockLevel === 'low').length,
    healthy: skus.filter(s => s.stockLevel === 'healthy').length,
    noSales: skus.filter(s => s.stockLevel === 'no-sales').length
  };

  return { summary, skus };
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

  try {
    const data = await getInventoryData();

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: data.summary,
      skus: data.skus
    });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
