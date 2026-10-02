// Users Tab - Frontend JavaScript
// Admin-only management of dashboard logins (HTTP Basic auth, see middleware.mjs). The tab
// link only appears for admins; api/users.js enforces admin access server-side regardless.

const USERS_API = '/api/users';

let currentUser = null; // { username, isAdmin } from /api/me
let usersList = [];

function escapeUsersHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setUsersMessage(text, isError = false) {
  const el = document.getElementById('users-message');
  el.textContent = text;
  el.classList.toggle('users-message-error', isError);
}

async function usersRequest(method, { body, query = '' } = {}) {
  const response = await fetch(`${USERS_API}${query}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function renderUsers() {
  const tbody = document.getElementById('users-list');
  if (usersList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No users</td></tr>';
    return;
  }

  tbody.innerHTML = usersList.map(u => {
    const isSelf = currentUser && u.username === currentUser.username;
    const name = escapeUsersHtml(u.username);
    return `
      <tr>
        <td>${name}${isSelf ? ' (you)' : ''}</td>
        <td>${u.is_admin ? 'Admin' : 'User'}</td>
        <td>${u.created_at ? formatDate(u.created_at) : '-'}${u.created_by ? ` by ${escapeUsersHtml(u.created_by)}` : ''}</td>
        <td>${u.updated_at ? formatDate(u.updated_at) : '-'}</td>
        <td class="users-actions">
          <button type="button" class="export-btn" data-action="reset" data-username="${name}">Reset Password</button>
          ${isSelf ? '' : `<button type="button" class="export-btn" data-action="role" data-username="${name}" data-admin="${u.is_admin}">${u.is_admin ? 'Make User' : 'Make Admin'}</button>`}
          ${isSelf ? '' : `<button type="button" class="export-btn users-delete-btn" data-action="delete" data-username="${name}">Delete</button>`}
        </td>
      </tr>
    `;
  }).join('');
}

async function loadUsers() {
  try {
    const data = await usersRequest('GET');
    usersList = data.users;
    renderUsers();
    tabLastUpdated['#/users'] = `Last updated: ${new Date().toLocaleTimeString()}`;
    if (currentTab === '#/users') showTabLastUpdated();
  } catch (error) {
    setUsersMessage(error.message, true);
  }
}

async function handleAddUser(e) {
  e.preventDefault();
  const usernameInput = document.getElementById('users-new-username');
  const passwordInput = document.getElementById('users-new-password');
  const isAdmin = document.getElementById('users-new-admin').checked;
  const username = usernameInput.value.trim().toLowerCase();

  try {
    await usersRequest('POST', { body: { username, password: passwordInput.value, isAdmin } });
    setUsersMessage(`Added ${username}. Share the password with them directly.`);
    e.target.reset();
    await loadUsers();
  } catch (error) {
    setUsersMessage(error.message, true);
  }
}

// Reset uses an inline row instead of prompt(): passwords typed into prompt() are visible on screen.
function showResetRow(username) {
  document.querySelectorAll('.users-reset-row').forEach(row => row.remove());
  const button = document.querySelector(`#users-list [data-action="reset"][data-username="${CSS.escape(username)}"]`);
  const row = document.createElement('tr');
  row.className = 'users-reset-row';
  row.innerHTML = `
    <td colspan="5">
      <form class="users-reset-form" autocomplete="off">
        <label>New password for ${escapeUsersHtml(username)}:</label>
        <input type="password" minlength="10" required autocomplete="new-password">
        <button type="submit" class="refresh-btn">Save</button>
        <button type="button" class="export-btn" data-action="cancel">Cancel</button>
      </form>
    </td>
  `;
  button.closest('tr').after(row);
  const form = row.querySelector('form');
  form.querySelector('input').focus();
  form.querySelector('[data-action="cancel"]').addEventListener('click', () => row.remove());
  form.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await usersRequest('PUT', { body: { username, password: form.querySelector('input').value } });
      row.remove();
      setUsersMessage(`Password reset for ${username}.`);
      await loadUsers();
    } catch (error) {
      setUsersMessage(error.message, true);
    }
  });
}

async function handleUsersTableClick(e) {
  const button = e.target.closest('button[data-action]');
  if (!button || !button.dataset.username) return;
  const username = button.dataset.username;

  try {
    if (button.dataset.action === 'reset') {
      showResetRow(username);
    } else if (button.dataset.action === 'role') {
      const makeAdmin = button.dataset.admin !== 'true';
      await usersRequest('PUT', { body: { username, isAdmin: makeAdmin } });
      setUsersMessage(`${username} is now ${makeAdmin ? 'an admin' : 'a user'}.`);
      await loadUsers();
    } else if (button.dataset.action === 'delete') {
      // Two-click confirm instead of confirm(), which blocks the page
      if (button.dataset.confirming !== 'true') {
        button.dataset.confirming = 'true';
        button.textContent = 'Confirm Delete';
        return;
      }
      await usersRequest('DELETE', { query: `?username=${encodeURIComponent(username)}` });
      setUsersMessage(`Deleted ${username}.`);
      await loadUsers();
    }
  } catch (error) {
    setUsersMessage(error.message, true);
  }
}

// Shows who is signed in, and the Users tab link for admins.
async function initCurrentUser() {
  try {
    const response = await fetch('/api/me');
    if (!response.ok) return;
    currentUser = await response.json();
    document.getElementById('signed-in-user').textContent = `Signed in as ${currentUser.username}`;
    if (currentUser.isAdmin) {
      document.getElementById('users-tab-link').style.display = '';
    }
  } catch (error) {
    console.error('Error loading current user:', error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('users-add-form').addEventListener('submit', handleAddUser);
  document.getElementById('users-list').addEventListener('click', handleUsersTableClick);
  initCurrentUser();
});
