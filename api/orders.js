const ShopifyClient = require('../lib/shopify');
const SAPClient = require('../lib/sap');
const ThreePLClient = require('../lib/threepl');

// Stage definitions
const STAGES = {
  SHOPIFY: 'shopify',
  SAP: 'sap',
  THREEPL_REQUEST: '3pl_request',
  WAREHOUSE_RECEIVED: 'warehouse_received',
  SHIPPED: 'shipped',
  TRACKING: 'tracking'
};

const STAGE_ORDER = [
  STAGES.SHOPIFY,
  STAGES.SAP,
  STAGES.THREEPL_REQUEST,
  STAGES.WAREHOUSE_RECEIVED,
  STAGES.SHIPPED,
  STAGES.TRACKING
];

function getThresholds() {
  return {
    [STAGES.SHOPIFY]: parseInt(process.env.THRESHOLD_SHOPIFY_TO_SAP) || 60,
    [STAGES.SAP]: parseInt(process.env.THRESHOLD_SAP_TO_3PL_REQUEST) || 120,
    [STAGES.THREEPL_REQUEST]: parseInt(process.env.THRESHOLD_3PL_REQUEST_TO_RECEIVED) || 240,
    [STAGES.WAREHOUSE_RECEIVED]: parseInt(process.env.THRESHOLD_RECEIVED_TO_SHIPPED) || 1440,
    [STAGES.SHIPPED]: parseInt(process.env.THRESHOLD_SHIPPED_TO_TRACKING) || 60
  };
}

function calculateTimeInStage(stageEnteredAt) {
  if (!stageEnteredAt) return 0;
  const now = new Date();
  const entered = new Date(stageEnteredAt);
  return Math.floor((now - entered) / (1000 * 60)); // minutes
}

function isShippableOrder(lineItems) {
  // Order is shippable if at least one line item ships from "On Hand Inventory (SEKO Global)"
  // and is not a COFFEE_CLUB SKU
  if (!lineItems || lineItems.length === 0) return false;
  return lineItems.some(item =>
    item.location === 'On Hand Inventory (SEKO Global)' &&
    item.sku !== 'COFFEE_CLUB' &&
    item.sku !== 'ROUTEINS'
  );
}

function determinePossibleCause(shopifyOrder) {
  // Returns array of possible causes for stuck orders
  const causes = [];

  // Check for On Hold fulfillment status
  if (shopifyOrder.isOnHold) {
    causes.push('On Hold');
  }

  // Check for Canceled order
  if (shopifyOrder.isCanceled) {
    causes.push('Canceled');
  }

  // Check for long address fields (>40 characters)
  if (shopifyOrder.hasLongAddress) {
    causes.push('Long Address');
  }

  return causes;
}

function determineStatus(timeInStage, threshold, isShippable, stage, hasUnfulfilledLines) {
  if (isShippable === false) return 'unshippable';

  // Complete: at TRACKING stage with no remaining unfulfilled lines in Shopify
  if (stage === STAGES.TRACKING && !hasUnfulfilledLines) return 'complete';

  // Tracking found but Shopify still has unfulfilled lines — waiting for fulfillment to close
  if (stage === STAGES.TRACKING) return 'ok';

  if (!threshold) return 'ok';

  // Shipped stage: ok for the first 60 min, then missing_tracking until tracking syncs to Shopify
  if (stage === STAGES.SHIPPED) {
    return timeInStage >= threshold ? 'missing_tracking' : 'ok';
  }

  const ratio = timeInStage / threshold;
  if (ratio >= 1) return 'stuck';
  if (ratio >= 0.75) return 'warning';
  return 'ok';
}

