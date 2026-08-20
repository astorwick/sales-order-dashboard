// Parcel SLA Tab - Frontend JavaScript

const PARCEL_API = '/api/parcel-sla';

let parcelSlaData = [];
let parcelDaysFilter = 7;
let parcelCustomRange = null; // {startDate, endDate} when Custom Range is active, else null
let parcelStatusFilter = 'all';
let parcelCarrierFilter = 'all';
let parcelSortOption = 'shipped-desc';

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

  const headers = ['Order #', 'PO #', 'Created', 'Shipped', 'SLA (hrs)', 'Tracking ID', 'Carrier'];
  const rows = filtered.map(order => [
    csvEscape(order.orderNo),
    csvEscape(order.poNo),
    csvEscape(order.createdAt ? new Date(order.createdAt).toLocaleString() : ''),
    csvEscape(order.shippedDate ? new Date(order.shippedDate).toLocaleString() : ''),
    csvEscape(formatSlaHours(order.slaHours)),
    csvEscape(order.trackingNumber || ''),
    csvEscape(order.carrier || '')
  ].join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(`parcel-sla-${date}.csv`, csv);
}

async function fetchParcelSla(range) {
  const query = range.startDate
    ? `startDate=${range.startDate}&endDate=${range.endDate}`
    : `days=${range.days}`;
  const response = await fetch(`${PARCEL_API}?${query}`);
  if (!response.ok) throw new Error('Failed to fetch parcel SLA data');
  return response.json();
}

function renderParcelCarrierCard(prefix, carrier, total) {
  const pct = total > 0 ? ` (${((carrier.count / total) * 100).toFixed(1)}%)` : '';
  document.getElementById(`parcel-summary-${prefix}`).textContent = carrier.count + pct;
}

function renderParcelSummary(summary) {
  const total = summary.total || 0;
  document.getElementById('parcel-summary-total').textContent = total;
  const withinPct = total > 0 ? ` (${((summary.withinSla / total) * 100).toFixed(1)}%)` : '';
  document.getElementById('parcel-summary-within-sla').textContent = summary.withinSla + withinPct;
  document.getElementById('parcel-summary-past-sla').textContent = summary.pastSla;
  renderParcelCarrierCard('ups', summary.ups, total);
  renderParcelCarrierCard('usps', summary.usps, total);
  renderParcelCarrierCard('fedex', summary.fedex, total);
  renderParcelCarrierCard('amazon', summary.amazon, total);
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
        <td colspan="7" class="empty-state">
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
      <td colspan="7" class="loading">
        <div class="loading-spinner"></div>
        <p>Loading parcel SLA data...</p>
      </td>
    </tr>
  `;
}

function renderParcelError(message) {
  document.getElementById('parcel-sla-list').innerHTML = `
    <tr>
      <td colspan="7" class="error">
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
    const range = parcelCustomRange || { days: parcelDaysFilter };
    const data = await fetchParcelSla(range);
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
  const customRangeGroup = document.getElementById('parcel-custom-range');
  if (daysSelect) daysSelect.addEventListener('change', e => {
    if (e.target.value === 'custom') {
      if (customRangeGroup) customRangeGroup.style.display = 'flex';
      return;
    }
    if (customRangeGroup) customRangeGroup.style.display = 'none';
    parcelCustomRange = null;
    parcelDaysFilter = parseInt(e.target.value);
    loadParcelSla();
  });

  const applyCustomRangeBtn = document.getElementById('parcel-apply-custom-range');
  if (applyCustomRangeBtn) applyCustomRangeBtn.addEventListener('click', () => {
    const startDate = document.getElementById('parcel-start-date').value;
    const endDate = document.getElementById('parcel-end-date').value;
    if (!startDate || !endDate) {
      alert('Please select both a start and end date.');
      return;
    }
    if (endDate < startDate) {
      alert('End date must be on or after the start date.');
      return;
    }
    parcelCustomRange = { startDate, endDate };
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

  const exportBtn = document.getElementById('export-parcel-btn');
  if (exportBtn) exportBtn.addEventListener('click', exportParcelSlaCSV);
});
