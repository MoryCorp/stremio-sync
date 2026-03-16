import { decrypt } from './crypto.js';
import { getUserById, updateUserAuthKey } from './db.js';

const API_BASE = 'https://api.strem.io/api';
const TIMEOUT_MS = 10_000;

function createAbortSignal() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

async function stremioFetch(endpoint, body) {
  const { signal, clear } = createAbortSignal();
  try {
    const res = await fetch(`${API_BASE}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    const data = await res.json();
    if (data.error) {
      const err = new Error(data.error.message || 'Stremio API error');
      err.code = data.error.code;
      throw err;
    }
    return data.result;
  } finally {
    clear();
  }
}

export async function login(email, password) {
  return stremioFetch('login', { type: 'Login', email, password });
}

export async function getAddons(authKey) {
  const result = await stremioFetch('addonCollectionGet', {
    type: 'AddonCollectionGet',
    authKey,
    update: true,
  });
  return result.addons;
}

export async function setAddons(authKey, addons) {
  return stremioFetch('addonCollectionSet', {
    type: 'AddonCollectionSet',
    authKey,
    addons,
  });
}

export async function fetchManifest(transportUrl) {
  const { signal, clear } = createAbortSignal();
  try {
    const res = await fetch(transportUrl, { signal });
    if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status}`);
    return res.json();
  } finally {
    clear();
  }
}

function isAuthError(err) {
  return err.message?.toLowerCase().includes('auth')
    || err.code === 1
    || err.code === 2;
}

export async function withReauth(userId, fn) {
  const user = getUserById(userId);
  if (!user) throw new Error('User not found');

  try {
    return await fn(user.stremio_auth_key);
  } catch (err) {
    if (!isAuthError(err)) throw err;

    const password = decrypt(user.encrypted_password, user.password_iv, user.password_tag);
    const result = await login(user.email, password);
    updateUserAuthKey(userId, result.authKey);

    return fn(result.authKey);
  }
}
