import { api, esc, fmtDate, storage, delegate, toast, modal, withLoading, showSkeleton } from './utils.js';

// ========================================
// State & Elements
// ========================================
const $ = (id) => document.getElementById(id);

const tokenInput = $('adminToken');
const saveTokenBtn = $('saveTokenBtn');
const authStatus = $('authStatus');
const usersContent = $('usersContent');
const userCount = $('userCount');
const addonsPanel = $('userAddonsPanel');
const addonsTitle = $('userAddonsTitle');
const addonsList = $('userAddonsList');
const configContent = $('configContent');
const configCount = $('configCount');
const previewContent = $('previewContent');
const deployResult = $('deployResult');
const logsContent = $('logsContent');

// ========================================
// Init
// ========================================
const savedToken = storage.get('adminToken', '');
if (savedToken) {
  tokenInput.value = savedToken;
  connect();
}

// ========================================
// Auth
// ========================================
saveTokenBtn.addEventListener('click', connect);
tokenInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') connect(); });

async function connect() {
  const token = tokenInput.value.trim();
  if (!token) {
    setAuthStatus(false);
    return;
  }
  storage.set('adminToken', token);

  await withLoading(saveTokenBtn, async () => {
    try {
      await api('users');
      setAuthStatus(true);
      loadAll();
    } catch {
      setAuthStatus(false);
      toast.error('Invalid admin token');
    }
  });
}

function setAuthStatus(connected) {
  authStatus.innerHTML = connected
    ? `<span class="auth-dot connected"></span><span class="text-success text-sm">Connected</span>`
    : `<span class="auth-dot disconnected"></span><span class="text-error text-sm">Disconnected</span>`;
}

async function loadAll() {
  await Promise.all([loadUsers(), loadConfig(), loadDeployStatus(), loadLogs()]);
}

// ========================================
// Users
// ========================================
async function loadUsers() {
  showSkeleton(usersContent, 3);
  try {
    const { users } = await api('users');
    userCount.textContent = `${users.length} enrolled`;

    if (users.length === 0) {
      usersContent.innerHTML = '<p class="empty">No users enrolled yet.</p>';
      return;
    }

    usersContent.innerHTML = `<table class="data-table">
      <thead><tr><th>Email</th><th>Enrolled</th><th>Last sync</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${users.map(u => `<tr>
        <td data-label="Email">${esc(u.email)}</td>
        <td data-label="Enrolled">${fmtDate(u.created_at)}</td>
        <td data-label="Last sync">${u.last_sync_at ? fmtDate(u.last_sync_at) : '-'}</td>
        <td data-label="Status">${statusBadge(u.last_sync_status)}</td>
        <td class="actions" data-label="">
          <div class="btn-group">
            <button class="btn btn-sm btn-primary" data-action="view-addons" data-user-id="${u.id}" data-email="${esc(u.email)}">Addons</button>
            <button class="btn btn-sm btn-secondary" data-action="use-as-master" data-user-id="${u.id}" data-email="${esc(u.email)}">Use as master</button>
            <button class="btn btn-sm btn-secondary" data-action="test" data-user-id="${u.id}">Test</button>
            <button class="btn btn-sm btn-secondary" data-action="sync" data-user-id="${u.id}">Sync</button>
            <button class="btn btn-sm btn-danger" data-action="delete" data-user-id="${u.id}" data-email="${esc(u.email)}">Delete</button>
          </div>
        </td>
      </tr>`).join('')}</tbody>
    </table>`;
  } catch (e) {
    usersContent.innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  }
}

function statusBadge(status) {
  if (!status) return '<span class="badge badge-pending">new</span>';
  return `<span class="badge badge-${status === 'ok' ? 'ok' : 'error'}">${esc(status)}</span>`;
}

// User actions (event delegation)
delegate(usersContent, '[data-action="view-addons"]', 'click', (e, btn) => {
  viewAddons(+btn.dataset.userId, btn.dataset.email);
});

delegate(usersContent, '[data-action="use-as-master"]', 'click', async (e, btn) => {
  const { userId, email } = btn.dataset;
  const ok = await modal.confirm('Import config', `Use ${email}'s current addons as master config?`);
  if (!ok) return;
  await withLoading(btn, async () => {
    try {
      const res = await api('config/import-from-user', {
        method: 'POST',
        body: JSON.stringify({ userId: +userId }),
      });
      toast.success(`Imported ${res.imported} addons (${res.skippedProtected} protected skipped)`);
      loadConfig();
    } catch (err) { toast.error(err.message); }
  });
});

