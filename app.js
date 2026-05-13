// Sales Order Dashboard - Frontend JavaScript

const API_BASE = '/api';

// State
let orders = [];
let config = null;
let filters = {
  stage: new Set(),  // empty = all stages
  status: new Set(), // empty = all statuses
  search: '',
  days: 7,
  sort: 'created-desc'
};
let inventoryLoaded = false;
let parcelSlaLoaded = false;
let uspsTrackerLoaded = false;
let currentTab = '#/orders';
let tabLastUpdated = {};

// DOM Elements
const elements = {
  ordersList: document.getElementById('orders-list'),
  searchInput: document.getElementById('search-input'),
  daysFilter: document.getElementById('days-filter'),
  sortFilter: document.getElementById('sort-filter'),
  refreshBtn: document.getElementById('refresh-btn'),
  lastUpdated: document.getElementById('last-updated'),
  summaryTotal: document.getElementById('summary-total'),
  summaryStuck: document.getElementById('summary-stuck'),
  summaryMissingTracking: document.getElementById('summary-missing-tracking'),
  summaryUnshippable: document.getElementById('summary-unshippable'),
  summaryWarning: document.getElementById('summary-warning'),
  summaryOk: document.getElementById('summary-ok'),
  summaryComplete: document.getElementById('summary-complete')
};

// CSV Export Utility (shared across tabs)
function downloadCSV(filename, csvContent) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Utility Functions
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTime(minutes) {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(amount);
}

function getStageName(stageId) {
  const names = {
    'shopify': 'Shopify',
    'sap': 'SAP ERP',
    '3pl_request': '3PL Request',
    'warehouse_received': 'Warehouse',
    'shipped': 'Shipped',
    'tracking': 'Tracking'
  };
  return names[stageId] || stageId;
}

// API Functions
async function fetchConfig() {
  try {
    const response = await fetch(`${API_BASE}/config`);
    if (!response.ok) throw new Error('Failed to fetch config');
    config = await response.json();
    return config;
  } catch (error) {
    console.error('Error fetching config:', error);
    throw error;
  }
}

async function fetchOrders() {
  try {
    const response = await fetch(`${API_BASE}/orders?days=${filters.days}`);
    if (!response.ok) throw new Error('Failed to fetch orders');
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching orders:', error);
    throw error;
  }
}

// Render Functions
function renderSummary(summary) {
  elements.summaryTotal.textContent = summary.total;
  elements.summaryStuck.textContent = summary.stuck;
  elements.summaryMissingTracking.textContent = summary.missing_tracking || 0;
  elements.summaryUnshippable.textContent = summary.unshippable || 0;
  elements.summaryWarning.textContent = summary.warning;
  elements.summaryOk.textContent = summary.ok;
  elements.summaryComplete.textContent = summary.complete;
}

function renderStageIndicator(stageIndex) {
  const stages = ['shopify', 'sap', '3pl_request', 'warehouse_received', 'shipped', 'tracking'];
  return stages.map((stage, i) => {
    let className = 'stage-dot';
    if (i < stageIndex) className += ' complete';
    else if (i === stageIndex) className += ' active';
    return `<span class="${className}" title="${getStageName(stage)}"></span>`;
  }).join('');
}

function renderStageProgress(stageIndex) {
  const bars = [];
  for (let i = 0; i < 6; i++) {
    let className = 'bar';
    if (i < stageIndex) className += ' filled';
    else if (i === stageIndex) className += ' current';
    bars.push(`<div class="${className}"></div>`);
  }
  return `<div class="stage-progress">${bars.join('')}</div>`;
}

function getStatusIcon(status) {
  switch (status) {
    case 'stuck': return '⚠️';
    case 'warning': return '⏳';
    case 'complete': return '✓';
    case 'unshippable': return '🚫';
    case 'missing_tracking': return '📦';
    default: return '●';
  }
}

