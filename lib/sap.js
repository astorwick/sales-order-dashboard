const fetch = require('node-fetch');

class SAPClient {
  constructor() {
    this.baseUrl = process.env.SAP_BYD_URL;
    this.username = process.env.SAP_BYD_USERNAME;
    this.password = process.env.SAP_BYD_PASSWORD;
  }

  getAuthHeader() {
    const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    return `Basic ${credentials}`;
  }

  async getAllRecentOrders(daysBack = 7) {
    // Fetch all sales orders created in the last N days in a single query
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);
    const sinceDateStr = sinceDate.toISOString().split('T')[0]; // YYYY-MM-DD format

    // Query with date filter and pagination
    const filter = encodeURIComponent(`CreationDateTime ge datetime'${sinceDateStr}T00:00:00'`);
    const url = `${this.baseUrl}/sap/byd/odata/v1/khsalesorder/SalesOrderCollection?$filter=${filter}&$format=json&$top=1000`;

    const response = await fetch(url, {
      headers: {
        'Authorization': this.getAuthHeader(),
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`SAP API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.d?.results || [];
  }

  async getSalesOrders(shopifyOrderNames, daysBack = 7) {
    // Skip SAP integration for now - return empty results
    // TODO: Re-enable once SAP OData report is configured
    const skipSAP = process.env.SKIP_SAP === 'true' || true; // Default to skip for now

    const results = {};

    // Initialize all as null (not found)
    for (const orderName of shopifyOrderNames) {
      results[orderName] = null;
    }

    if (skipSAP) {
      console.log('SAP: Skipped (SKIP_SAP=true)');
      return results;
    }

    try {
      // Fetch all recent SAP orders in one API call
      const allSapOrders = await this.getAllRecentOrders(daysBack);

      // Index by ExternalReference for fast lookup
      const sapOrdersByRef = {};
      for (const order of allSapOrders) {
        if (order.ExternalReference) {
          sapOrdersByRef[order.ExternalReference] = {
            sapOrderId: order.SalesOrderID,
            status: order.Status,
            createdAt: this.parseODataDate(order.CreationDateTime),
            externalReference: order.ExternalReference,
            deliveryStatus: order.DeliveryStatus
          };
        }
      }

      // Match requested order names to SAP orders
      for (const orderName of shopifyOrderNames) {
        if (sapOrdersByRef[orderName]) {
          results[orderName] = sapOrdersByRef[orderName];
        }
      }

      console.log(`SAP: Fetched ${allSapOrders.length} orders, matched ${Object.values(results).filter(Boolean).length}`);
    } catch (error) {
      console.error('Error fetching SAP orders:', error.message);
    }

    return results;
  }

  parseODataDate(odataDate) {
    // SAP OData dates come in format: /Date(1234567890000)/
    if (!odataDate) return null;
    const match = odataDate.match(/\/Date\((\d+)\)\//);
    if (match) {
      return new Date(parseInt(match[1]));
    }
    return new Date(odataDate);
  }
}

module.exports = SAPClient;
