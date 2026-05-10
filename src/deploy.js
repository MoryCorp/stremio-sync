import { getUsers, getMasterConfig, addSyncLog, updateUserSyncStatus } from './db.js';
import { getAddons, setAddons, withReauth } from './stremio-api.js';

// Deploy lock
let deployInProgress = false;
let lastDeployStatus = null;

export function normalizeUrl(url) {
  return url?.trim().replace(/\/+$/, '').toLowerCase() || '';
}

export function mergeAddons(currentAddons, masterAddons) {
  const masterUrls = new Set(masterAddons.map(a => normalizeUrl(a.transportUrl)));

  const protectedAddons = currentAddons.filter(a => a.flags?.protected);
  const personalAddons = currentAddons.filter(
    a => !a.flags?.protected && !masterUrls.has(normalizeUrl(a.transportUrl))
  );

  return [...protectedAddons, ...masterAddons, ...personalAddons];
}

export function computeDiff(currentAddons, mergedAddons) {
  const currentUrls = new Set(currentAddons.map(a => normalizeUrl(a.transportUrl)));
  const mergedUrls = new Set(mergedAddons.map(a => normalizeUrl(a.transportUrl)));

  const added = mergedAddons.filter(a => !currentUrls.has(normalizeUrl(a.transportUrl)));
  const removed = currentAddons.filter(a => !mergedUrls.has(normalizeUrl(a.transportUrl)));
  const kept = mergedAddons.filter(a => currentUrls.has(normalizeUrl(a.transportUrl)));

  const currentOrder = currentAddons.map(a => normalizeUrl(a.transportUrl));
  const mergedOrder = mergedAddons.map(a => normalizeUrl(a.transportUrl));
  const orderChanged = JSON.stringify(currentOrder) !== JSON.stringify(mergedOrder);

  return {
    added: added.map(a => ({ transportUrl: a.transportUrl, name: a.manifest?.name })),
    removed: removed.map(a => ({ transportUrl: a.transportUrl, name: a.manifest?.name })),
    kept: kept.map(a => ({ transportUrl: a.transportUrl, name: a.manifest?.name })),
    orderChanged,
  };
}

async function deployToUser(userId, masterAddons, { clean = false } = {}) {
  return withReauth(userId, async (authKey) => {
    const currentAddons = await getAddons(authKey);

    // Backup current state
    addSyncLog(userId, 'backup', 'ok', JSON.stringify(currentAddons));

    const next = clean
      ? [...currentAddons.filter(a => a.flags?.protected), ...masterAddons]
      : mergeAddons(currentAddons, masterAddons);
    await setAddons(authKey, next);

    const diff = computeDiff(currentAddons, next);
    updateUserSyncStatus(userId, 'ok');
    addSyncLog(userId, clean ? 'clean_deploy' : 'deploy', 'ok', JSON.stringify(diff));

    return diff;
  });
}

export async function previewDeploy(userIds = null) {
  const { addons: masterAddons } = getMasterConfig();
  const allUsers = getUsers();
  const targetUsers = userIds
    ? allUsers.filter(u => userIds.includes(u.id))
    : allUsers;

  const results = [];

  for (const user of targetUsers) {
    try {
      const diff = await withReauth(user.id, async (authKey) => {
        const currentAddons = await getAddons(authKey);
        const merged = mergeAddons(currentAddons, masterAddons);
        return computeDiff(currentAddons, merged);
      });

      results.push({
        userId: user.id,
        email: user.email,
        status: 'ok',
        diff,
      });
    } catch (err) {
      results.push({
        userId: user.id,
        email: user.email,
        status: 'error',
        error: err.message,
      });
    }
  }

  return {
    previewedAt: new Date().toISOString(),
    masterAddonCount: masterAddons.length,
    users: results,
  };
}

export async function deployAll(userIds = null, { clean = false } = {}) {
  if (deployInProgress) {
    throw new Error('Deploy already in progress');
  }

  deployInProgress = true;
  const { addons: masterAddons } = getMasterConfig();
  const allUsers = getUsers();
  const targetUsers = userIds
    ? allUsers.filter(u => userIds.includes(u.id))
    : allUsers;

  lastDeployStatus = {
    startedAt: new Date().toISOString(),
    clean,
    total: targetUsers.length,
    completed: 0,
    failed: 0,
    results: [],
  };

  try {
    for (const user of targetUsers) {
      try {
        const diff = await deployToUser(user.id, masterAddons, { clean });
        lastDeployStatus.completed++;
        lastDeployStatus.results.push({
          userId: user.id,
          email: user.email,
          status: 'ok',
          diff,
        });
      } catch (err) {
        lastDeployStatus.failed++;
        updateUserSyncStatus(user.id, 'error');
        addSyncLog(user.id, 'deploy', 'error', err.message);
        lastDeployStatus.results.push({
          userId: user.id,
          email: user.email,
          status: 'error',
          error: err.message,
        });
      }
    }

    lastDeployStatus.finishedAt = new Date().toISOString();
    return lastDeployStatus;
  } finally {
    deployInProgress = false;
  }
}

export function getDeployStatus() {
  return lastDeployStatus;
}

export function isDeployInProgress() {
  return deployInProgress;
}