function renderOrderRow(order) {
  const timeClass = order.status === 'stuck' ? 'stuck' : order.status === 'warning' ? 'warning' : order.status === 'unshippable' ? 'unshippable' : order.status === 'missing_tracking' ? 'missing_tracking' : '';
  const vendorDisplay = order.vendors && order.vendors.length > 0
    ? order.vendors.map(escapeHtml).join(', ')
    : '-';

  // Only show possible causes for stuck orders
  const possibleCauseDisplay = order.status === 'stuck' && order.possibleCauses && order.possibleCauses.length > 0
    ? order.possibleCauses.map(escapeHtml).join(', ')
    : '';

  return `
    <tr>
      <td>
        <span class="order-number">${escapeHtml(order.orderName)}</span>
      </td>
      <td>${escapeHtml(order.customerName)}</td>
      <td><span class="vendor-list ${order.shippable === false ? 'not-shippable' : ''}">${vendorDisplay}</span></td>
      <td>${formatDate(order.createdAt)}</td>
      <td>${order.unisShippedDate ? formatDate(order.unisShippedDate) : '-'}</td>
      <td>${order.trackingNumber ? escapeHtml(order.trackingNumber) : '-'}</td>
      <td>
        <div class="stage-indicator">
          ${renderStageIndicator(order.stageIndex)}
          <span class="stage-name">${getStageName(order.currentStage)}</span>
        </div>
        ${renderStageProgress(order.stageIndex)}
      </td>
      <td>
        <span class="time-in-stage ${timeClass}">
          ${formatTime(order.timeInStageMinutes)}
        </span>
        ${order.threshold ? `<span class="tooltip" data-tooltip="Threshold: ${formatTime(order.threshold)}"> / ${formatTime(order.threshold)}</span>` : ''}
      </td>
      <td>
        <span class="status-badge ${order.status}">
          ${getStatusIcon(order.status)}
          ${order.status}
        </span>
      </td>
      <td><span class="possible-cause">${possibleCauseDisplay}</span></td>
      <td>${formatCurrency(order.totalPrice, order.currency)}</td>
    </tr>
  `;
}

function renderOrders(ordersData) {
  // Apply filters
  let filtered = ordersData.filter(order => {
    if (filters.stage.size > 0 && !filters.stage.has(order.currentStage)) return false;
    if (filters.status.size > 0 && !filters.status.has(order.status)) return false;
    if (filters.search) {
      const search = filters.search.toLowerCase();
      return (
        order.orderName.toLowerCase().includes(search) ||
        order.customerName.toLowerCase().includes(search) ||
        (order.email && order.email.toLowerCase().includes(search))
      );
    }
    return true;
  });

  // Apply sorting
  const statusPriority = { unshippable: 0, missing_tracking: 1, stuck: 2, warning: 3, ok: 4, complete: 5 };
  filtered.sort((a, b) => {
    switch (filters.sort) {
      case 'status':
        const priorityDiff = statusPriority[a.status] - statusPriority[b.status];
        if (priorityDiff !== 0) return priorityDiff;
        return b.timeInStageMinutes - a.timeInStageMinutes;
      case 'created-desc':
        return new Date(b.createdAt) - new Date(a.createdAt);
      case 'created-asc':
        return new Date(a.createdAt) - new Date(b.createdAt);
      case 'order-desc':
        return b.orderNumber - a.orderNumber;
      case 'order-asc':
        return a.orderNumber - b.orderNumber;
      default:
        return 0;
    }
  });

  if (filtered.length === 0) {
    elements.ordersList.innerHTML = `
      <tr>
        <td colspan="10" class="empty-state">
          No orders match the current filters
        </td>
      </tr>
    `;
    return;
  }

  elements.ordersList.innerHTML = filtered.map(renderOrderRow).join('');
}

function renderLoading() {
  elements.ordersList.innerHTML = `
    <tr>
      <td colspan="10" class="loading">
        <div class="loading-spinner"></div>
        <p>Loading orders...</p>
      </td>
    </tr>
  `;
}

function renderError(message) {
  elements.ordersList.innerHTML = `
    <tr>
      <td colspan="10" class="error">
        <p>Error: ${message}</p>
        <button onclick="loadOrders()" class="refresh-btn" style="margin-top: 12px;">Retry</button>
      </td>
    </tr>
  `;
}

