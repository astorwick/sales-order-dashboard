const fetch = require('node-fetch');
const { withRetry, httpRetryDecision } = require('./retry');

// Extensiv (3PL Central / secure-wms) client for the NAFG Canada tenant. Used by the
// Unshipped Orders - CA tab as the CA counterpart of ThreePLClient (UNIS).

// Renew the token when it has less than this long left, so a call never starts with a
// token that expires mid-request.
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

// Shopify order names per RQL `poNum=in=(...)` request — keeps the query string short.
const PO_CHUNK_SIZE = 40;

const STATUS_COMPLETE = 1;
const STATUS_CANCELED = 2;

// Module-level so warm serverless invocations reuse the token instead of requesting a new
// one per page load. A cold start just requests a fresh one.
let cachedToken = null; // { accessToken, expiresAt }

// Extensiv returns timestamps in Eastern Time without a timezone marker (confirmed against
// query timing during the Celigo DF2 build). Same approach as parsePTTimestamp in threepl.js.
function parseEasternTimestamp(str) {
  if (!str) return null;
  const approx = new Date(str + 'Z');
  if (isNaN(approx)) return null;
  const etOff = new Date(approx.toLocaleString('en-US', { timeZone: 'America/Toronto' }))
              - new Date(approx.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(approx - etOff).toISOString();
}

class ExtensivClient {
  constructor() {
    this.baseUrl = process.env.EXTENSIV_API_URL || 'https://secure-wms.com';
    this.clientId = process.env.EXTENSIV_CLIENT_ID;
    this.clientSecret = process.env.EXTENSIV_CLIENT_SECRET;
    this.userLoginId = parseInt(process.env.EXTENSIV_USER_LOGIN_ID);
    this.customerId = process.env.EXTENSIV_CUSTOMER_ID;
  }

  async getAccessToken() {
    if (cachedToken && cachedToken.expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS) {
      return cachedToken.accessToken;
    }

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const response = await fetch(`${this.baseUrl}/AuthServer/api/Token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ grant_type: 'client_credentials', user_login_id: this.userLoginId })
    });

    if (!response.ok) {
      throw new Error(`Extensiv token error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    cachedToken = {
      accessToken: json.access_token,
      expiresAt: Date.now() + (json.expires_in || 3600) * 1000
    };
    return cachedToken.accessToken;
  }

  // GET with retry on 429/5xx, plus one token renewal + retry on 401 (e.g. the token was
  // revoked or expired earlier than its expires_in said).
  async get(pathAndQuery) {
    let renewed = false;
    return withRetry(async () => {
      const token = await this.getAccessToken();
      const response = await fetch(`${this.baseUrl}${pathAndQuery}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      if (response.status === 401 && !renewed) {
        renewed = true;
        cachedToken = null;
        return { retry: true, delayMs: 0 };
      }

      const retryDecision = httpRetryDecision(response);
      if (retryDecision) return retryDecision;

      if (!response.ok) {
        throw new Error(`Extensiv API error: ${response.status} ${response.statusText}`);
      }

      return { retry: false, value: await response.json() };
    });
  }

  // All Extensiv orders for this customer whose PoNum is in `poNumbers`, across pages.
  async searchOrdersByPoNums(poNumbers) {
    const orders = [];
    for (let i = 0; i < poNumbers.length; i += PO_CHUNK_SIZE) {
      const chunk = poNumbers.slice(i, i + PO_CHUNK_SIZE);
      const rql = `readOnly.customerIdentifier.id==${this.customerId};poNum=in=(${chunk.join(',')})`;
      for (let page = 1; ; page++) {
        const data = await this.get(`/orders?pgsiz=100&pgnum=${page}&detail=All&rql=${encodeURIComponent(rql)}`);
        const list = data.ResourceList || [];
        orders.push(...list);
        if (list.length < 100 || orders.length >= (data.TotalResults || 0)) break;
      }
    }
    return orders;
  }

  mapOrderStatus(order) {
    const ro = order.ReadOnly || {};
    const isShipped = ro.Status === STATUS_COMPLETE && !!ro.ProcessDate;
    const packageTracking = (ro.Packages || []).map(p => p.TrackingNumber).filter(Boolean);
    const trackingNumbers = [...new Set([order.RoutingInfo?.TrackingNumber, ...packageTracking].filter(Boolean))];

    // Field names match ThreePLClient.getOrderStatus so api/orders.js can treat both 3PLs the
    // same way (unisOrderNo is the generic "3PL order #" there).
    return {
      unisOrderNo: ro.OrderId ? String(ro.OrderId) : null,
      referenceNo: order.ReferenceNum,
      poNo: order.PoNum,
      extensivStatus: ro.Status,
      createdAt: parseEasternTimestamp(ro.CreationDate),
      shippedDate: isShipped ? parseEasternTimestamp(ro.ProcessDate) : null,
      carrier: order.RoutingInfo?.Carrier || null,
      trackingNumber: trackingNumbers[0] || null,
      trackingNumbers,
      isShipped,
      stage: isShipped ? 'shipped' : 'warehouse_received'
    };
  }

  // Same contract as ThreePLClient.getOrderStatuses: { [poNo]: status | null }.
  // A Shopify order can match several Extensiv orders: SAP sends a new delivery (and so a new
  // Extensiv order) when a 3PL request is canceled and re-sent, and the canceled one stays in
  // Extensiv with ReferenceNum "<ref>-CANCELED-<id>". The newest non-canceled order wins. If
  // every match is canceled, the order is reported as not in the warehouse, with
  // threePlCanceled set so it can be surfaced as a possible cause.
  async getOrderStatuses(poNumbers) {
    const results = {};
    for (const poNo of poNumbers) results[poNo] = null;
    if (poNumbers.length === 0) return results;

    const startTime = Date.now();
    const orders = await this.searchOrdersByPoNums(poNumbers);

    const byPo = {};
    for (const order of orders) {
      if (!order.PoNum || !(order.PoNum in results)) continue;
      (byPo[order.PoNum] = byPo[order.PoNum] || []).push(order);
    }

    for (const [poNo, matches] of Object.entries(byPo)) {
      const live = matches
        .filter(o => o.ReadOnly?.Status !== STATUS_CANCELED)
        .sort((a, b) => (b.ReadOnly?.CreationDate || '').localeCompare(a.ReadOnly?.CreationDate || ''));
      results[poNo] = live.length > 0
        ? this.mapOrderStatus(live[0])
        : { threePlCanceled: true, canceledOrderIds: matches.map(o => String(o.ReadOnly?.OrderId)) };
    }

    const found = Object.values(results).filter(r => r && !r.threePlCanceled);
    const shipped = found.filter(r => r.isShipped).length;
    const canceledOnly = Object.values(results).filter(r => r?.threePlCanceled).length;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Extensiv: ${found.length}/${poNumbers.length} orders in ${elapsed}s (${orders.length} Extensiv records, shipped: ${shipped}, canceled-only: ${canceledOnly})`);

    return results;
  }
}

module.exports = ExtensivClient;
module.exports.parseEasternTimestamp = parseEasternTimestamp;
