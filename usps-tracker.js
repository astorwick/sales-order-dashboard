// USPS Tracker tab

let uspsTrackerData = null;
let uspsTrackerDays = 14;
let uspsCarrierFilter = 'all';
let uspsStatusFilter = 'all';
let uspsSearchQuery = '';
let uspsSortOption = 'time-desc';

const PRE_SHIPMENT_STATUSES = new Set([
  'CONFIRMED', 'LABEL_PURCHASED', 'LABEL_PRINTED', 'LABEL_VOIDED', 'MARKED_AS_FULFILLED', 'SUBMITTED'
]);

function formatShipmentStatus(status) {
  const labels = {
    CONFIRMED: 'Pre-Shipment',
    LABEL_PURCHASED: 'Label Created',
    LABEL_PRINTED: 'Label Created',
    LABEL_VOIDED: 'Label Voided',
    MARKED_AS_FULFILLED: 'Label Created',
    SUBMITTED: 'Submitted',
    IN_TRANSIT: 'In Transit',
    OUT_FOR_DELIVERY: 'Out for Delivery',
    ATTEMPTED_DELIVERY: 'Attempted Delivery',
    DELIVERED: 'Delivered',
    FAILURE: 'Failure',
    NOT_DELIVERED: 'Not Delivered',
    PICKED_UP: 'Picked Up',
    READY_FOR_PICKUP: 'Ready for Pickup',
    FULFILLED: 'Fulfilled',
    NOT_AVAILABLE: 'Not Available'
  };
  return labels[status] || status;
}

function shipmentStatusClass(status) {
  if (PRE_SHIPMENT_STATUSES.has(status)) return 'missing_tracking';
  if (['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'PICKED_UP', 'SUBMITTED'].includes(status)) return 'warning';
  if (status === 'DELIVERED') return 'complete';
  if (['FAILURE', 'NOT_DELIVERED', 'ATTEMPTED_DELIVERY'].includes(status)) return 'stuck';
  return 'ok';
}

function getFilteredUSPSShipments() {
  if (!uspsTrackerData) return [];
  const filtered = uspsTrackerData.shipments.filter(s => {
    if (uspsCarrierFilter !== 'all' && s.carrier !== uspsCarrierFilter) return false;
    if (uspsStatusFilter === 'pre-shipment' && !s.isPreShipment) return false;
    if (uspsStatusFilter !== 'all' && uspsStatusFilter !== 'pre-shipment' && s.shipmentStatus !== uspsStatusFilter) return false;
    if (uspsSearchQuery && !s.orderName.toLowerCase().includes(uspsSearchQuery.toLowerCase())) return false;
    return true;
  });

  filtered.sort((a, b) => {
    switch (uspsSortOption) {
      case 'time-desc': return new Date(a.fulfilledAt) - new Date(b.fulfilledAt);
      case 'time-asc':  return new Date(b.fulfilledAt) - new Date(a.fulfilledAt);
      case 'fulfilled-asc': return new Date(a.fulfilledAt) - new Date(b.fulfilledAt);
      case 'fulfilled-desc': return new Date(b.fulfilledAt) - new Date(a.fulfilledAt);
      case 'order-asc':  return a.orderName.localeCompare(b.orderName);
      case 'order-desc': return b.orderName.localeCompare(a.orderName);
      default: return 0;
    }
  });

  return filtered;
}

function loadUSPSTracker() {
  const startTime = Date.now();
  const tbody = document.getElementById('usps-tracker-list');
  tbody.innerHTML = '<tr><td colspan="5" class="loading"><div class="loading-spinner"></div><p>Loading shipments...</p></td></tr>';
  document.getElementById('usps-tracker-summary-total').textContent = '-';
  document.getElementById('usps-tracker-summary-pre').textContent = '-';

  fetch(`${API_BASE}/usps-tracker?days=${uspsTrackerDays}`)
    .then(r => r.json())
    .then(data => {
      if (!data.success) throw new Error(data.error || 'Unknown error');
      uspsTrackerData = data;
      renderUSPSTracker();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      tabLastUpdated['#/usps-tracker'] = `Last updated: ${new Date().toLocaleTimeString()} (${elapsed}s)`;
      showTabLastUpdated();
    })
    .catch(err => {
      tbody.innerHTML = `<tr><td colspan="5" class="loading"><p>Error loading data: ${escapeHtml(err.message)}</p></td></tr>`;
    });
}

function renderUSPSTracker() {
  if (!uspsTrackerData) return;
  // Rebuild carrier filter options from live data
  const carrierSelect = document.getElementById('usps-carrier-filter');
  const currentCarrier = carrierSelect.value;
  const carriers = [...new Set(uspsTrackerData.shipments.map(s => s.carrier).filter(Boolean))].sort();
  carrierSelect.innerHTML = '<option value="all">All Carriers</option>';
  carriers.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    carrierSelect.appendChild(opt);
  });
  carrierSelect.value = carriers.includes(currentCarrier) ? currentCarrier : 'all';

  const by = uspsTrackerData.summary.byStatus;
  document.getElementById('usps-tracker-summary-total').textContent = uspsTrackerData.summary.total;
  document.getElementById('usps-tracker-summary-pre').textContent = uspsTrackerData.summary.preShipment;
  document.getElementById('usps-tracker-summary-in-transit').textContent = by['IN_TRANSIT'] || 0;
  document.getElementById('usps-tracker-summary-out-for-delivery').textContent = by['OUT_FOR_DELIVERY'] || 0;
  document.getElementById('usps-tracker-summary-attempted').textContent = by['ATTEMPTED_DELIVERY'] || 0;
  document.getElementById('usps-tracker-summary-delivered').textContent = by['DELIVERED'] || 0;
  document.getElementById('usps-tracker-summary-failure').textContent = (by['FAILURE'] || 0) + (by['NOT_DELIVERED'] || 0);

  // Carrier pre-shipment cards
  const CARRIER_CARD_IDS = { 'UPS': 'usps-carrier-pre-ups', 'USPS': 'usps-carrier-pre-usps', 'FedEx': 'usps-carrier-pre-fedex', 'AmazonShip': 'usps-carrier-pre-amazon' };
  Object.values(CARRIER_CARD_IDS).forEach(id => { document.getElementById(id).textContent = '0'; });
  uspsTrackerData.shipments.forEach(s => {
    if (s.isPreShipment && s.carrier && CARRIER_CARD_IDS[s.carrier]) {
      const el = document.getElementById(CARRIER_CARD_IDS[s.carrier]);
      el.textContent = parseInt(el.textContent) + 1;
    }
  });

  const filtered = getFilteredUSPSShipments();
  const tbody = document.getElementById('usps-tracker-list');

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading"><p>No shipments match the current filters.</p></td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(s => {
    const statusClass = shipmentStatusClass(s.shipmentStatus);
    const trackingDisplay = s.trackingUrl
      ? `<a href="${escapeHtml(s.trackingUrl)}" target="_blank" rel="noopener">${escapeHtml(s.trackingNumber || '—')}</a>`
      : escapeHtml(s.trackingNumber || '—');
    return `
      <tr>
        <td><span class="order-number">${escapeHtml(s.orderName)}</span></td>
        <td>${s.fulfilledAt ? formatDate(s.fulfilledAt) : '—'}</td>
        <td>${s.fulfilledAt ? formatTime(Math.floor((Date.now() - new Date(s.fulfilledAt)) / 60000)) : '—'}</td>
        <td>${escapeHtml(s.carrier || '—')}</td>
        <td>${trackingDisplay}</td>
        <td><span class="status-badge ${statusClass}">${escapeHtml(formatShipmentStatus(s.shipmentStatus))}</span></td>
      </tr>
    `;
  }).join('');
}

