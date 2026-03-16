import { Router } from 'express';
import * as db from '../db.js';
import { getAddons, setAddons, withReauth } from '../stremio-api.js';
import { normalizeUrl } from '../deploy.js';
import { deployAll } from '../deploy.js';

const router = Router();

router.get('/', (req, res) => {
  const users = db.getUsers();
  res.json({ users });
});

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });

  const user = db.getUserById(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.deleteUser(id);
  res.json({ success: true });
});

router.post('/:id/test', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });

  const user = db.getUserById(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  try {
    await withReauth(id, async (authKey) => {
      await getAddons(authKey);
    });
    res.json({ success: true, message: 'Connection OK' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// List all addons on a user's Stremio account
router.get('/:id/addons', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });

  const user = db.getUserById(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  try {
    const addons = await withReauth(id, async (authKey) => {
      return getAddons(authKey);
    });
    res.json({
      email: user.email,
      count: addons.length,
      addons: addons.map(a => ({
        name: a.manifest?.name || a.manifest?.id || 'Unknown',
        id: a.manifest?.id,
        transportUrl: a.transportUrl,
        protected: !!a.flags?.protected,
        official: !!a.flags?.official,
      })),
    });
  } catch (err) {
    console.error('Fetch addons error:', err.message);
    res.status(500).json({ error: 'Failed to fetch addons' });
  }
});

// Remove specific addons from a user's Stremio account
router.post('/:id/addons/remove', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });

  const { urls } = req.body || {};
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'urls array is required' });
  }

  const user = db.getUserById(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  try {
    const result = await withReauth(id, async (authKey) => {
      const currentAddons = await getAddons(authKey);
      const removeSet = new Set(urls.map(u => normalizeUrl(u)));

      const filtered = currentAddons.filter(a => {
        if (a.flags?.protected) return true; // Never remove protected
        return !removeSet.has(normalizeUrl(a.transportUrl));
      });

      const removed = currentAddons.length - filtered.length;
      if (removed === 0) return { removed: 0 };

      // Backup then set
      db.addSyncLog(id, 'backup', 'ok', JSON.stringify(currentAddons));
      await setAddons(authKey, filtered);
      db.addSyncLog(id, 'remove_addons', 'ok', `Removed ${removed} addon(s)`);
      return { removed };
    });

    res.json({ success: true, removed: result.removed });
  } catch (err) {
    console.error('Remove addons error:', err.message);
    res.status(500).json({ error: 'Failed to remove addons' });
  }
});

router.post('/:id/sync', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });

  const user = db.getUserById(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  try {
    const result = await deployAll([id]);
    res.json(result);
  } catch (err) {
    if (err.message === 'Deploy already in progress') {
      return res.status(409).json({ error: err.message });
    }
    console.error('Sync error:', err.message);
    res.status(500).json({ error: 'Sync failed' });
  }
});

export default router;