// Event Handlers
function setupMultiSelect(containerId, filterKey) {
  const container = document.getElementById(containerId);
  const btn = container.querySelector('.multi-select-btn');
  const allLabel = btn.textContent;
  const selectAllCb = container.querySelector('.select-all-cb');
  const optionCbs = [...container.querySelectorAll('input[type="checkbox"]:not(.select-all-cb)')];

  btn.addEventListener('click', e => {
    e.stopPropagation();
    document.querySelectorAll('.multi-select.open').forEach(ms => {
      if (ms !== container) ms.classList.remove('open');
    });
    container.classList.toggle('open');
  });

  function updateFiltersAndLabel() {
    const checked = optionCbs.filter(cb => cb.checked);
    const allChecked = checked.length === optionCbs.length;
    filters[filterKey] = (checked.length === 0 || allChecked) ? new Set() : new Set(checked.map(c => c.value));
    if (checked.length === 0 || allChecked) {
      btn.textContent = allLabel;
    } else if (checked.length === 1) {
      btn.textContent = checked[0].closest('.multi-select-option').textContent.trim();
    } else {
      btn.textContent = `${checked.length} selected`;
    }
    renderOrders(orders);
  }

  function updateSelectAll() {
    const checkedCount = optionCbs.filter(cb => cb.checked).length;
    selectAllCb.checked = checkedCount === optionCbs.length;
    selectAllCb.indeterminate = checkedCount > 0 && checkedCount < optionCbs.length;
  }

  selectAllCb.addEventListener('change', () => {
    optionCbs.forEach(cb => cb.checked = selectAllCb.checked);
    selectAllCb.indeterminate = false;
    updateFiltersAndLabel();
  });

  optionCbs.forEach(cb => {
    cb.addEventListener('change', () => {
      updateSelectAll();
      updateFiltersAndLabel();
    });
  });
}

function handleSearchInput(e) {
  filters.search = e.target.value;
  renderOrders(orders);
}

function handleDaysFilterChange(e) {
  filters.days = parseInt(e.target.value);
  loadOrders(); // Reload from API with new date range
}

function handleSortFilterChange(e) {
  filters.sort = e.target.value;
  renderOrders(orders);
}

async function loadOrders() {
  elements.refreshBtn.disabled = true;
  renderLoading();

  const startTime = Date.now();

  try {
    const data = await fetchOrders();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    orders = data.orders;
    renderSummary(data.summary);
    renderOrders(orders);
    const updatedText = `Last updated: ${new Date().toLocaleTimeString()} (${elapsed}s)`;
    tabLastUpdated['#/orders'] = updatedText;
    if (currentTab === '#/orders') {
      elements.lastUpdated.textContent = updatedText;
    }
  } catch (error) {
    renderError(error.message);
  } finally {
    elements.refreshBtn.disabled = false;
  }
}

function showTabLastUpdated() {
  elements.lastUpdated.textContent = tabLastUpdated[currentTab] || 'Not yet loaded';
}

function refreshCurrentTab() {
  if (currentTab === '#/orders') {
    loadOrders();
  } else if (currentTab === '#/usps-tracker' && typeof loadUSPSTracker === 'function') {
    loadUSPSTracker();
  } else if (currentTab === '#/inventory' && typeof loadInventory === 'function') {
    loadInventory();
  } else if (currentTab === '#/parcel-sla' && typeof loadParcelSla === 'function') {
    loadParcelSla();
  }
}

// Routing
function handleRouteChange() {
  const hash = window.location.hash || '#/orders';
  currentTab = hash;
  const tabLinks = document.querySelectorAll('.tab-link');
  const viewOrders = document.getElementById('view-orders');
  const viewOrdersCa = document.getElementById('view-orders-ca');
  const viewUspsTracker = document.getElementById('view-usps-tracker');
  const viewInventory = document.getElementById('view-inventory');
  const viewParcelSla = document.getElementById('view-parcel-sla');
  const viewTrivia = document.getElementById('view-trivia');
  const viewSwTrivia = document.getElementById('view-sw-trivia');

  // Update active tab
  tabLinks.forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === hash);
  });

  // Hide all views
  viewOrders.style.display = 'none';
  viewOrdersCa.style.display = 'none';
  viewUspsTracker.style.display = 'none';
  viewInventory.style.display = 'none';
  viewParcelSla.style.display = 'none';
  viewTrivia.style.display = 'none';
  viewSwTrivia.style.display = 'none';

  if (hash === '#/orders' || hash === '') {
    currentTab = '#/orders';
    viewOrders.style.display = 'block';
  } else if (hash === '#/orders-ca') {
    viewOrdersCa.style.display = 'block';
  } else if (hash === '#/usps-tracker') {
    viewUspsTracker.style.display = 'block';
    if (!uspsTrackerLoaded) {
      uspsTrackerLoaded = true;
      if (typeof initUSPSTracker === 'function') initUSPSTracker();
      if (typeof loadUSPSTracker === 'function') loadUSPSTracker();
    }
  } else if (hash === '#/inventory') {
    viewInventory.style.display = 'block';
    if (!inventoryLoaded && typeof loadInventory === 'function') {
      inventoryLoaded = true;
      loadInventory();
    }
  } else if (hash === '#/parcel-sla') {
    viewParcelSla.style.display = 'block';
    if (!parcelSlaLoaded && typeof loadParcelSla === 'function') {
      parcelSlaLoaded = true;
      loadParcelSla();
    }
  } else if (hash === '#/trivia') {
    viewTrivia.style.display = 'block';
    if (typeof initTrivia === 'function') {
      initTrivia();
    }
  } else if (hash === '#/sw-trivia') {
    viewSwTrivia.style.display = 'block';
    if (typeof initSwTrivia === 'function') {
      initSwTrivia();
    }
  }
  // Other tabs show blank (coming soon)

  showTabLastUpdated();
}