function determineCurrentStage(shopifyOrder, sapOrder, threePlStatus) {
  // Work backwards from tracking to find current stage

  const shopifyTrackingNumbers = shopifyOrder.trackingNumbers || (shopifyOrder.trackingNumber ? [shopifyOrder.trackingNumber] : []);
  const unisTrackingNumber = threePlStatus?.trackingNumber || null;
  const unisTrackingInShopify = !!(unisTrackingNumber && shopifyTrackingNumbers.includes(unisTrackingNumber));
  const unisHasTracking = !!(unisTrackingNumber || threePlStatus?.trackingNumbers?.length > 0);

  // TRACKING stage: UNIS has shipped AND its specific tracking number is present in Shopify
  if (threePlStatus?.shippedDate && unisTrackingInShopify) {
    return {
      stage: STAGES.TRACKING,
      stageEnteredAt: shopifyOrder.fulfilledAt || shopifyOrder.updatedAt,
      trackingNumber: unisTrackingNumber,
      trackingNumbers: threePlStatus?.trackingNumbers || [unisTrackingNumber],
      carrier: threePlStatus?.carrier || shopifyOrder.carrier,
      hasTracking: true,
      shopifyHasTracking: true,
      source: 'shopify'
    };
  }

  // SHIPPED stage: UNIS has a ship date; stays here until its tracking number appears in Shopify
  if (threePlStatus?.shippedDate) {
    return {
      stage: STAGES.SHIPPED,
      stageEnteredAt: threePlStatus.shippedDate,
      trackingNumber: threePlStatus?.trackingNumber || null,
      trackingNumbers: threePlStatus?.trackingNumbers || [],
      carrier: threePlStatus?.carrier,
      hasTracking: unisHasTracking,
      shopifyHasTracking: false,
      source: 'unis'
    };
  }

  // Shopify fallback: Check if order is fulfilled but no tracking
  if (shopifyOrder.isFulfilled) {
    return {
      stage: STAGES.SHIPPED,
      stageEnteredAt: shopifyOrder.fulfilledAt || shopifyOrder.updatedAt,
      trackingNumber: null,
      trackingNumbers: [],
      carrier: shopifyOrder.carrier,
      hasTracking: false,
      source: 'shopify'
    };
  }

  // UNIS 3PL: If order exists in UNIS, it's at warehouse received stage
  // (UNIS DC search returns orders that are in the warehouse system)
  if (threePlStatus?.stage === 'warehouse_received' || threePlStatus?.createdAt) {
    return {
      stage: STAGES.WAREHOUSE_RECEIVED,
      stageEnteredAt: threePlStatus.createdAt,
      unisOrderNo: threePlStatus.unisOrderNo
    };
  }

  // If in SAP but not yet in 3PL, it's at 3PL request stage
  // (SAP has sent the order to 3PL but 3PL hasn't acknowledged yet)
  if (sapOrder) {
    return {
      stage: STAGES.THREEPL_REQUEST,
      stageEnteredAt: sapOrder.createdAt,
      sapOrderId: sapOrder.sapOrderId
    };
  }

  // Not in UNIS and not in SAP (or SAP skipped)
  // Show as Shopify stage - waiting for SAP sync
  // Note: When SAP is skipped, orders stay here until they appear in UNIS
  return {
    stage: STAGES.SHOPIFY,
    stageEnteredAt: shopifyOrder.createdAt
  };
}

