// CX Ship Cost Tab - Frontend JavaScript
// Same as Parcel SLA, but restricted to Shopify orders with source_name = shopify_draft_order

const CX_API = '/api/cx-ship-cost';

let cxShipCostData = [];
let cxDaysFilter = 7;
let cxStatusFilter = 'all';
let cxCarrierFilter = 'all';
let cxSortOption = 'shipped-desc';

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

function formatCxSlaHours(hours) {
  if (hours === null || hours === undefined) return '-';
  if (hours < 1) {
    return `${Math.round(hours * 60)}m`;
  }
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
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
    if (cxStatusFilter === 'within-sla' && order.withinSla !== true) return false;
    if (cxStatusFilter === 'past-sla' && order.withinSla !== false) return false;
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
    case 'created-desc':
      sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      break;
    case 'created-asc':
      sorted.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      break;
    case 'shipped-asc':
      sorted.sort((a, b) => new Date(a.shippedDate || 0) - new Date(b.shippedDate || 0));
      break;
    case 'sla-asc':
      sorted.sort((a, b) => (a.slaHours ?? Infinity) - (b.slaHours ?? Infinity));
      break;
    case 'sla-desc':
      sorted.sort((a, b) => (b.slaHours ?? -Infinity) - (a.slaHours ?? -Infinity));
      break;
    case 'shipped-desc':
    default:
      sorted.sort((a, b) => new Date(b.shippedDate || 0) - new Date(a.shippedDate || 0));
  }
  return sorted;
}

function applyCxFiltersAndRender() {
  renderCxOrders(sortCxOrders(filterCxOrders(cxShipCostData)));
}

function exportCxShipCostCSV() {
  const filtered = sortCxOrders(filterCxOrders(cxShipCostData));
  if (!filtered.length) return;

  const headers = ['Order #', 'PO #', 'Created', 'Shipped', 'SLA (hrs)', 'Tracking ID', 'Carrier', 'PCS', 'State', 'Weight', 'Freight Cost'];
  const rows = filtered.map(order => [
    csvEscape(order.orderNo),
    csvEscape(order.poNo),
    csvEscape(order.createdAt ? new Date(order.createdAt).toLocaleString() : ''),
    csvEscape(order.shippedDate ? new Date(order.shippedDate).toLocaleString() : ''),
    csvEscape(formatCxSlaHours(order.slaHours)),
    csvEscape(order.trackingNumber || ''),
    csvEscape(order.carrier || ''),
    csvEscape(order.pcs !== null && order.pcs !== undefined ? order.pcs : ''),
    csvEscape(order.state || ''),
    csvEscape(order.weight !== null && order.weight !== undefined ? order.weight : ''),
    csvEscape(order.freightCost !== null && order.freightCost !== undefined ? order.freightCost : '')
  ].join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(`cx-ship-cost-${date}.csv`, csv);
}

async function fetchCxShipCost(days) {
  const response = await fetch(`${CX_API}?days=${days}`);
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
  document.getElementById('cx-summary-within-sla').textContent = summary.withinSla;
  document.getElementById('cx-summary-past-sla').textContent = summary.pastSla;
  renderCxCarrierCard('ups', summary.ups, total);
  renderCxCarrierCard('usps', summary.usps, total);
  renderCxCarrierCard('fedex', summary.fedex, total);
  renderCxCarrierCard('amazon', summary.amazon, total);
}

function renderCxRow(order) {
  const slaClass = order.withinSla === true ? 'within-sla' : order.withinSla === false ? 'past-sla' : '';
  const slaDisplay = formatCxSlaHours(order.slaHours);

  return `
    <tr>
      <td><span class="order-number">${escapeCxHtml(order.orderNo)}</span></td>
      <td>${escapeCxHtml(order.poNo)}</td>
      <td>${formatCxDate(order.createdAt)}</td>
      <td>${formatCxDate(order.shippedDate)}</td>
      <td><span class="sla-time ${slaClass}">${slaDisplay}</span></td>
      <td class="tracking-cell">${escapeCxHtml(order.trackingNumber || '-')}</td>
      <td>${escapeCxHtml(order.carrier)}</td>
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
        <td colspan="11" class="empty-state">
          No CX draft-order shipments found for this period
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = orders.map(renderCxRow).join('');
}

function renderCxLoading() {
  document.getElementById('cx-ship-cost-list').innerHTML = `
    <tr>
      <td colspan="11" class="loading">
        <div class="loading-spinner"></div>
        <p>Loading CX ship cost data...</p>
      </td>
    </tr>
  `;
}

function renderCxError(message) {
  document.getElementById('cx-ship-cost-list').innerHTML = `
    <tr>
      <td colspan="11" class="error">
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
    const data = await fetchCxShipCost(cxDaysFilter);
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
  if (daysSelect) daysSelect.addEventListener('change', e => {
    cxDaysFilter = parseInt(e.target.value);
    loadCxShipCost();
  });

  const slaSelect = document.getElementById('cx-sla-filter');
  if (slaSelect) slaSelect.addEventListener('change', e => {
    cxStatusFilter = e.target.value;
    applyCxFiltersAndRender();
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
