// Duplicate Orders Tab - Frontend JavaScript
// Failsafe: flags UNIS orders from the last 7 days that share a PO # with another
// order and haven't shipped or been canceled yet — catches an upstream
// duplicate-order-creation bug (e.g. a Celigo flow glitch) while there's still
// time to cancel one before it ships.

const DUPLICATE_ORDERS_API = '/api/duplicate-orders';

let duplicateOrdersData = [];
let duplicateSortOption = 'po-asc';

function formatDuplicateDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeDuplicateHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sortDuplicateOrders(orders) {
  const sorted = [...orders];
  switch (duplicateSortOption) {
    case 'po-asc':
      sorted.sort((a, b) => {
        const aNum = parseInt((a.poNo || '').replace(/\D/g, ''), 10) || 0;
        const bNum = parseInt((b.poNo || '').replace(/\D/g, ''), 10) || 0;
        return aNum - bNum;
      });
      break;
    case 'created-asc':
      sorted.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      break;
    case 'created-desc':
    default:
      sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }
  return sorted;
}

function applyDuplicateFiltersAndRender() {
  renderDuplicateOrders(sortDuplicateOrders(duplicateOrdersData));
}

function exportDuplicateOrdersCSV() {
  const sorted = sortDuplicateOrders(duplicateOrdersData);
  if (!sorted.length) return;

  const headers = ['PO #', 'Order #', 'Group Size', 'Status', 'PreStatus', 'Order Type', 'Created', 'Ship To Name'];
  const rows = sorted.map(o => [
    csvEscape(o.poNo),
    csvEscape(o.orderNo),
    csvEscape(o.groupSize),
    csvEscape(o.status || ''),
    csvEscape(o.preStatus || ''),
    csvEscape(o.orderType || ''),
    csvEscape(o.createdAt ? new Date(o.createdAt).toLocaleString() : ''),
    csvEscape(o.shipToName || '')
  ].join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(`duplicate-orders-${date}.csv`, csv);
}

async function fetchDuplicateOrders() {
  const response = await fetch(DUPLICATE_ORDERS_API);
  if (!response.ok) throw new Error('Failed to fetch duplicate order data');
  return response.json();
}

function renderDuplicateSummary(summary) {
  document.getElementById('duplicate-summary-groups').textContent = summary.duplicateGroups;
  document.getElementById('duplicate-summary-flagged-orders').textContent = summary.flaggedOrders;
  document.getElementById('duplicate-summary-scanned').textContent = summary.openOrders;
}

function renderDuplicateWindowInfo(window, summary) {
  const el = document.getElementById('duplicate-window-info');
  if (!el) return;
  if (!window) {
    el.textContent = '';
    return;
  }
  const fmt = iso => new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  el.textContent = `Window queried: ${fmt(window.from)} – ${fmt(window.to)} • ${summary.totalOrders} order${summary.totalOrders !== 1 ? 's' : ''} pulled from UNIS, ${summary.openOrders} still open (not yet shipped)`;
}

function renderDuplicateRow(o) {
  return `
    <tr>
      <td>${escapeDuplicateHtml(o.poNo)}</td>
      <td><span class="order-number">${escapeDuplicateHtml(o.orderNo)}</span></td>
      <td>${o.groupSize}</td>
      <td>${escapeDuplicateHtml(o.status || '-')}</td>
      <td>${escapeDuplicateHtml(o.preStatus || '-')}</td>
      <td>${escapeDuplicateHtml(o.orderType || '-')}</td>
      <td>${formatDuplicateDate(o.createdAt)}</td>
      <td>${escapeDuplicateHtml(o.shipToName || '-')}</td>
    </tr>
  `;
}

function renderDuplicateOrders(orders) {
  const tbody = document.getElementById('duplicate-orders-list');

  const countEl = document.getElementById('duplicate-filter-count');
  if (countEl) countEl.textContent = `${orders.length} Order${orders.length !== 1 ? 's' : ''}`;

  if (orders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-state">
          No duplicate PO #s found among open orders in the last 7 days
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = orders.map(renderDuplicateRow).join('');
}

function renderDuplicateLoading() {
  document.getElementById('duplicate-orders-list').innerHTML = `
    <tr>
      <td colspan="8" class="loading">
        <div class="loading-spinner"></div>
        <p>Loading duplicate order data...</p>
      </td>
    </tr>
  `;
}

function renderDuplicateError(message) {
  document.getElementById('duplicate-orders-list').innerHTML = `
    <tr>
      <td colspan="8" class="error">
        <p>Error: ${message}</p>
        <button onclick="loadDuplicateOrders()" class="refresh-btn" style="margin-top: 12px;">Retry</button>
      </td>
    </tr>
  `;
}

async function loadDuplicateOrders() {
  renderDuplicateLoading();
  const startTime = Date.now();

  try {
    const data = await fetchDuplicateOrders();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    duplicateOrdersData = data.orders;
    renderDuplicateSummary(data.summary);
    renderDuplicateWindowInfo(data.window, data.summary);
    applyDuplicateFiltersAndRender();
    const updatedText = `Last updated: ${new Date().toLocaleTimeString()} (${elapsed}s)`;
    tabLastUpdated['#/duplicate-orders'] = updatedText;
    if (currentTab === '#/duplicate-orders') {
      document.getElementById('last-updated').textContent = updatedText;
    }
  } catch (error) {
    renderDuplicateError(error.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const sortSelect = document.getElementById('duplicate-sort-filter');
  if (sortSelect) sortSelect.addEventListener('change', e => {
    duplicateSortOption = e.target.value;
    applyDuplicateFiltersAndRender();
  });

  const exportBtn = document.getElementById('export-duplicate-btn');
  if (exportBtn) exportBtn.addEventListener('click', exportDuplicateOrdersCSV);
});