async function aggregateOrders(daysBack = 7) {
  const shopify = new ShopifyClient();
  const sap = new SAPClient();
  const threePL = new ThreePLClient();
  const thresholds = getThresholds();

  // Fetch all Shopify orders
  const shopifyOrders = await shopify.getOrders(daysBack);

  if (shopifyOrders.length === 0) {
    return [];
  }

  // Get order names for batch queries (e.g., "#123456")
  // This format is used as External Reference in SAP and PONo in UNIS
  const orderNames = shopifyOrders.map(o => o.name);

  // Batch fetch from SAP and 3PL (single query each instead of per-order)
  const [sapOrders, threePlStatuses] = await Promise.all([
    sap.getSalesOrders(orderNames, daysBack),
    threePL.getOrderStatuses(orderNames)
  ]);

  // Aggregate order data
  const aggregatedOrders = shopifyOrders.map(shopifyOrder => {
    const orderName = shopifyOrder.name; // e.g., "#123456"
    const sapOrder = sapOrders[orderName];
    const threePlStatus = threePlStatuses[orderName];

    const stageInfo = determineCurrentStage(shopifyOrder, sapOrder, threePlStatus);
    const timeInStage = calculateTimeInStage(stageInfo.stageEnteredAt);
    const threshold = thresholds[stageInfo.stage];
    const shippable = isShippableOrder(shopifyOrder.lineItems);
    const hasUnfulfilledLines = !shopifyOrder.isFulfilled;
    const status = determineStatus(timeInStage, threshold, shippable, stageInfo.stage, hasUnfulfilledLines);
    const possibleCauses = determinePossibleCause(shopifyOrder);

    const stageIndex = STAGE_ORDER.indexOf(stageInfo.stage);

    return {
      // Shopify data
      id: shopifyOrder.id,
      orderNumber: shopifyOrder.orderNumber,
      orderName: shopifyOrder.name,
      customerName: shopifyOrder.customerName,
      email: shopifyOrder.email,
      createdAt: shopifyOrder.createdAt,
      totalPrice: shopifyOrder.totalPrice,
      currency: shopifyOrder.currency,
      vendors: shopifyOrder.vendors || [],
      shippable: shippable,
      lineItems: shopifyOrder.lineItems,

      // Stage info
      currentStage: stageInfo.stage,
      stageIndex: stageIndex,
      stageEnteredAt: stageInfo.stageEnteredAt,
      timeInStageMinutes: timeInStage,
      threshold: threshold,

      // Status
      status: status,
      isComplete: status === 'complete',
      hasTracking: stageInfo.hasTracking || false,
      shopifyHasTracking: stageInfo.shopifyHasTracking || false,
      possibleCauses: possibleCauses,

      // Additional details
      sapOrderId: stageInfo.sapOrderId || sapOrder?.sapOrderId,
      unisOrderNo: stageInfo.unisOrderNo || threePlStatus?.unisOrderNo,
      trackingNumber: stageInfo.trackingNumber,
      trackingNumbers: stageInfo.trackingNumbers || [],
      carrier: stageInfo.carrier,
      trackingSource: stageInfo.source || null, // 'unis' or 'shopify'
      unisShippedDate: threePlStatus?.shippedDate || null,

      // Raw data for debugging (server-side only, not sent to client)
      _sapOrder: sapOrder,
      _threePlStatus: threePlStatus
    };
  });

  // Sort by status priority (stuck first, then warning, then ok)
  const statusPriority = { unshippable: 0, missing_tracking: 1, stuck: 2, warning: 3, ok: 4, complete: 5 };
  aggregatedOrders.sort((a, b) => {
    const priorityDiff = statusPriority[a.status] - statusPriority[b.status];
    if (priorityDiff !== 0) return priorityDiff;
    // Secondary sort by time in stage (longer first)
    return b.timeInStageMinutes - a.timeInStageMinutes;
  });

  return aggregatedOrders;
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
    const daysBack = Math.min(parseInt(req.query.days) || 3, 90);
    const orders = await aggregateOrders(daysBack);

    // Summary stats
    const summary = {
      total: orders.length,
      stuck: orders.filter(o => o.status === 'stuck').length,
      unshippable: orders.filter(o => o.status === 'unshippable').length,
      missing_tracking: orders.filter(o => o.status === 'missing_tracking').length,
      warning: orders.filter(o => o.status === 'warning').length,
      ok: orders.filter(o => o.status === 'ok').length,
      complete: orders.filter(o => o.isComplete).length,
      byStage: {}
    };

    STAGE_ORDER.forEach(stage => {
      summary.byStage[stage] = orders.filter(o => o.currentStage === stage).length;
    });

    // Strip internal debug fields before sending to client
    const sanitizedOrders = orders.map(({ _sapOrder, _threePlStatus, ...order }) => order);

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      summary,
      orders: sanitizedOrders
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
