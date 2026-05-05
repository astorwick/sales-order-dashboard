const fetch = require('node-fetch');

// UNIS returns timestamps in Pacific Time without a timezone marker.
// Parse them correctly to UTC ISO strings.
function parsePTTimestamp(str) {
  if (!str) return null;
  // Parse as if UTC first to get an approximate Date (off by ≤8 h from true UTC)
  const approx = new Date(str + 'Z');
  // Compute the true PT offset at this approximate time (handles PST vs PDT)
  const ptOff = new Date(approx.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
              - new Date(approx.toLocaleString('en-US', { timeZone: 'UTC' }));
  // PT is behind UTC, so ptOff is negative — subtracting it shifts forward to UTC
  return new Date(approx - ptOff).toISOString();
}

class ThreePLClient {
  constructor() {
    this.baseUrl = process.env.THREEPL_API_URL || 'https://wise.logisticsteam.com/v2/shared/bam/v1/public';
    this.username = process.env.THREEPL_USERNAME;
    this.password = process.env.THREEPL_PASSWORD;
    this.companyId = process.env.THREEPL_COMPANY_ID;
    this.customerId = process.env.THREEPL_CUSTOMER_ID;
    this.facilityId = process.env.THREEPL_FACILITY_ID;
  }

  getAuthHeader() {
    const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    return `Basic ${credentials}`;
  }

  // Use the order-level endpoint for clearer status information
  async searchOrderLevel(options = {}) {
    const url = `${this.baseUrl}/edi/outbound/order-level/search-by-paging`;

    const body = {
      CompanyID: this.companyId,
      CustomerID: this.customerId,
      FacilityID: this.facilityId,
      PONo: options.poNo || '',
      ReferenceNo: options.referenceNo || '',
      Paging: {
        PageNo: options.pageNo || 1
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('UNIS Error Response:', errorText);
      throw new Error(`UNIS API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return {
      orders: data.results?.data || [],
      paging: data.paging || null
    };
  }

  // DC-level endpoint for shipment details (carrier, tracking, shipped time)
  async searchOrderDC(options = {}) {
    const url = `${this.baseUrl}/edi/outbound/order/dc/search-by-paging`;

    const body = {
      CompanyID: this.companyId,
      CustomerID: this.customerId,
      FacilityID: this.facilityId,
      PONo: options.poNo || '',
      ReferenceNo: options.referenceNo || '',
      Paging: {
        PageNo: options.pageNo || 1,
        ...(options.limit ? { Limit: options.limit } : {})
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('UNIS DC Error Response:', errorText);
      throw new Error(`UNIS DC API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Response structure: { Orders: [...], paging: {...} }
    return {
      orders: data.Orders || [],
      paging: data.paging || null
    };
  }

  async getParcelOrderStatus(poNo) {
    try {
      let response = await this.searchOrderDC({ poNo });
      let results = response.orders;

      if ((!results || results.length === 0) && poNo.startsWith('#')) {
        response = await this.searchOrderDC({ poNo: poNo.substring(1) });
        results = response.orders;
      }

      if ((!results || results.length === 0) && !poNo.startsWith('#')) {
        response = await this.searchOrderDC({ poNo: '#' + poNo });
        results = response.orders;
      }

      if (!results || results.length === 0) {
        return null;
      }

      const order = results[0];

      // Log field names on first call to help debug
      if (!this._dcFieldsLogged) {
        this._dcFieldsLogged = true;
        console.log('UNIS DC order keys:', JSON.stringify(Object.keys(order)));
        console.log('UNIS DC.DC keys:', JSON.stringify(Object.keys(order.DC || {})));
      }

      // Fields are nested inside the DC object
      const dc = order.DC || {};
      const isShipped = !!dc.ShippedDate;

      return {
        unisOrderNo: dc.OrderNo || '',
        poNo: order.PONo || dc.PONo || '',
        unisStatus: isShipped ? 'SHIPPED' : '',
        isShipped: isShipped,
        createdAt: dc.OrderedDate ? parsePTTimestamp(dc.OrderedDate) : null,
        shippedDate: dc.ShippedDate ? parsePTTimestamp(dc.ShippedDate) : null,
        carrier: dc.CarrierID || dc.SCACCode || '',
        trackingNumber: dc.ReferenceNo01 || dc.ReferenceNo02 || null
      };
    } catch (error) {
      console.error(`Error fetching DC status for ${poNo}:`, error.message);
      return null;
    }
  }

  async getParcelOrderStatuses(poNumbers) {
    const results = {};

    for (const poNo of poNumbers) {
      results[poNo] = null;
    }

    console.log(`UNIS DC: Querying ${poNumbers.length} orders...`);
    const startTime = Date.now();

    const CONCURRENCY = 20;
    let index = 0;
    async function worker() {
      while (index < poNumbers.length) {
        const poNo = poNumbers[index++];
        results[poNo] = await this.getParcelOrderStatus(poNo);
      }
    }
    const workers = Array.from({ length: Math.min(CONCURRENCY, poNumbers.length) }, () => worker.call(this));
    await Promise.all(workers);

    const found = Object.values(results).filter(Boolean);
    const shipped = found.filter(r => r.isShipped).length;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`UNIS DC: ${found.length}/${poNumbers.length} found in ${elapsed}s (${shipped} shipped)`);

    return results;
  }

  // Bulk-paginate the DC endpoint (200/page, newest-first) and stop once
  // ShippedDate crosses the cutoff. Returns one record per shipment.
  async getRecentShippedOrders(daysBack) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);

    const allOrders = [];
    let pageNo = 1;
    const startTime = Date.now();

    while (true) {
      const response = await this.searchOrderDC({ pageNo, limit: 200 });
      const page = response.orders;

      if (!page || page.length === 0) break;

      let hitCutoff = false;
      for (const order of page) {
        const dc = order.DC || {};
        if (!dc.ShippedDate) continue;

        const shippedDate = parsePTTimestamp(dc.ShippedDate);
        if (new Date(shippedDate) < cutoff) {
          hitCutoff = true;
          break;
        }

        allOrders.push({
          unisOrderNo: dc.OrderNo || '',
          poNo: order.PONo || dc.PONo || '',
          isShipped: true,
          createdAt: dc.OrderedDate ? parsePTTimestamp(dc.OrderedDate) : null,
          shippedDate,
          carrier: dc.CarrierID || dc.SCACCode || '',
          trackingNumber: dc.ReferenceNo01 || dc.ReferenceNo02 || null
        });
      }

      if (hitCutoff) break;

      const paging = response.paging;
      if (!paging || pageNo >= paging.totalPage) break;
      pageNo++;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`UNIS DC bulk: ${allOrders.length} shipped orders in last ${daysBack} days (${pageNo} pages, ${elapsed}s)`);
    return allOrders;
  }

  async getOrderStatus(poNo) {
    try {
      // Try searching with the original PONo first
      let response = await this.searchOrderLevel({ poNo });
      let results = response.orders;

      // If not found and PONo starts with "#", try without it
      if ((!results || results.length === 0) && poNo.startsWith('#')) {
        const poNoWithoutHash = poNo.substring(1);
        response = await this.searchOrderLevel({ poNo: poNoWithoutHash });
        results = response.orders;
      }

      // If not found and PONo doesn't start with "#", try with it
      if ((!results || results.length === 0) && !poNo.startsWith('#')) {
        response = await this.searchOrderLevel({ poNo: '#' + poNo });
        results = response.orders;
      }

      if (!results || results.length === 0) {
        return null; // Order not yet in 3PL system
      }

      const order = results[0];

      // Determine stage based on Status field
      // UNIS statuses: IMPORTED, OPEN, PICKING, PICKED, LOADING, SHIPPED, etc.
      const status = order.Status || order.status || '';
      const isShipped = status === 'SHIPPED';
      const isAtWarehouse = ['IMPORTED', 'OPEN', 'PICKING', 'PICKED', 'LOADING'].includes(status);

      // Determine our stage
      let stage = 'warehouse_received';
      if (isShipped) {
        stage = 'shipped';
      }

      return {
        unisOrderNo: order['Order #'] || order.orderId,
        referenceNo: order['Ref.#'] || order.referenceNo,
        poNo: order['PO #'] || order.poNo,

        // UNIS Status
        unisStatus: status,
        preStatus: order.PRESTATUS || order.preStatus,

        // Timestamps
        createdAt: order['Created Date'] ? parsePTTimestamp(`${order['Created Date']} ${order['Create Time'] || ''}`.trim()) : null,
        shippedDate: order['Shipped Time'] ? parsePTTimestamp(order['Shipped Time']) : (order.shippedTime ? parsePTTimestamp(order.shippedTime) : null),
        pickedTime: order['PICKED TIME'] || order.pickedTime || null,

        // Shipping details
        carrier: order.Carrier || order.carrier,
        trackingNumber: order['Pro #'] || order.proNo || null,

        // Quantities
        pickQty: order['PICK QTY'] || 0,
        shipQty: order['SHIP QTY'] || 0,

        // Status inference
        isShipped: isShipped,
        isAtWarehouse: isAtWarehouse,
        stage: stage,

        // Shipping details
        shipMethod: order['Ship Method'] || order.ShipMethod || order.shipMethod || '',
        shipToName: order['Ship To Name'],
        shipToAddress: order['Ship To Address'],
        deliveryService: order['Delivery Service']
      };
    } catch (error) {
      console.error(`Error fetching 3PL status for ${poNo}:`, error.message);
      return null;
    }
  }

  mapInventoryItem(obj) {
    // Try multiple possible key names from UNIS API
    const findVal = (...keys) => {
      for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
      }
      return null;
    };

    const sku = findVal('Item ID', 'Item Code', 'ItemCode', 'SKU') || '';
    const description = findVal('Description', 'Short Description') || '';
    const onHand = parseInt(findVal('On Hand', 'OnHand') || 0) || 0;
    const available = parseInt(findVal('Available') || 0) || 0;
    const allocated = parseInt(findVal('Allocated') || 0) || 0;
    const incoming = parseInt(findVal('Incoming') || 0) || 0;

    return {
      sku,
      description,
      onHand,
      available,
      allocated,
      incoming,
      goodType: findVal('Good Type', 'GoodType') || '',
      uom: findVal('UOM', 'Unit', 'uom') || 'EA',
      _raw: obj
    };
  }

  async getInventoryLevels() {
    const url = `${this.baseUrl}/edi/inventory/item-level/search-by-paging`;
    let allItems = [];
    let pageNo = 1;
    let hasMore = true;

    console.log('UNIS: Fetching inventory levels...');

    while (hasMore) {
      const body = {
        CompanyID: this.companyId,
        CustomerID: this.customerId,
        FacilityID: this.facilityId,
        Paging: { PageNo: pageNo, Limit: 200 }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('UNIS Inventory Error:', errorText);
        throw new Error(`UNIS Inventory API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Debug: log the raw response shape on first page
      if (pageNo === 1) {
        console.log('UNIS Inventory raw response keys:', JSON.stringify(Object.keys(data)));
        if (data.results) {
          console.log('UNIS Inventory results keys:', JSON.stringify(Object.keys(data.results)));
          const rows = data.results.data || data.results.Data || [];
          if (rows.length > 0) {
            console.log('UNIS Inventory first row keys:', JSON.stringify(Object.keys(rows[0])));
            console.log('UNIS Inventory first row sample:', JSON.stringify(rows[0]));
          }
          const head = data.results.head || data.results.Head || [];
          if (head.length > 0) {
            console.log('UNIS Inventory head array:', JSON.stringify(head));
          }
        }
        if (data.paging) {
          console.log('UNIS Inventory paging:', JSON.stringify(data.paging));
        }
      }

      const results = data.results || {};
      const head = results.head || results.Head || [];
      const rows = results.data || results.Data || [];

      let items;
      if (head.length > 0 && rows.length > 0 && Array.isArray(rows[0])) {
        // head/data array format: head = ['col1', 'col2'], data = [['val1', 'val2'], ...]
        items = rows.map(row => {
          const obj = {};
          head.forEach((key, i) => {
            obj[key] = row[i];
          });
          return this.mapInventoryItem(obj);
        });
      } else if (rows.length > 0 && typeof rows[0] === 'object') {
        // Object format: data = [{col1: 'val1', col2: 'val2'}, ...]
        items = rows.map(obj => this.mapInventoryItem(obj));
      } else {
        items = [];
      }

      allItems = allItems.concat(items);

      // Check pagination
      const paging = data.paging || {};
      const totalPages = paging.totalPage || paging.totalPages || paging.TotalPages || 1;
      hasMore = pageNo < totalPages;
      pageNo++;

      console.log(`UNIS Inventory: Page ${pageNo - 1}, ${items.length} items (total so far: ${allItems.length})`);
    }

    // Filter to GOOD inventory only
    const goodItems = allItems.filter(item => item.goodType === 'GOOD');
    console.log(`UNIS Inventory: Total ${allItems.length} items, ${goodItems.length} GOOD`);
    return goodItems;
  }

  async getUSPSShipments(daysBack) {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - daysBack);

    const fmt = d => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;

    const allShipments = [];
    let pageNo = 1;
    const startTime = Date.now();

    while (true) {
      const body = {
        CompanyID: this.companyId,
        CustomerID: this.customerId,
        FacilityID: this.facilityId,
        CreatedWhenFrom: fmt(from),
        CreatedWhenTo: fmt(to),
        Paging: { PageNo: pageNo, Limit: 200 }
      };

      const response = await fetch(`${this.baseUrl}/edi/outbound/order/dc/search-by-paging`, {
        method: 'POST',
        headers: { 'Authorization': this.getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) throw new Error(`UNIS DC error: ${response.status}`);

      const data = await response.json();
      const orders = data.Orders || [];
      if (!orders.length) break;

      for (const order of orders) {
        const dc = order.DC || {};
        if (!dc.ShippedDate) continue;
        const carrier = (dc.CarrierID || dc.SCACCode || '').toUpperCase();
        if (carrier !== 'USPS') continue;

        allShipments.push({
          poNo: order.PONo || dc.PONo || '',
          unisOrderNo: dc.OrderNo || '',
          shippedDate: parsePTTimestamp(dc.ShippedDate),
          trackingNumber: dc.masterTrackingNumber || null
        });
      }

      const paging = data.paging || {};
      if (pageNo >= (paging.totalPage || 1)) break;
      pageNo++;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`UNIS USPS shipments: ${allShipments.length} found in last ${daysBack} days (${elapsed}s)`);
    return allShipments;
  }

  async getOrderStatuses(poNumbers, daysBack = 7) {
    const results = {};

    // Initialize all as null (not found)
    for (const poNo of poNumbers) {
      results[poNo] = null;
    }

    console.log(`UNIS: Querying ${poNumbers.length} orders...`);

    const startTime = Date.now();
    const CONCURRENCY = 20;

    // Throttle to CONCURRENCY simultaneous requests — firing all at once at
    // high volume causes UNIS to reject connections (ECONNRESET/ECONNREFUSED).
    let index = 0;
    async function worker() {
      while (index < poNumbers.length) {
        const poNo = poNumbers[index++];
        results[poNo] = await this.getOrderStatus(poNo);
      }
    }
    const workers = Array.from({ length: Math.min(CONCURRENCY, poNumbers.length) }, () => worker.call(this));
    await Promise.all(workers);

    // Summarize results by stage
    const found = Object.values(results).filter(Boolean);
    const atWarehouse = found.filter(r => r.stage === 'warehouse_received').length;
    const shipped = found.filter(r => r.stage === 'shipped').length;
    const notFound = poNumbers.length - found.length;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`UNIS: ${found.length}/${poNumbers.length} orders in ${elapsed}s (at warehouse: ${atWarehouse}, shipped: ${shipped}, not in UNIS: ${notFound})`);

    // Log status breakdown for debugging
    const statusCounts = {};
    found.forEach(r => {
      statusCounts[r.unisStatus] = (statusCounts[r.unisStatus] || 0) + 1;
    });
    console.log(`UNIS Status breakdown:`, statusCounts);

    return results;
  }
}

module.exports = ThreePLClient;
