// Parcel SLA Tab - Frontend JavaScript

const PARCEL_API = '/api/parcel-sla';

let parcelSlaData = [];
let parcelDaysFilter = 7;
let parcelStatusFilter = 'all';
let parcelCarrierFilter = 'all';
let parcelSortOption = 'shipped-desc';
let parcelCreatedFrom = '';
let parcelCreatedTo = '';
let parcelShippedFrom = '';
let parcelShippedTo = '';

function formatParcelDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeParcelHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatSlaHours(hours) {
  if (hours === null || hours === undefined) return '-';
  if (hours < 1) {
    return `${Math.round(hours * 60)}m`;
  }
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function matchesCarrierFilter(carrier, filter) {
  const c = (carrier || '').toUpperCase();
  switch (filter) {
    case 'USPS':   return c.includes('USPS');
    case 'UPS':    return !c.includes('USPS') && c.includes('UPS');
    case 'FEDEX':  return c.includes('FEDEX') || c.includes('FED EX');
    case 'AMAZON': return c.includes('AMAZON');
    default:       return true;
  }
}

function filterParcelOrders(orders) {
  return orders.filter(order => {
    if (parcelStatusFilter === 'within-sla' && order.withinSla !== true) return false;
    if (parcelStatusFilter === 'past-sla' && order.withinSla !== false) return false;
    if (parcelCarrierFilter !== 'all' && !matchesCarrierFilter(order.carrier, parcelCarrierFilter)) return false;

    if (parcelCreatedFrom || parcelCreatedTo) {
      const created = order.createdAt ? order.createdAt.slice(0, 10) : null;
      if (!created) return false;
      if (parcelCreatedFrom && created < parcelCreatedFrom) return false;
      if (parcelCreatedTo && created > parcelCreatedTo) return false;
    }

    if (parcelShippedFrom || parcelShippedTo) {
      const shipped = order.shippedDate ? order.shippedDate.slice(0, 10) : null;
      if (!shipped) return false;
      if (parcelShippedFrom && shipped < parcelShippedFrom) return false;
      if (parcelShippedTo && shipped > parcelShippedTo) return false;
    }

    return true;
  });
}

function sortParcelOrders(orders) {
  const sorted = [...orders];
  switch (parcelSortOption) {
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

function applyParcelFiltersAndRender() {
  renderParcelOrders(sortParcelOrders(filterParcelOrders(parcelSlaData)));
}

function exportParcelSlaCSV() {
  const filtered = sortParcelOrders(filterParcelOrders(parcelSlaData));
  if (!filtered.length) return;

  const headers = ['Order #', 'PO #', 'Created', 'Shipped', 'SLA (hrs)', 'Tracking ID', 'Carrier', 'State', 'Weight', 'Freight Cost'];
  const rows = filtered.map(order => [
    csvEscape(order.orderNo),
    csvEscape(order.poNo),
    csvEscape(order.createdAt ? new Date(order.createdAt).toLocaleString() : ''),
    csvEscape(order.shippedDate ? new Date(order.shippedDate).toLocaleString() : ''),
    csvEscape(formatSlaHours(order.slaHours)),
    csvEscape(order.trackingNumber || ''),
    csvEscape(order.carrier || ''),
    csvEscape(order.state || ''),
    csvEscape(order.weight !== null && order.weight !== undefined ? order.weight : ''),
    csvEscape(order.freightCost !== null && order.freightCost !== undefined ? order.freightCost : '')
  ].join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(`parcel-sla-${date}.csv`, csv);
}

async function fetchParcelSla(days) {
  const response = await fetch(`${PARCEL_API}?days=${days}`);
  if (!response.ok) throw new Error('Failed to fetch parcel SLA data');
  return response.json();
}

function renderParcelSummary(summary) {
  const total = summary.total || 0;
  const pct = (n) => total > 0 ? ` (${((n / total) * 100).toFixed(1)}%)` : '';
  document.getElementById('parcel-summary-total').textContent = total;
  document.getElementById('parcel-summary-within-sla').textContent = summary.withinSla;
  document.getElementById('parcel-summary-past-sla').textContent = summary.pastSla + pct(summary.pastSla);
  document.getElementById('parcel-summary-ups').textContent = summary.ups + pct(summary.ups);
  document.getElementById('parcel-summary-usps').textContent = summary.usps + pct(summary.usps);
  document.getElementById('parcel-summary-fedex').textContent = summary.fedex + pct(summary.fedex);
  document.getElementById('parcel-summary-amazon').textContent = summary.amazon + pct(summary.amazon);
}

function renderParcelRow(order) {
  const slaClass = order.withinSla === true ? 'within-sla' : order.withinSla === false ? 'past-sla' : '';
  const slaDisplay = formatSlaHours(order.slaHours);

  return `
    <tr>
      <td><span class="order-number">${escapeParcelHtml(order.orderNo)}</span></td>
      <td>${escapeParcelHtml(order.poNo)}</td>
      <td>${formatParcelDate(order.createdAt)}</td>
      <td>${formatParcelDate(order.shippedDate)}</td>
      <td><span class="sla-time ${slaClass}">${slaDisplay}</span></td>
      <td class="tracking-cell">${escapeParcelHtml(order.trackingNumber || '-')}</td>
      <td>${escapeParcelHtml(order.carrier)}</td>
      <td>${escapeParcelHtml(order.state || '-')}</td>
      <td>${order.weight !== null && order.weight !== undefined ? `${order.weight} lb` : '-'}</td>
      <td>${order.freightCost !== null && order.freightCost !== undefined ? formatCurrency(order.freightCost) : '-'}</td>
    </tr>
  `;
}

function renderParcelOrders(orders) {
  const tbody = document.getElementById('parcel-sla-list');

  const countEl = document.getElementById('parcel-filter-count');
  if (countEl) countEl.textContent = `${orders.length} Order${orders.length !== 1 ? 's' : ''}`;

  if (orders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="empty-state">
          No parcel orders found for this period
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = orders.map(renderParcelRow).join('');
}

function renderParcelLoading() {
  document.getElementById('parcel-sla-list').innerHTML = `
    <tr>
      <td colspan="10" class="loading">
        <div class="loading-spinner"></div>
        <p>Loading parcel SLA data...</p>
      </td>
    </tr>
  `;
}

function renderParcelError(message) {
  document.getElementById('parcel-sla-list').innerHTML = `
    <tr>
      <td colspan="10" class="error">
        <p>Error: ${message}</p>
        <button onclick="loadParcelSla()" class="refresh-btn" style="margin-top: 12px;">Retry</button>
      </td>
    </tr>
  `;
}

async function loadParcelSla() {
  renderParcelLoading();
  const startTime = Date.now();

  try {
    const data = await fetchParcelSla(parcelDaysFilter);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    parcelSlaData = data.orders;
    renderParcelSummary(data.summary);
    applyParcelFiltersAndRender();
    const updatedText = `Last updated: ${new Date().toLocaleTimeString()} (${elapsed}s)`;
    tabLastUpdated['#/parcel-sla'] = updatedText;
    if (currentTab === '#/parcel-sla') {
      document.getElementById('last-updated').textContent = updatedText;
    }
  } catch (error) {
    renderParcelError(error.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const daysSelect = document.getElementById('parcel-days-filter');
  if (daysSelect) daysSelect.addEventListener('change', e => {
    parcelDaysFilter = parseInt(e.target.value);
    loadParcelSla();
  });

  const slaSelect = document.getElementById('parcel-sla-filter');
  if (slaSelect) slaSelect.addEventListener('change', e => {
    parcelStatusFilter = e.target.value;
    applyParcelFiltersAndRender();
  });

  const carrierSelect = document.getElementById('parcel-carrier-filter');
  if (carrierSelect) carrierSelect.addEventListener('change', e => {
    parcelCarrierFilter = e.target.value;
    applyParcelFiltersAndRender();
  });

  const sortSelect = document.getElementById('parcel-sort-filter');
  if (sortSelect) sortSelect.addEventListener('change', e => {
    parcelSortOption = e.target.value;
    applyParcelFiltersAndRender();
  });

  const createdFrom = document.getElementById('parcel-created-from');
  if (createdFrom) createdFrom.addEventListener('change', e => {
    parcelCreatedFrom = e.target.value;
    applyParcelFiltersAndRender();
  });

  const createdTo = document.getElementById('parcel-created-to');
  if (createdTo) createdTo.addEventListener('change', e => {
    parcelCreatedTo = e.target.value;
    applyParcelFiltersAndRender();
  });

  const shippedFrom = document.getElementById('parcel-shipped-from');
  if (shippedFrom) shippedFrom.addEventListener('change', e => {
    parcelShippedFrom = e.target.value;
    applyParcelFiltersAndRender();
  });

  const shippedTo = document.getElementById('parcel-shipped-to');
  if (shippedTo) shippedTo.addEventListener('change', e => {
    parcelShippedTo = e.target.value;
    applyParcelFiltersAndRender();
  });

  const exportBtn = document.getElementById('export-parcel-btn');
  if (exportBtn) exportBtn.addEventListener('click', exportParcelSlaCSV);
});
