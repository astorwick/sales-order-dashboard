// CX Ship Cost Tab - Frontend JavaScript
// Mirrors Parcel Cost, but restricted server-side to Shopify orders with source_name:shopify_draft_order

const CX_API = '/api/cx-ship-cost';

let cxShipCostData = [];
let cxDaysFilter = 7;
let cxCustomRange = null; // {startDate, endDate} when Custom Range is active, else null
let cxCarrierFilter = 'all';
let cxSortOption = 'created-desc';
let cxPage = 1;

function formatCxDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeCxHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function matchesCxCarrierFilter(carrier, filter) {
  const c = (carrier || '').toUpperCase();
  switch (filter) {
    case 'USPS':   return c.includes('USPS');
    case 'UPS':    return !c.includes('USPS') && c.includes('UPS');
    case 'FEDEX':  return c.includes('FEDEX') || c.includes('FED EX');
    case 'AMAZON': return c.includes('AMAZON');
    default:       return true;
  }
}

function filterCxOrders(orders) {
  return orders.filter(order => {
    if (cxCarrierFilter !== 'all' && !matchesCxCarrierFilter(order.carrier, cxCarrierFilter)) return false;
    return true;
  });
}

function sortCxOrders(orders) {
  const sorted = [...orders];
  switch (cxSortOption) {
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

function applyCxFiltersAndRender(resetPage = true) {
  if (resetPage) cxPage = 1;
  renderCxOrders(sortCxOrders(filterCxOrders(cxShipCostData)));
}

function exportCxShipCostCSV() {
  const filtered = sortCxOrders(filterCxOrders(cxShipCostData));
  if (!filtered.length) return;

  const headers = ['Order #', 'PO #', 'Created', 'Carrier', 'Service Level', 'PCS', 'State', 'Weight', 'Freight Cost'];
  const rows = filtered.map(order => [
    csvEscape(order.orderNo),
    csvEscape(order.poNo),
    csvEscape(order.createdAt ? new Date(order.createdAt).toLocaleString() : ''),
    csvEscape(order.carrier || ''),
    csvEscape(order.serviceLevel || ''),
    csvEscape(order.pcs !== null && order.pcs !== undefined ? order.pcs : ''),
    csvEscape(order.state || ''),
    csvEscape(order.weight !== null && order.weight !== undefined ? order.weight : ''),
    csvEscape(order.freightCost !== null && order.freightCost !== undefined ? order.freightCost : '')
  ].join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(`cx-ship-cost-${date}.csv`, csv);
}

async function fetchCxShipCost(range) {
  const query = range.startDate
    ? `startDate=${range.startDate}&endDate=${range.endDate}`
    : `days=${range.days}`;
  const response = await fetch(`${CX_API}?${query}`);
  if (!response.ok) throw new Error('Failed to fetch CX ship cost data');
  return response.json();
}

function renderCxCarrierCard(prefix, carrier, total) {
  const pct = total > 0 ? ` (${((carrier.count / total) * 100).toFixed(1)}%)` : '';
  document.getElementById(`cx-summary-${prefix}`).textContent = carrier.count + pct;
  document.getElementById(`cx-summary-${prefix}-avg-weight`).textContent =
    carrier.avgWeight !== null ? `${carrier.avgWeight} lb` : '-';
  document.getElementById(`cx-summary-${prefix}-avg-freight`).textContent =
    carrier.avgFreight !== null ? formatCurrency(carrier.avgFreight) : '-';
  document.getElementById(`cx-summary-${prefix}-total-freight`).textContent =
    formatCurrency(carrier.totalFreight);
}

function renderCxSummary(summary) {
  const total = summary.total || 0;
  document.getElementById('cx-summary-total').textContent = total;
  document.getElementById('cx-summary-total-avg-weight').textContent =
    summary.avgWeight !== null && summary.avgWeight !== undefined ? `${summary.avgWeight} lb` : '-';
  document.getElementById('cx-summary-total-avg-freight').textContent =
    summary.avgFreight !== null && summary.avgFreight !== undefined ? formatCurrency(summary.avgFreight) : '-';
  document.getElementById('cx-summary-total-total-freight').textContent =
    formatCurrency(summary.totalFreight || 0);
  renderCxCarrierCard('ups', summary.ups, total);
  renderCxCarrierCard('usps', summary.usps, total);
  renderCxCarrierCard('fedex', summary.fedex, total);
  renderCxCarrierCard('amazon', summary.amazon, total);
}

function renderCxRow(order) {
  return `
    <tr>
      <td><span class="order-number">${escapeCxHtml(order.orderNo)}</span></td>
      <td>${escapeCxHtml(order.poNo)}</td>
      <td>${formatCxDate(order.createdAt)}</td>
      <td>${escapeCxHtml(order.carrier)}</td>
      <td>${escapeCxHtml(order.serviceLevel || '-')}</td>
      <td>${order.pcs !== null && order.pcs !== undefined ? order.pcs : '-'}</td>
      <td>${escapeCxHtml(order.state || '-')}</td>
      <td>${order.weight !== null && order.weight !== undefined ? `${order.weight} lb` : '-'}</td>
      <td>${order.freightCost !== null && order.freightCost !== undefined ? formatCurrency(order.freightCost) : '-'}</td>
    </tr>
  `;
}

function renderCxOrders(orders) {
  const tbody = document.getElementById('cx-ship-cost-list');

  const countEl = document.getElementById('cx-filter-count');
  if (countEl) countEl.textContent = `${orders.length} Order${orders.length !== 1 ? 's' : ''}`;

  if (orders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="empty-state">
          No CX draft-order shipments found for this period
        </td>
      </tr>
    `;
    renderPaginationControls('cx-pagination', 1, 1, () => {});
    return;
  }

  const { pageItems, currentPage, totalPages } = paginate(orders, cxPage);
  cxPage = currentPage;
  tbody.innerHTML = pageItems.map(renderCxRow).join('');
  renderPaginationControls('cx-pagination', currentPage, totalPages, page => {
    cxPage = page;
    applyCxFiltersAndRender(false);
  });
}

function renderCxLoading() {
  document.getElementById('cx-ship-cost-list').innerHTML = `
    <tr>
      <td colspan="9" class="loading">
        <div class="loading-spinner"></div>
        <p>Loading CX ship cost data...</p>
      </td>
    </tr>
  `;
}

function renderCxError(message) {
  document.getElementById('cx-ship-cost-list').innerHTML = `
    <tr>
      <td colspan="9" class="error">
        <p>Error: ${message}</p>
        <button onclick="loadCxShipCost()" class="refresh-btn" style="margin-top: 12px;">Retry</button>
      </td>
    </tr>
  `;
}

async function loadCxShipCost() {
  renderCxLoading();
  const startTime = Date.now();

  try {
    const range = cxCustomRange || { days: cxDaysFilter };
    const data = await fetchCxShipCost(range);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    cxShipCostData = data.orders;
    renderCxSummary(data.summary);
    applyCxFiltersAndRender();
    const updatedText = `Last updated: ${new Date().toLocaleTimeString()} (${elapsed}s)`;
    tabLastUpdated['#/cx-ship-cost'] = updatedText;
    if (currentTab === '#/cx-ship-cost') {
      document.getElementById('last-updated').textContent = updatedText;
    }
  } catch (error) {
    renderCxError(error.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const daysSelect = document.getElementById('cx-days-filter');
  const customRangeGroup = document.getElementById('cx-custom-range');
  if (daysSelect) daysSelect.addEventListener('change', e => {
    if (e.target.value === 'custom') {
      if (customRangeGroup) customRangeGroup.style.display = 'flex';
      return;
    }
    if (customRangeGroup) customRangeGroup.style.display = 'none';
    cxCustomRange = null;
    cxDaysFilter = parseInt(e.target.value);
    loadCxShipCost();
  });

  const applyCustomRangeBtn = document.getElementById('cx-apply-custom-range');
  if (applyCustomRangeBtn) applyCustomRangeBtn.addEventListener('click', () => {
    const startDate = document.getElementById('cx-start-date').value;
    const endDate = document.getElementById('cx-end-date').value;
    if (!startDate || !endDate) {
      alert('Please select both a start and end date.');
      return;
    }
    if (endDate < startDate) {
      alert('End date must be on or after the start date.');
      return;
    }
    cxCustomRange = { startDate, endDate };
    loadCxShipCost();
  });

  const carrierSelect = document.getElementById('cx-carrier-filter');
  if (carrierSelect) carrierSelect.addEventListener('change', e => {
    cxCarrierFilter = e.target.value;
    applyCxFiltersAndRender();
  });

  const sortSelect = document.getElementById('cx-sort-filter');
  if (sortSelect) sortSelect.addEventListener('change', e => {
    cxSortOption = e.target.value;
    applyCxFiltersAndRender();
  });

  const exportBtn = document.getElementById('export-cx-btn');
  if (exportBtn) exportBtn.addEventListener('click', exportCxShipCostCSV);
});
