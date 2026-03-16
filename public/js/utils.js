// ========================================
// HTML Escaping
// ========================================
const escDiv = document.createElement('div');
export function esc(str) {
  escDiv.textContent = str ?? '';
  return escDiv.innerHTML;
}

// ========================================
// Date Formatting
// ========================================
export function fmtDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
  return d.toLocaleString();
}

// ========================================
// Storage
// ========================================
export const storage = {
  get(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  remove(key) {
    localStorage.removeItem(key);
  },
};

// ========================================
// API Helpers
// ========================================
export function api(path, options = {}) {
  const token = storage.get('adminToken', '');
  return fetch(`../api/${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {}),
    },
  }).then(async r => {
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  });
}

export function apiPublic(path, options = {}) {
  return fetch(`api/${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  }).then(async r => {
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  });
}

// ========================================
// Event Delegation
// ========================================
export function delegate(parent, selector, event, handler) {
  parent.addEventListener(event, (e) => {
    const target = e.target.closest(selector);
    if (target && parent.contains(target)) {
      handler(e, target);
    }
  });
}

// ========================================
// Toast Notifications
// ========================================
let toastContainer = null;

function getToastContainer() {
  if (!toastContainer) {
    toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toastContainer';
      toastContainer.className = 'toast-container';
      toastContainer.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastContainer);
    }
  }
  return toastContainer;
}

function showToast(message, type = 'info', duration = 4000) {
  const container = getToastContainer();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', 'alert');
  el.innerHTML = `<span>${esc(message)}</span><button class="toast-close" aria-label="Close">\u00d7</button>`;

  el.querySelector('.toast-close').addEventListener('click', () => removeToast(el));
  container.appendChild(el);

  if (duration > 0) {
    setTimeout(() => removeToast(el), duration);
  }
  return el;
}

function removeToast(el) {
  if (!el.parentNode) return;
  el.classList.add('removing');
  el.addEventListener('animationend', () => el.remove(), { once: true });
}

export const toast = {
  success: (msg) => showToast(msg, 'success'),
  error: (msg) => showToast(msg, 'error'),
  warning: (msg) => showToast(msg, 'warning'),
  info: (msg) => showToast(msg, 'info'),
};

// ========================================
// Modal / Confirm Dialog
// ========================================
let modalOverlay = null;
let modalResolve = null;

function getModal() {
  if (!modalOverlay) {
    modalOverlay = document.getElementById('modalOverlay');
  }
  return modalOverlay;
}

export const modal = {
  confirm(title, message, { confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = {}) {
    return new Promise((resolve) => {
      const overlay = getModal();
      if (!overlay) return resolve(false);

      modalResolve = resolve;
      overlay.querySelector('#modalTitle').textContent = title;
      overlay.querySelector('#modalBody').textContent = message;

      const confirmBtn = overlay.querySelector('#modalConfirmBtn');
      const cancelBtn = overlay.querySelector('#modalCancelBtn');
      confirmBtn.textContent = confirmText;
      cancelBtn.textContent = cancelText;
      confirmBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';

      overlay.classList.add('visible');
      confirmBtn.focus();
    });
  },
};

function closeModal(result) {
  const overlay = getModal();
  if (overlay) overlay.classList.remove('visible');
  if (modalResolve) {
    modalResolve(result);
    modalResolve = null;
  }
}

document.addEventListener('click', (e) => {
  if (e.target.id === 'modalConfirmBtn') closeModal(true);
  if (e.target.id === 'modalCancelBtn' || e.target.classList.contains('modal-overlay')) closeModal(false);
});

document.addEventListener('keydown', (e) => {
  if (!modalResolve) return;
  if (e.key === 'Escape') closeModal(false);
  if (e.key === 'Enter') closeModal(true);
});

// ========================================
// Button Loading State
// ========================================
export async function withLoading(btn, asyncFn) {
  btn.classList.add('loading');
  btn.disabled = true;
  try {
    return await asyncFn();
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

// ========================================
// Skeleton Loader
// ========================================
export function showSkeleton(el, rows = 3) {
  el.innerHTML = Array.from({ length: rows },
    () => '<div class="skeleton-row"></div>'
  ).join('');
}

// ========================================
// Form Validation
// ========================================
export function validateForm(form, rules) {
  let valid = true;
  for (const [name, fieldRules] of Object.entries(rules)) {
    const input = form.querySelector(`[name="${name}"]`);
    if (!input) continue;
    const error = validateField(input, fieldRules);
    if (error) valid = false;
  }
  return valid;
}

function validateField(input, rules) {
  const value = input.value.trim();
  const errorEl = input.parentElement.querySelector('.form-error');
  let message = null;

  if (rules.required && !value) {
    message = 'This field is required';
  } else if (rules.email && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    message = 'Invalid email address';
  } else if (rules.minLength && value.length < rules.minLength) {
    message = `At least ${rules.minLength} characters`;
  }

  if (message) {
    input.classList.add('error');
    if (errorEl) { errorEl.textContent = message; errorEl.classList.add('visible'); }
    return message;
  }

  input.classList.remove('error');
  if (errorEl) { errorEl.textContent = ''; errorEl.classList.remove('visible'); }
  return null;
}

// Clear errors on input
document.addEventListener('input', (e) => {
  if (e.target.classList.contains('form-input') && e.target.classList.contains('error')) {
    e.target.classList.remove('error');
    const errorEl = e.target.parentElement.querySelector('.form-error');
    if (errorEl) { errorEl.textContent = ''; errorEl.classList.remove('visible'); }
  }
});