delegate(usersContent, '[data-action="test"]', 'click', async (e, btn) => {
  await withLoading(btn, async () => {
    try {
      const res = await api(`users/${btn.dataset.userId}/test`, { method: 'POST' });
      res.success ? toast.success('Connection OK') : toast.error(`Failed: ${res.message}`);
    } catch (err) { toast.error(err.message); }
  });
});

delegate(usersContent, '[data-action="sync"]', 'click', async (e, btn) => {
  const ok = await modal.confirm('Sync user', 'Deploy master config to this user?');
  if (!ok) return;
  await withLoading(btn, async () => {
    try {
      await api(`users/${btn.dataset.userId}/sync`, { method: 'POST' });
      toast.success('Sync complete');
      loadUsers();
    } catch (err) { toast.error(err.message); }
  });
});

delegate(usersContent, '[data-action="delete"]', 'click', async (e, btn) => {
  const { userId, email } = btn.dataset;
  const ok = await modal.confirm('Remove user', `Remove ${email}? This cannot be undone.`, { danger: true, confirmText: 'Remove' });
  if (!ok) return;
  try {
    await api(`users/${userId}`, { method: 'DELETE' });
    toast.success('User removed');
    loadUsers();
  } catch (err) { toast.error(err.message); }
});

// ========================================
// User Addons Panel
// ========================================
async function viewAddons(userId, email) {
  addonsPanel.classList.remove('hidden');
  addonsTitle.textContent = `Addons — ${email}`;
  showSkeleton(addonsList, 4);

  try {
    const data = await api(`users/${userId}/addons`);
    if (data.addons.length === 0) {
      addonsList.innerHTML = '<p class="empty">No addons installed.</p>';
      return;
    }
    addonsList.innerHTML = `<ul class="addon-list">${data.addons.map(a => `<li class="addon-item">
      <div class="addon-info">
        <div class="addon-name">${esc(a.name)}</div>
        <div class="addon-url">${esc(a.transportUrl)}</div>
        <div class="addon-tags">
          ${a.protected ? '<span class="badge badge-pending">protected</span>' : ''}
          ${a.official ? '<span class="badge badge-ok">official</span>' : ''}
        </div>
      </div>
      ${!a.protected ? `<button class="btn btn-sm btn-danger" data-action="remove-addon" data-user-id="${userId}" data-email="${esc(email)}" data-url="${esc(a.transportUrl)}" data-name="${esc(a.name)}">Remove</button>` : ''}
    </li>`).join('')}</ul>`;
  } catch (err) {
    addonsList.innerHTML = `<p class="empty">${esc(err.message)}</p>`;
  }
}

$('closeAddonsBtn').addEventListener('click', () => addonsPanel.classList.add('hidden'));

delegate(addonsList, '[data-action="remove-addon"]', 'click', async (e, btn) => {
  const { userId, email, url, name } = btn.dataset;
  const ok = await modal.confirm('Remove addon', `Remove "${name}" from ${email}?`, { danger: true, confirmText: 'Remove' });
  if (!ok) return;
  await withLoading(btn, async () => {
    try {
      const res = await api(`users/${userId}/addons/remove`, {
        method: 'POST',
        body: JSON.stringify({ urls: [url] }),
      });
      toast.success(`Removed ${res.removed} addon(s)`);
      viewAddons(+userId, email);
    } catch (err) { toast.error(err.message); }
  });
});

// ========================================
// Master Config
// ========================================
async function loadConfig() {
  showSkeleton(configContent, 3);
  try {
    const { addons, updatedAt } = await api('config');
    configCount.textContent = addons.length ? `${addons.length} addons` : '';

    if (addons.length === 0) {
      configContent.innerHTML = '<p class="empty">No master config set. Import from your account to get started.</p>';
      return;
    }

    configContent.innerHTML = `<p class="text-muted text-sm mb-1">Updated ${fmtDate(updatedAt)}</p>
      <ul class="addon-list">${addons.map((a, i) => `<li class="addon-item">
        <div class="addon-info">
          <span class="addon-name">${esc(a.manifest?.name || a.manifest?.id || 'Unknown')}</span>
          <div class="addon-url">${esc(a.transportUrl)}</div>
        </div>
        <button class="btn btn-sm btn-danger" data-action="remove-config-addon" data-index="${i}">Remove</button>
      </li>`).join('')}</ul>`;
  } catch (e) {
    configContent.innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  }
}

