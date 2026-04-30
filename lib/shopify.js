const fetch = require('node-fetch');

class ShopifyClient {
  constructor() {
    this.storeUrl = process.env.SHOPIFY_STORE_URL;
    this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    this.apiVersion = '2024-01';
  }

  async getOrders(daysBack = 7) {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);
    const sinceDateStr = sinceDate.toISOString();

    let allOrders = [];
    let cursor = null;
    let hasNextPage = true;

    console.log(`Shopify: Fetching orders since ${sinceDateStr}...`);

    // Use GraphQL to get displayFulfillmentStatus which properly shows ON_HOLD
    while (hasNextPage) {
      const afterClause = cursor ? `, after: "${cursor}"` : '';
      const query = `
        {
          orders(first: 100, query: "created_at:>='${sinceDateStr}' AND NOT fulfillment_status:fulfilled AND status:open"${afterClause}) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                name
                email
                createdAt
                updatedAt
                displayFulfillmentStatus
                displayFinancialStatus
                cancelledAt
                cancelReason
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                shippingAddress {
                  name
                  company
                  address1
                  address2
                  city
                  province
                  country
                  zip
                }
                billingAddress {
                  name
                  company
                  address1
                  address2
                  city
                  province
                  country
                  zip
                }
                lineItems(first: 50) {
                  edges {
                    node {
                      name
                      quantity
                      sku
                      vendor
                    }
                  }
                }
                fulfillmentOrders(first: 10) {
                  edges {
                    node {
                      assignedLocation {
                        name
                      }
                      lineItems(first: 50) {
                        edges {
                          node {
                            lineItem {
                              sku
                            }
                          }
                        }
                      }
                    }
                  }
                }
                fulfillments {
                  createdAt
                  trackingInfo {
                    number
                    url
                    company
                  }
                }
              }
            }
          }
        }
      `;

      const response = await fetch(`https://${this.storeUrl}/admin/api/${this.apiVersion}/graphql.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': this.accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
      });

      if (!response.ok) {
        throw new Error(`Shopify GraphQL API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.errors) {
        console.error('Shopify GraphQL errors:', data.errors);
        throw new Error(`Shopify GraphQL error: ${data.errors[0].message}`);
      }

      const orders = data.data.orders.edges.map(edge => edge.node);
      allOrders = allOrders.concat(orders);

      hasNextPage = data.data.orders.pageInfo.hasNextPage;
      cursor = data.data.orders.pageInfo.endCursor;

      console.log(`Shopify: Fetched ${allOrders.length} orders so far...`);
    }

    console.log(`Shopify: Total ${allOrders.length} orders`);

