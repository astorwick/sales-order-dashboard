// Order Lookup Tab - Frontend JavaScript
// Ad-hoc search against UNIS's order-level search-by-paging endpoint by PO #,
// Reference #, and/or Created When range; shows UNIS's JSON response as-is.

const ORDER_LOOKUP_API = '/api/order-lookup';

let orderLookupCriteria = null; // last submitted search, reused for paging/refresh
let orderLookupPageNo = 1;
let orderLookupTotalPages = 0;
let orderLookupLastJson = '';

function getOrderLookupFormCriteria() {
  return {
    poNo: document.getElementById('order-lookup-po').value.trim(),
    referenceNo: document.getElementById('order-lookup-ref').value.trim(),
    createdWhenFrom: document.getElementById('order-lookup-from').value,
    createdWhenTo: document.getElementById('order-lookup-to').value
  };
}

function setOrderLookupResult(text, isError = false) {
  const el = document.getElementById('order-lookup-result');
  el.textContent = text;
  el.classList.toggle('json-result-error', isError);
}

function escapeOrderLookupHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ItemNames is a comma-separated SKU string; BASE QTY is the order's total quantity
// across all SKUs (UNIS doesn't break it down per SKU on this endpoint).
function renderOrderLookupTable(orders) {
  const container = document.getElementById('order-lookup-table-container');
  const tbody = document.getElementById('order-lookup-list');
  if (!orders) {
    container.style.display = 'none';
    tbody.innerHTML = '';
    return;
  }

  if (orders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">No orders found</td>
      </tr>
    `;
  } else {
    tbody.innerHTML = orders.map(o => {
      const skus = String(o.ItemNames || '').split(',').map(s => s.trim()).filter(Boolean);
      return `
        <tr>
          <td>${escapeOrderLookupHtml(o['PO #'] || '-')}</td>
          <td>${escapeOrderLookupHtml(o['Ref.#'] || o.referenceNo || '-')}</td>
          <td><span class="order-number">${escapeOrderLookupHtml(o['Order #'] || '-')}</span></td>
          <td>${skus.length ? skus.map(escapeOrderLookupHtml).join('<br>') : '-'}</td>
          <td>${escapeOrderLookupHtml(o['BASE QTY'] ?? '-')}</td>
          <td>${escapeOrderLookupHtml(o.Status || '-')}</td>
          <td>${escapeOrderLookupHtml(o.ShippedDate || '-')}</td>
        </tr>
      `;
    }).join('');
  }
  container.style.display = 'block';
}

function renderOrderLookupPaging(paging) {
  const bar = document.getElementById('order-lookup-paging');
  if (!paging) {
    bar.style.display = 'none';
    return;
  }
  orderLookupTotalPages = paging.totalPage || 0;
  const total = paging.totalCount || 0;
  document.getElementById('order-lookup-page-info').textContent =
    `${total} order${total !== 1 ? 's' : ''} • Page ${paging.pageNo || orderLookupPageNo} of ${Math.max(orderLookupTotalPages, 1)}`;
  document.getElementById('order-lookup-prev').disabled = orderLookupPageNo <= 1;
  document.getElementById('order-lookup-next').disabled = orderLookupPageNo >= orderLookupTotalPages;
  bar.style.display = 'flex';
}

async function runOrderLookup(pageNo) {
  if (!orderLookupCriteria) return;
  orderLookupPageNo = pageNo;

  const submitBtn = document.getElementById('order-lookup-submit');
  submitBtn.disabled = true;
  setOrderLookupResult('Searching UNIS...');
  renderOrderLookupTable(null);
  const startTime = Date.now();

  try {
    const response = await fetch(ORDER_LOOKUP_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...orderLookupCriteria, pageNo })
    });
    const body = await response.json();
    if (!response.ok || !body.success) {
      throw new Error(body.error || `Request failed (${response.status})`);
    }

    orderLookupLastJson = JSON.stringify(body.data, null, 2);
    setOrderLookupResult(orderLookupLastJson);
    renderOrderLookupPaging(body.data.paging);
    renderOrderLookupTable(body.data.results?.data || []);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const updatedText = `Last updated: ${new Date().toLocaleTimeString()} (${elapsed}s)`;
    tabLastUpdated['#/order-lookup'] = updatedText;
    if (currentTab === '#/order-lookup') {
      document.getElementById('last-updated').textContent = updatedText;
    }
  } catch (error) {
    orderLookupLastJson = '';
    renderOrderLookupPaging(null);
    renderOrderLookupTable(null);
    setOrderLookupResult(`Error: ${error.message}`, true);
  } finally {
    submitBtn.disabled = false;
  }
}

// Header Refresh button: re-run the last search on the current page
function refreshOrderLookup() {
  runOrderLookup(orderLookupPageNo);
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('order-lookup-form');
  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();
    const criteria = getOrderLookupFormCriteria();
    if (!Object.values(criteria).some(Boolean)) {
      renderOrderLookupPaging(null);
      renderOrderLookupTable(null);
      setOrderLookupResult('Enter at least one search field.', true);
      return;
    }
    orderLookupCriteria = criteria;
    runOrderLookup(1);
  });

  document.getElementById('order-lookup-clear').addEventListener('click', () => {
    form.reset();
    orderLookupCriteria = null;
    orderLookupLastJson = '';
    renderOrderLookupPaging(null);
    renderOrderLookupTable(null);
    setOrderLookupResult('Enter a PO #, Reference #, or Created When range and click Search.');
  });

  document.getElementById('order-lookup-prev').addEventListener('click', () => {
    if (orderLookupPageNo > 1) runOrderLookup(orderLookupPageNo - 1);
  });
  document.getElementById('order-lookup-next').addEventListener('click', () => {
    if (orderLookupPageNo < orderLookupTotalPages) runOrderLookup(orderLookupPageNo + 1);
  });

  document.getElementById('order-lookup-copy').addEventListener('click', async () => {
    if (!orderLookupLastJson) return;
    const btn = document.getElementById('order-lookup-copy');
    try {
      await navigator.clipboard.writeText(orderLookupLastJson);
      btn.textContent = 'Copied!';
    } catch {
      btn.textContent = 'Copy failed';
    }
    setTimeout(() => { btn.textContent = 'Copy JSON'; }, 1500);
  });
});
