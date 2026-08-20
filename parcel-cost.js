// Parcel Cost Tab - Frontend JavaScript
// Same as Parcel SLA, but without SLA/Shipped/Tracking, plus Shopify Service Level

const PARCEL_COST_API = '/api/parcel-cost';

let parcelCostData = [];
let parcelCostDaysFilter = 7;
let parcelCostCustomRange = null; // {startDate, endDate} when Custom Range is active, else null
let parcelCostCarrierFilter = 'all';
let parcelCostSortOption = 'created-desc';

function formatParcelCostDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeParcelCostHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function matchesParcelCostCarrierFilter(carrier, filter) {
  const c = (carrier || '').toUpperCase();
  switch (filter) {
    case 'USPS':   return c.includes('USPS');
    case 'UPS':    return !c.includes('USPS') && c.includes('UPS');
    case 'FEDEX':  return c.includes('FEDEX') || c.includes('FED EX');
    case 'AMAZON': return c.includes('AMAZON');
    default:       return true;
  }
}

function filterParcelCostOrders(orders) {
  return orders.filter(order => {
    if (parcelCostCarrierFilter !== 'all' && !matchesParcelCostCarrierFilter(order.carrier, parcelCostCarrierFilter)) return false;
    return true;
  });
}

function sortParcelCostOrders(orders) {
  const sorted = [...orders];
  switch (parcelCostSortOption) {
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

function applyParcelCostFiltersAndRender() {
  renderParcelCostOrders(sortParcelCostOrders(filterParcelCostOrders(parcelCostData)));
}

function exportParcelCostCSV() {
  const filtered = sortParcelCostOrders(filterParcelCostOrders(parcelCostData));
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
  downloadCSV(`parcel-cost-${date}.csv`, csv);
}

async function fetchParcelCost(range) {
  const query = range.startDate
    ? `startDate=${range.startDate}&endDate=${range.endDate}`
    : `days=${range.days}`;
  const response = await fetch(`${PARCEL_COST_API}?${query}`);
  if (!response.ok) throw new Error('Failed to fetch parcel cost data');
  return response.json();
}

function renderParcelCostCarrierCard(prefix, carrier, total) {
  const pct = total > 0 ? ` (${((carrier.count / total) * 100).toFixed(1)}%)` : '';
  document.getElementById(`parcel-cost-summary-${prefix}`).textContent = carrier.count + pct;
  document.getElementById(`parcel-cost-summary-${prefix}-avg-weight`).textContent =
    carrier.avgWeight !== null ? `${carrier.avgWeight} lb` : '-';
  document.getElementById(`parcel-cost-summary-${prefix}-avg-freight`).textContent =
    carrier.avgFreight !== null ? formatCurrency(carrier.avgFreight) : '-';
  document.getElementById(`parcel-cost-summary-${prefix}-total-freight`).textContent =
    formatCurrency(carrier.totalFreight);
}

function renderParcelCostSummary(summary) {
  const total = summary.total || 0;
  document.getElementById('parcel-cost-summary-total').textContent = total;
  renderParcelCostCarrierCard('ups', summary.ups, total);
  renderParcelCostCarrierCard('usps', summary.usps, total);
  renderParcelCostCarrierCard('fedex', summary.fedex, total);
  renderParcelCostCarrierCard('amazon', summary.amazon, total);
}

function renderParcelCostRow(order) {
  return `
    <tr>
      <td><span class="order-number">${escapeParcelCostHtml(order.orderNo)}</span></td>
      <td>${escapeParcelCostHtml(order.poNo)}</td>
      <td>${formatParcelCostDate(order.createdAt)}</td>
      <td>${escapeParcelCostHtml(order.carrier)}</td>
      <td>${escapeParcelCostHtml(order.serviceLevel || '-')}</td>
      <td>${order.pcs !== null && order.pcs !== undefined ? order.pcs : '-'}</td>
      <td>${escapeParcelCostHtml(order.state || '-')}</td>
      <td>${order.weight !== null && order.weight !== undefined ? `${order.weight} lb` : '-'}</td>
      <td>${order.freightCost !== null && order.freightCost !== undefined ? formatCurrency(order.freightCost) : '-'}</td>
    </tr>
  `;
}

function renderParcelCostOrders(orders) {
  const tbody = document.getElementById('parcel-cost-list');

  const countEl = document.getElementById('parcel-cost-filter-count');
  if (countEl) countEl.textContent = `${orders.length} Order${orders.length !== 1 ? 's' : ''}`;

  if (orders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="empty-state">
          No parcel orders found for this period
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = orders.map(renderParcelCostRow).join('');
}

function renderParcelCostLoading() {
  document.getElementById('parcel-cost-list').innerHTML = `
    <tr>
      <td colspan="9" class="loading">
        <div class="loading-spinner"></div>
        <p>Loading parcel cost data...</p>
      </td>
    </tr>
  `;
}

function renderParcelCostError(message) {
  document.getElementById('parcel-cost-list').innerHTML = `
    <tr>
      <td colspan="9" class="error">
        <p>Error: ${message}</p>
        <button onclick="loadParcelCost()" class="refresh-btn" style="margin-top: 12px;">Retry</button>
      </td>
    </tr>
  `;
}

async function loadParcelCost() {
  renderParcelCostLoading();
  const startTime = Date.now();

  try {
    const range = parcelCostCustomRange || { days: parcelCostDaysFilter };
    const data = await fetchParcelCost(range);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    parcelCostData = data.orders;
    renderParcelCostSummary(data.summary);
    applyParcelCostFiltersAndRender();
    const updatedText = `Last updated: ${new Date().toLocaleTimeString()} (${elapsed}s)`;
    tabLastUpdated['#/parcel-cost'] = updatedText;
    if (currentTab === '#/parcel-cost') {
      document.getElementById('last-updated').textContent = updatedText;
    }
  } catch (error) {
    renderParcelCostError(error.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const daysSelect = document.getElementById('parcel-cost-days-filter');
  const customRangeGroup = document.getElementById('parcel-cost-custom-range');
  if (daysSelect) daysSelect.addEventListener('change', e => {
    if (e.target.value === 'custom') {
      if (customRangeGroup) customRangeGroup.style.display = 'flex';
      return;
    }
    if (customRangeGroup) customRangeGroup.style.display = 'none';
    parcelCostCustomRange = null;
    parcelCostDaysFilter = parseInt(e.target.value);
    loadParcelCost();
  });

  const applyCustomRangeBtn = document.getElementById('parcel-cost-apply-custom-range');
  if (applyCustomRangeBtn) applyCustomRangeBtn.addEventListener('click', () => {
    const startDate = document.getElementById('parcel-cost-start-date').value;
    const endDate = document.getElementById('parcel-cost-end-date').value;
    if (!startDate || !endDate) {
      alert('Please select both a start and end date.');
      return;
    }
    if (endDate < startDate) {
      alert('End date must be on or after the start date.');
      return;
    }
    parcelCostCustomRange = { startDate, endDate };
    loadParcelCost();
  });

  const carrierSelect = document.getElementById('parcel-cost-carrier-filter');
  if (carrierSelect) carrierSelect.addEventListener('change', e => {
    parcelCostCarrierFilter = e.target.value;
    applyParcelCostFiltersAndRender();
  });

  const sortSelect = document.getElementById('parcel-cost-sort-filter');
  if (sortSelect) sortSelect.addEventListener('change', e => {
    parcelCostSortOption = e.target.value;
    applyParcelCostFiltersAndRender();
  });

  const exportBtn = document.getElementById('export-parcel-cost-btn');
  if (exportBtn) exportBtn.addEventListener('click', exportParcelCostCSV);
});
