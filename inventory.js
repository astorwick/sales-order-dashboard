// Inventory Run Rate Dashboard - Frontend JavaScript

const INV_API = '/api/inventory';

// State
let invSkus = [];
let invFilters = {
  search: '',
  stockLevel: 'all',
  sort: 'stock-asc'
};

// DOM Elements (cached after DOMContentLoaded)
let invElements = {};

function cacheInvElements() {
  invElements = {
    tableBody: document.getElementById('inv-table-body'),
    search: document.getElementById('inv-search'),
    stockFilter: document.getElementById('inv-stock-filter'),
    sortFilter: document.getElementById('inv-sort'),
    summaryTotalSkus: document.getElementById('inv-summary-total-skus'),
    summaryTotalAvailable: document.getElementById('inv-summary-total-available'),
    summaryCritical: document.getElementById('inv-summary-critical'),
    summaryLow: document.getElementById('inv-summary-low'),
    summaryHealthy: document.getElementById('inv-summary-healthy'),
    summaryNosales: document.getElementById('inv-summary-nosales')
  };
}

function formatNum(val) {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return val.toLocaleString();
    return val.toFixed(2);
  }
  return val;
}

function formatWhole(val) {
  if (val === null || val === undefined) return '-';
  return Math.round(val).toLocaleString();
}

function formatPct(val) {
  if (val === null || val === undefined) return '-';
  return val.toFixed(1) + '%';
}

// API
async function fetchInventory() {
  const response = await fetch(INV_API);
  if (!response.ok) throw new Error('Failed to fetch inventory data');
  return response.json();
}

// Render
function renderInvSummary(summary) {
  invElements.summaryTotalSkus.textContent = summary.totalSkus.toLocaleString();
  invElements.summaryTotalAvailable.textContent = summary.totalAvailable.toLocaleString();
  invElements.summaryCritical.textContent = summary.critical;
  invElements.summaryLow.textContent = summary.low;
  invElements.summaryHealthy.textContent = summary.healthy;
  invElements.summaryNosales.textContent = summary.noSales;
}

function renderInvRow(sku) {
  const r7 = sku.rates['7d'];
  const r14 = sku.rates['14d'];
  const r30 = sku.rates['30d'];
  const weeks = sku.estimatedWeeksOfStock;
  const lvl = sku.stockLevel;

  return `<tr>
    <td class="inv-sku">${escapeHtml(sku.sku)}</td>
    <td><span class="inv-desc" title="${escapeHtml(sku.description)}">${escapeHtml(sku.description)}</span></td>
    <td class="num">${formatNum(sku.available)}</td>
    <td class="num period-7d">${formatNum(r7.unitsSold)}</td>
    <td class="num period-7d">${formatWhole(r7.unitsPerDay)}</td>
    <td class="num period-7d">${formatWhole(r7.unitsPerWeek)}</td>
    <td class="num period-7d">${formatPct(r7.percentOfDailyInventory)}</td>
    <td class="num period-14d">${formatNum(r14.unitsSold)}</td>
    <td class="num period-14d">${formatWhole(r14.unitsPerDay)}</td>
    <td class="num period-14d">${formatWhole(r14.unitsPerWeek)}</td>
    <td class="num period-14d">${formatPct(r14.percentOfDailyInventory)}</td>
    <td class="num period-30d">${formatNum(r30.unitsSold)}</td>
    <td class="num period-30d">${formatWhole(r30.unitsPerDay)}</td>
    <td class="num period-30d">${formatWhole(r30.unitsPerWeek)}</td>
    <td class="num period-30d">${formatPct(r30.percentOfDailyInventory)}</td>
    <td class="num est-weeks ${lvl}">${weeks !== null ? formatNum(weeks) : '-'}</td>
    <td><span class="stock-badge ${lvl}">${lvl}</span></td>
  </tr>`;
}

function renderInvTable() {
  // Filter
  let filtered = invSkus.filter(sku => {
    if (invFilters.stockLevel !== 'all' && sku.stockLevel !== invFilters.stockLevel) return false;
    if (invFilters.search) {
      const q = invFilters.search.toLowerCase();
      return sku.sku.toLowerCase().includes(q) || (sku.description || '').toLowerCase().includes(q);
    }
    return true;
  });

  // Sort
  filtered.sort((a, b) => {
    switch (invFilters.sort) {
      case 'stock-asc': {
        const aw = a.estimatedWeeksOfStock;
        const bw = b.estimatedWeeksOfStock;
        if (aw === null && bw === null) return 0;
        if (aw === null) return 1;
        if (bw === null) return -1;
        return aw - bw;
      }
      case 'stock-desc': {
        const aw = a.estimatedWeeksOfStock;
        const bw = b.estimatedWeeksOfStock;
        if (aw === null && bw === null) return 0;
        if (aw === null) return 1;
        if (bw === null) return -1;
        return bw - aw;
      }
      case 'onhand-desc':
        return b.available - a.available;
      case 'onhand-asc':
        return a.available - b.available;
      case 'velocity-desc':
        return (b.rates['30d'].unitsPerDay || 0) - (a.rates['30d'].unitsPerDay || 0);
      case 'sku-asc':
        return a.sku.localeCompare(b.sku);
      default:
        return 0;
    }
  });

  if (filtered.length === 0) {
    invElements.tableBody.innerHTML = `<tr><td colspan="17" class="empty-state">No SKUs match the current filters</td></tr>`;
    return;
  }

  invElements.tableBody.innerHTML = filtered.map(renderInvRow).join('');
}