// CSV Export for Unshipped Orders
function getFilteredSortedOrders() {
  let filtered = orders.filter(order => {
    if (filters.stage.size > 0 && !filters.stage.has(order.currentStage)) return false;
    if (filters.status.size > 0 && !filters.status.has(order.status)) return false;
    if (filters.search) {
      const search = filters.search.toLowerCase();
      return (
        order.orderName.toLowerCase().includes(search) ||
        order.customerName.toLowerCase().includes(search) ||
        (order.email && order.email.toLowerCase().includes(search))
      );
    }
    return true;
  });

  const statusPriority = { unshippable: 0, missing_tracking: 1, stuck: 2, warning: 3, ok: 4, complete: 5 };
  filtered.sort((a, b) => {
    switch (filters.sort) {
      case 'status':
        const priorityDiff = statusPriority[a.status] - statusPriority[b.status];
        if (priorityDiff !== 0) return priorityDiff;
        return b.timeInStageMinutes - a.timeInStageMinutes;
      case 'created-desc':
        return new Date(b.createdAt) - new Date(a.createdAt);
      case 'created-asc':
        return new Date(a.createdAt) - new Date(b.createdAt);
      case 'order-desc':
        return b.orderNumber - a.orderNumber;
      case 'order-asc':
        return a.orderNumber - b.orderNumber;
      default:
        return 0;
    }
  });

  return filtered;
}

function exportOrdersToCSV() {
  const filtered = getFilteredSortedOrders();
  if (filtered.length === 0) return;

  const headers = ['Order #', 'Customer', 'Vendors', 'Created', 'UNIS Shipped', 'Tracking #', 'Current Stage', 'Time in Stage', 'Status', 'Possible Cause', 'Total'];
  const rows = filtered.map(order => [
    csvEscape(order.orderName),
    csvEscape(order.customerName),
    csvEscape(order.vendors ? order.vendors.join(', ') : ''),
    csvEscape(order.createdAt ? new Date(order.createdAt).toLocaleString() : ''),
    csvEscape(order.unisShippedDate ? new Date(order.unisShippedDate).toLocaleString() : ''),
    csvEscape(order.trackingNumber || ''),
    csvEscape(getStageName(order.currentStage)),
    csvEscape(formatTime(order.timeInStageMinutes)),
    csvEscape(order.status),
    csvEscape(order.possibleCauses ? order.possibleCauses.join(', ') : ''),
    csvEscape(order.totalPrice)
  ].join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(`unshipped-orders-${date}.csv`, csv);
}

// Initialize
async function init() {
  // Bind event listeners
  setupMultiSelect('stage-filter', 'stage');
  setupMultiSelect('status-filter', 'status');
  document.addEventListener('click', e => {
    document.querySelectorAll('.multi-select.open').forEach(ms => {
      if (!ms.contains(e.target)) ms.classList.remove('open');
    });
  });
  elements.searchInput.addEventListener('input', handleSearchInput);
  elements.daysFilter.addEventListener('change', handleDaysFilterChange);
  elements.sortFilter.addEventListener('change', handleSortFilterChange);
  elements.refreshBtn.addEventListener('click', refreshCurrentTab);
  document.getElementById('export-orders-btn').addEventListener('click', exportOrdersToCSV);

  // Set up routing
  window.addEventListener('hashchange', handleRouteChange);
  handleRouteChange();

  // Load config (non-blocking) and orders
  fetchConfig().catch(err => console.error('Config error:', err));
  await loadOrders();
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', init);
