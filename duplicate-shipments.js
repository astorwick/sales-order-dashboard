// Duplicate Shipments Tab - Frontend JavaScript
// Flags Shopify orders with more than one UNIS shipment record (usually an upstream
// integration glitch, not a legitimate multi-package split).

const DUPLICATE_SHIPMENTS_API = '/api/duplicate-shipments';

let duplicateShipmentsData = [];
let duplicateSortOption = 'shipped-desc';

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

function sortDuplicateShipments(shipments) {
  const sorted = [...shipments];
  switch (duplicateSortOption) {
    case 'po-asc':
      sorted.sort((a, b) => {
        const aNum = parseInt((a.poNo || '').replace(/\D/g, ''), 10) || 0;
        const bNum = parseInt((b.poNo || '').replace(/\D/g, ''), 10) || 0;
        return aNum - bNum;
      });
      break;
    case 'shipped-asc':
      sorted.sort((a, b) => new Date(a.shippedDate || 0) - new Date(b.shippedDate || 0));
      break;
    case 'shipped-desc':
    default:
      sorted.sort((a, b) => new Date(b.shippedDate || 0) - new Date(a.shippedDate || 0));
  }
  return sorted;
}

function applyDuplicateFiltersAndRender() {
  renderDuplicateShipments(sortDuplicateShipments(duplicateShipmentsData));
}

function exportDuplicateShipmentsCSV() {
  const sorted = sortDuplicateShipments(duplicateShipmentsData);
  if (!sorted.length) return;

  const headers = ['PO #', 'Order #', 'Group Size', 'Created', 'Shipped', 'Carrier', 'Tracking ID', 'Weight', 'Freight Cost'];
  const rows = sorted.map(s => [
    csvEscape(s.poNo),
    csvEscape(s.orderNo),
    csvEscape(s.groupSize),
    csvEscape(s.createdAt ? new Date(s.createdAt).toLocaleString() : ''),
    csvEscape(s.shippedDate ? new Date(s.shippedDate).toLocaleString() : ''),
    csvEscape(s.carrier || ''),
    csvEscape(s.trackingNumber || ''),
    csvEscape(s.weight !== null && s.weight !== undefined ? s.weight : ''),
    csvEscape(s.freightCost !== null && s.freightCost !== undefined ? s.freightCost : '')
  ].join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(`duplicate-shipments-${date}.csv`, csv);
}

async function fetchDuplicateShipments() {
  const response = await fetch(DUPLICATE_SHIPMENTS_API);
  if (!response.ok) throw new Error('Failed to fetch duplicate shipment data');
  return response.json();
}

function renderDuplicateSummary(summary) {
  document.getElementById('duplicate-summary-groups').textContent = summary.duplicateGroups;
  document.getElementById('duplicate-summary-extra-shipments').textContent = summary.extraShipments;
  document.getElementById('duplicate-summary-extra-freight').textContent = formatCurrency(summary.totalExtraFreightCost);
}

function renderDuplicateRow(s) {
  return `
    <tr>
      <td>${escapeDuplicateHtml(s.poNo)}</td>
      <td><span class="order-number">${escapeDuplicateHtml(s.orderNo)}</span></td>
      <td>${s.groupSize}</td>
      <td>${formatDuplicateDate(s.createdAt)}</td>
      <td>${formatDuplicateDate(s.shippedDate)}</td>
      <td>${escapeDuplicateHtml(s.carrier)}</td>
      <td class="tracking-cell">${escapeDuplicateHtml(s.trackingNumber || '-')}</td>
      <td>${s.weight !== null && s.weight !== undefined ? `${s.weight} lb` : '-'}</td>
      <td>${s.freightCost !== null && s.freightCost !== undefined ? formatCurrency(s.freightCost) : '-'}</td>
    </tr>
  `;
}

function renderDuplicateShipments(shipments) {
  const tbody = document.getElementById('duplicate-shipments-list');

  const countEl = document.getElementById('duplicate-filter-count');
  if (countEl) countEl.textContent = `${shipments.length} Shipment${shipments.length !== 1 ? 's' : ''}`;

  if (shipments.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="empty-state">
          No duplicate shipments found
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = shipments.map(renderDuplicateRow).join('');
}

function renderDuplicateLoading() {
  document.getElementById('duplicate-shipments-list').innerHTML = `
    <tr>
      <td colspan="9" class="loading">
        <div class="loading-spinner"></div>
        <p>Loading duplicate shipment data...</p>
      </td>
    </tr>
  `;
}

function renderDuplicateError(message) {
  document.getElementById('duplicate-shipments-list').innerHTML = `
    <tr>
      <td colspan="9" class="error">
        <p>Error: ${message}</p>
        <button onclick="loadDuplicateShipments()" class="refresh-btn" style="margin-top: 12px;">Retry</button>
      </td>
    </tr>
  `;
}

async function loadDuplicateShipments() {
  renderDuplicateLoading();
  const startTime = Date.now();

  try {
    const data = await fetchDuplicateShipments();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    duplicateShipmentsData = data.shipments;
    renderDuplicateSummary(data.summary);
    applyDuplicateFiltersAndRender();
    const updatedText = `Last updated: ${new Date().toLocaleTimeString()} (${elapsed}s)`;
    tabLastUpdated['#/duplicate-shipments'] = updatedText;
    if (currentTab === '#/duplicate-shipments') {
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
  if (exportBtn) exportBtn.addEventListener('click', exportDuplicateShipmentsCSV);
});