function exportUSPSTrackerCSV() {
  const filtered = getFilteredUSPSShipments();
  if (!filtered.length) return;

  const headers = ['Order #', 'Fulfilled', 'Time Since Fulfilled', 'Carrier', 'Tracking #', 'Shipment Status'];
  const rows = filtered.map(s => [
    csvEscape(s.orderName),
    csvEscape(s.fulfilledAt ? new Date(s.fulfilledAt).toLocaleString() : ''),
    csvEscape(s.fulfilledAt ? formatTime(Math.floor((Date.now() - new Date(s.fulfilledAt)) / 60000)) : ''),
    csvEscape(s.carrier || ''),
    csvEscape(s.trackingNumber || ''),
    csvEscape(formatShipmentStatus(s.shipmentStatus))
  ].join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(`usps-tracker-${date}.csv`, csv);
}

function initUSPSTracker() {
  document.getElementById('usps-tracker-days').addEventListener('change', e => {
    uspsTrackerDays = parseInt(e.target.value);
    loadUSPSTracker();
  });

  document.getElementById('usps-carrier-filter').addEventListener('change', e => {
    uspsCarrierFilter = e.target.value;
    renderUSPSTracker();
  });

  document.getElementById('usps-status-filter').addEventListener('change', e => {
    uspsStatusFilter = e.target.value;
    renderUSPSTracker();
  });

  document.getElementById('usps-search').addEventListener('input', e => {
    uspsSearchQuery = e.target.value.trim();
    renderUSPSTracker();
  });

  document.getElementById('usps-sort').addEventListener('change', e => {
    uspsSortOption = e.target.value;
    renderUSPSTracker();
  });

  document.getElementById('export-usps-btn').addEventListener('click', exportUSPSTrackerCSV);
}