delegate(configContent, '[data-action="remove-config-addon"]', 'click', async (e, btn) => {
  const ok = await modal.confirm('Remove addon', 'Remove this addon from master config?', { danger: true, confirmText: 'Remove' });
  if (!ok) return;
  try {
    const { addons } = await api('config');
    addons.splice(+btn.dataset.index, 1);
    await api('config', { method: 'POST', body: JSON.stringify({ addons }) });
    toast.success('Addon removed from master config');
    loadConfig();
  } catch (err) { toast.error(err.message); }
});

// Import config
$('importConfigBtn').addEventListener('click', async () => {
  const email = $('importEmail').value.trim();
  const password = $('importPassword').value;
  if (!email || !password) { toast.warning('Enter email and password'); return; }

  await withLoading($('importConfigBtn'), async () => {
    try {
      const res = await api('config/import', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      toast.success(`Imported ${res.imported} addons (${res.skippedProtected} protected skipped)`);
      $('importEmail').value = '';
      $('importPassword').value = '';
      loadConfig();
    } catch (err) { toast.error(err.message); }
  });
});

// ========================================
// Deploy
// ========================================
$('previewBtn').addEventListener('click', async () => {
  previewContent.innerHTML = '';

  await withLoading($('previewBtn'), async () => {
    try {
      const preview = await api('deploy/preview', { method: 'POST' });
      if (preview.users.length === 0) {
        previewContent.innerHTML = '<p class="empty">No users to preview.</p>';
        return;
      }

      previewContent.innerHTML = preview.users.map(u => {
        if (u.status === 'error') {
          return `<div class="preview-card">
            <h3>${esc(u.email)} <span class="badge badge-error">error</span></h3>
            <p class="text-error text-sm">${esc(u.error)}</p>
          </div>`;
        }
        const d = u.diff;
        const noChanges = d.added.length === 0 && d.removed.length === 0 && !d.orderChanged;
        return `<div class="preview-card">
          <h3>${esc(u.email)} <span class="badge ${noChanges ? 'badge-ok' : 'badge-pending'}">${noChanges ? 'no changes' : 'changes'}</span></h3>
          ${d.added.map(a => `<p class="diff-added text-sm">${esc(a.name || a.transportUrl)}</p>`).join('')}
          ${d.removed.map(a => `<p class="diff-removed text-sm">${esc(a.name || a.transportUrl)}</p>`).join('')}
          ${d.orderChanged && !d.added.length && !d.removed.length ? '<p class="text-sm" style="color:#fbbf24">Order will change</p>' : ''}
        </div>`;
      }).join('');
    } catch (err) { toast.error(err.message); }
  });
});

$('deployBtn').addEventListener('click', async () => {
  const ok = await modal.confirm('Deploy', 'Deploy master config to ALL users?', { confirmText: 'Deploy' });
  if (!ok) return;

  await withLoading($('deployBtn'), async () => {
    try {
      const result = await api('deploy', { method: 'POST' });
      deployResult.innerHTML = `<div class="log-viewer">${result.results.map(r =>
        `<div class="log-entry"><span>${esc(r.email)}</span> <span class="badge badge-${r.status === 'ok' ? 'ok' : 'error'}">${r.status}</span>${r.status === 'error' ? ` <span class="text-error text-sm">${esc(r.error)}</span>` : ''}</div>`
      ).join('')}</div>`;
      toast.success(`Deploy complete: ${result.completed} ok, ${result.failed} failed`);
      loadUsers();
    } catch (err) { toast.error(err.message); }
  });
});

async function loadDeployStatus() {
  try {
    const status = await api('deploy/status');
    if (status.message) return;
    if (status.finishedAt) {
      deployResult.innerHTML = `<p class="text-muted text-sm">Last deploy: ${fmtDate(status.finishedAt)} — ${status.completed} ok, ${status.failed} failed</p>`;
    }
  } catch {}
}

// ========================================
// Logs
// ========================================
async function loadLogs() {
  showSkeleton(logsContent, 3);
  try {
    const { logs } = await api('deploy/logs?limit=30');
    if (logs.length === 0) {
      logsContent.innerHTML = '<p class="empty">No logs yet.</p>';
      return;
    }
    logsContent.innerHTML = `<div class="log-viewer">${logs.map(l =>
      `<div class="log-entry"><span class="text-muted">${fmtDate(l.created_at)}</span> <span>${esc(l.email || '—')}</span> <span>${esc(l.action)}</span> <span class="badge badge-${l.status === 'ok' ? 'ok' : 'error'}">${l.status}</span></div>`
    ).join('')}</div>`;
  } catch (e) {
    logsContent.innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  }
}