function renderInvLoading() {
  invElements.tableBody.innerHTML = `<tr><td colspan="17" class="loading"><div class="loading-spinner"></div><p>Loading inventory data...</p></td></tr>`;
}

function renderInvError(message) {
  invElements.tableBody.innerHTML = `<tr><td colspan="17" class="error"><p>Error: ${message}</p><button onclick="loadInventory()" class="refresh-btn" style="margin-top: 12px;">Retry</button></td></tr>`;
}

// Main load function (called by router on first navigate)
async function loadInventory() {
  cacheInvElements();
  bindInvEvents();

  renderInvLoading();

  const startTime = Date.now();

  try {
    const data = await fetchInventory();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    invSkus = data.skus;
    renderInvSummary(data.summary);
    renderInvTable();

    // Store last-updated for this tab
    const updatedText = `Last updated: ${new Date().toLocaleTimeString()} (${elapsed}s)`;
    tabLastUpdated['#/inventory'] = updatedText;
    showTabLastUpdated();
  } catch (error) {
    renderInvError(error.message);
  } finally {}
}

// CSV Export for Inventory
function getFilteredSortedInventory() {
  let filtered = invSkus.filter(sku => {
    if (invFilters.stockLevel !== 'all' && sku.stockLevel !== invFilters.stockLevel) return false;
    if (invFilters.search) {
      const q = invFilters.search.toLowerCase();
      return sku.sku.toLowerCase().includes(q) || (sku.description || '').toLowerCase().includes(q);
    }
    return true;
  });

  filtered.sort((a, b) => {
    switch (invFilters.sort) {
      case 'stock-asc': {
        const aw = a.estimatedWeeksOfStock;
        const bw = b.estimatedWeeksOfStock;
        if (aw === null && bw === null) return 0;
        if (aw === null) return 1;
        if (bw === null) return -1;
        return aw - bw;
      }
      case 'stock-desc': {
        const aw = a.estimatedWeeksOfStock;
        const bw = b.estimatedWeeksOfStock;
        if (aw === null && bw === null) return 0;
        if (aw === null) return 1;
        if (bw === null) return -1;
        return bw - aw;
      }
      case 'onhand-desc':
        return b.available - a.available;
      case 'onhand-asc':
        return a.available - b.available;
      case 'velocity-desc':
        return (b.rates['30d'].unitsPerDay || 0) - (a.rates['30d'].unitsPerDay || 0);
      case 'sku-asc':
        return a.sku.localeCompare(b.sku);
      default:
        return 0;
    }
  });

  return filtered;
}

function exportInventoryToCSV() {
  const filtered = getFilteredSortedInventory();
  if (filtered.length === 0) return;

  const headers = [
    'SKU', 'Description', 'Available',
    '7d Sold', '7d / Day', '7d / Wk', '7d % Inv',
    '14d Sold', '14d / Day', '14d / Wk', '14d % Inv',
    '30d Sold', '30d / Day', '30d / Wk', '30d % Inv',
    'Est. Weeks', 'Stock Level'
  ];

  const rows = filtered.map(sku => {
    const r7 = sku.rates['7d'];
    const r14 = sku.rates['14d'];
    const r30 = sku.rates['30d'];
    return [
      csvEscape(sku.sku),
      csvEscape(sku.description),
      sku.available,
      r7.unitsSold, r7.unitsPerDay, r7.unitsPerWeek, r7.percentOfDailyInventory,
      r14.unitsSold, r14.unitsPerDay, r14.unitsPerWeek, r14.percentOfDailyInventory,
      r30.unitsSold, r30.unitsPerDay, r30.unitsPerWeek, r30.percentOfDailyInventory,
      sku.estimatedWeeksOfStock !== null ? sku.estimatedWeeksOfStock : '',
      csvEscape(sku.stockLevel)
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(`shopify-run-rate-${date}.csv`, csv);
}

// Event binding (called once)
let invEventsBound = false;
function bindInvEvents() {
  if (invEventsBound) return;
  invEventsBound = true;

  invElements.search.addEventListener('input', (e) => {
    invFilters.search = e.target.value;
    renderInvTable();
  });

  invElements.stockFilter.addEventListener('change', (e) => {
    invFilters.stockLevel = e.target.value;
    renderInvTable();
  });

  invElements.sortFilter.addEventListener('change', (e) => {
    invFilters.sort = e.target.value;
    renderInvTable();
  });

  document.getElementById('export-inv-btn').addEventListener('click', exportInventoryToCSV);
}