    return allOrders.map(order => {
      // Extract unique vendors from line items
      const lineItems = order.lineItems.edges.map(e => e.node);
      const vendors = [...new Set(
        lineItems
          .map(item => item.vendor)
          .filter(Boolean)
      )];

      // Extract tracking info from fulfillments
      const fulfillments = order.fulfillments || [];
      const trackingNumbers = fulfillments
        .flatMap(f => f.trackingInfo || [])
        .map(t => t.number)
        .filter(Boolean);
      const trackingUrls = fulfillments
        .flatMap(f => f.trackingInfo || [])
        .map(t => t.url)
        .filter(Boolean);
      const carriers = [...new Set(
        fulfillments
          .flatMap(f => f.trackingInfo || [])
          .map(t => t.company)
          .filter(Boolean)
      )];

      const latestFulfillment = fulfillments.length > 0
        ? fulfillments[fulfillments.length - 1]
        : null;

      // Check fulfillment status using displayFulfillmentStatus from GraphQL
      // Possible values: UNFULFILLED, PARTIALLY_FULFILLED, FULFILLED, RESTOCKED, PENDING_FULFILLMENT, OPEN, IN_PROGRESS, ON_HOLD, SCHEDULED
      const fulfillmentStatus = order.displayFulfillmentStatus;
      const isFulfilled = fulfillmentStatus === 'FULFILLED';
      const isOnHold = fulfillmentStatus === 'ON_HOLD';
      const isCanceled = order.cancelledAt !== null;

      // Check for long address fields (>40 characters) in shipping or billing address
      const shippingAddress = order.shippingAddress || {};
      const billingAddress = order.billingAddress || {};
      const addressFields = [
        shippingAddress.name, shippingAddress.company,
        shippingAddress.address1, shippingAddress.address2,
        shippingAddress.city, shippingAddress.province, shippingAddress.country,
        billingAddress.name, billingAddress.company,
        billingAddress.address1, billingAddress.address2,
        billingAddress.city, billingAddress.province, billingAddress.country
      ].filter(Boolean);
      const hasLongAddress = addressFields.some(field => field.length > 40);
      const longAddressFields = addressFields.filter(field => field.length > 40);

      // Build SKU → location map from fulfillment orders
      const skuLocationMap = {};
      (order.fulfillmentOrders?.edges || []).forEach(foEdge => {
        const fo = foEdge.node;
        const locationName = fo.assignedLocation?.name || '';
        (fo.lineItems?.edges || []).forEach(liEdge => {
          const sku = liEdge.node.lineItem?.sku || '';
          if (sku) {
            skuLocationMap[sku] = locationName;
          }
        });
      });

      // Extract order number from name (e.g., "#123456" -> 123456)
      const orderNumber = parseInt(order.name.replace('#', '')) || 0;

      // Use shipping address name as customer name (avoids needing read_customers permission)
      const customerName = shippingAddress.name || order.email || 'Guest';

      return {
        id: order.id,
        orderNumber: orderNumber,
        name: order.name,
        email: order.email,
        customerName: customerName,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        totalPrice: order.totalPriceSet?.shopMoney?.amount || '0',
        currency: order.totalPriceSet?.shopMoney?.currencyCode || 'USD',
        financialStatus: order.displayFinancialStatus,
        fulfillmentStatus: fulfillmentStatus,
        vendors: vendors,
        // Status flags
        isFulfilled: isFulfilled,
        isOnHold: isOnHold,
        isCanceled: isCanceled,
        hasLongAddress: hasLongAddress,
        longAddressFields: longAddressFields,
        // Tracking info from Shopify
        trackingNumbers: trackingNumbers,
        trackingNumber: trackingNumbers[0] || null,
        trackingUrls: trackingUrls,
        carriers: carriers,
        carrier: carriers[0] || null,
        fulfilledAt: latestFulfillment?.createdAt || null,
        lineItems: lineItems.map(item => ({
          name: item.name,
          quantity: item.quantity,
          sku: item.sku,
          vendor: item.vendor || null,
          location: skuLocationMap[item.sku] || null
        }))
      };
    });
  }

  async getUSPSFulfillments(daysBack) {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);
    const sinceDateStr = sinceDate.toISOString();

    let allOrders = [];
    let cursor = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const afterClause = cursor ? `, after: "${cursor}"` : '';
      const query = `
        {
          orders(first: 250, query: "created_at:>='${sinceDateStr}' AND NOT fulfillment_status:unshipped AND NOT status:cancelled"${afterClause}) {
            pageInfo { hasNextPage endCursor }
            edges {
              node {
                name
                createdAt
                fulfillments {
                  displayStatus
                  createdAt
                  trackingInfo {
                    company
                    number
                    url
                  }
                }
              }
            }
          }
        }
      `;

      const response = await fetch(`https://${this.storeUrl}/admin/api/${this.apiVersion}/graphql.json`, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': this.accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });

      if (!response.ok) throw new Error(`Shopify API error: ${response.status}`);
      const data = await response.json();
      if (data.errors) throw new Error(data.errors[0].message);

      allOrders = allOrders.concat(data.data.orders.edges.map(e => e.node));
      hasNextPage = data.data.orders.pageInfo.hasNextPage;
      cursor = data.data.orders.pageInfo.endCursor;
    }

    // Flatten to one row per USPS tracking number
    const fulfillments = [];
    for (const order of allOrders) {
      for (const fulfillment of (order.fulfillments || [])) {
        const uspsTracking = (fulfillment.trackingInfo || []).filter(t =>
          (t.company || '').toUpperCase() === 'USPS'
        );
        for (const tracking of uspsTracking) {
          fulfillments.push({
            orderName: order.name,
            orderCreatedAt: order.createdAt,
            fulfilledAt: fulfillment.createdAt,
            trackingNumber: tracking.number || null,
            trackingUrl: tracking.url || null,
            shipmentStatus: fulfillment.displayStatus || 'UNKNOWN'
          });
        }
      }
    }

    return fulfillments;
  }

  async getFulfilledOrders(daysBack = 7) {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);
    const sinceDateStr = sinceDate.toISOString();

    let allOrders = [];
    let cursor = null;
    let hasNextPage = true;

    console.log(`Shopify: Fetching fulfilled/partial orders since ${sinceDateStr}...`);

    while (hasNextPage) {
      const afterClause = cursor ? `, after: "${cursor}"` : '';
      const query = `
        {
          orders(first: 100, query: "created_at:>='${sinceDateStr}' AND NOT fulfillment_status:unshipped AND NOT status:cancelled"${afterClause}) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                name
                createdAt
                displayFulfillmentStatus
                fulfillmentOrders(first: 10) {
                  edges {
                    node {
                      assignedLocation {
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const response = await fetch(`https://${this.storeUrl}/admin/api/${this.apiVersion}/graphql.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': this.accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
      });

      if (!response.ok) {
        throw new Error(`Shopify GraphQL API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.errors) {
        console.error('Shopify GraphQL errors:', data.errors);
        throw new Error(`Shopify GraphQL error: ${data.errors[0].message}`);
      }

      const orders = data.data.orders.edges.map(edge => edge.node);
      allOrders = allOrders.concat(orders);

      hasNextPage = data.data.orders.pageInfo.hasNextPage;
      cursor = data.data.orders.pageInfo.endCursor;

      console.log(`Shopify (fulfilled): Fetched ${allOrders.length} orders so far...`);
    }

    console.log(`Shopify (fulfilled): Total ${allOrders.length} raw orders`);

    // Filter for FULFILLED/PARTIALLY_FULFILLED shipping from SEKO Global
    const filtered = allOrders
      .filter(order => {
        const status = order.displayFulfillmentStatus;
        return status === 'FULFILLED' || status === 'PARTIALLY_FULFILLED';
      })
      .filter(order => {
        return (order.fulfillmentOrders?.edges || []).some(foEdge => {
          const locationName = foEdge.node.assignedLocation?.name || '';
          return locationName === 'On Hand Inventory (SEKO Global)';
        });
      })
      .map(order => ({
        name: order.name,
        createdAt: order.createdAt
      }));

    console.log(`Shopify (fulfilled): ${filtered.length} orders from SEKO Global`);
    return filtered;
  }

  async getOrdersByDateRange(daysBack = 30) {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);
    const sinceDateStr = sinceDate.toISOString();

    let allOrders = [];
    let cursor = null;
    let hasNextPage = true;

    console.log(`Shopify: Fetching ALL orders (including fulfilled) since ${sinceDateStr}...`);

    while (hasNextPage) {
      const afterClause = cursor ? `, after: "${cursor}"` : '';
      const query = `
        {
          orders(first: 250, query: "created_at:>='${sinceDateStr}' AND NOT status:cancelled"${afterClause}) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                name
                createdAt
                lineItems(first: 50) {
                  edges {
                    node {
                      quantity
                      sku
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const response = await fetch(`https://${this.storeUrl}/admin/api/${this.apiVersion}/graphql.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': this.accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
      });

      if (!response.ok) {
        throw new Error(`Shopify GraphQL API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.errors) {
        console.error('Shopify GraphQL errors:', data.errors);
        throw new Error(`Shopify GraphQL error: ${data.errors[0].message}`);
      }

      const orders = data.data.orders.edges.map(edge => edge.node);
      allOrders = allOrders.concat(orders);

      hasNextPage = data.data.orders.pageInfo.hasNextPage;
      cursor = data.data.orders.pageInfo.endCursor;

      console.log(`Shopify (all orders): Fetched ${allOrders.length} orders so far...`);
    }

    console.log(`Shopify (all orders): Total ${allOrders.length} orders`);

    // Flatten into {sku, quantity, orderDate} for aggregation
    const lineItems = [];
    allOrders.forEach(order => {
      const orderDate = new Date(order.createdAt);
      (order.lineItems?.edges || []).forEach(edge => {
        const item = edge.node;
        if (item.sku) {
          lineItems.push({
            sku: item.sku,
            quantity: item.quantity,
            orderDate: orderDate
          });
        }
      });
    });

    return lineItems;
  }

  getNextPageUrl(linkHeader) {
    if (!linkHeader) return null;

    // Parse Link header: <url>; rel="next", <url>; rel="previous"
    const links = linkHeader.split(',');
    for (const link of links) {
      const match = link.match(/<([^>]+)>;\s*rel="next"/);
      if (match) {
        return match[1];
      }
    }
    return null;
  }

  async getOrder(orderId) {
    const url = `https://${this.storeUrl}/admin/api/${this.apiVersion}/orders/${orderId}.json`;

    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status}`);
    }

    const data = await response.json();
    return data.order;
  }
}

module.exports = ShopifyClient;
