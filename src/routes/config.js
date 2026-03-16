import { Router } from 'express';
import { getMasterConfig, setMasterConfig, getUserById } from '../db.js';
import { login, getAddons, withReauth } from '../stremio-api.js';

const router = Router();

router.get('/', (req, res) => {
  const config = getMasterConfig();
  res.json(config);
});

router.post('/', (req, res) => {
  const { addons } = req.body || {};

  if (!Array.isArray(addons)) {
    return res.status(400).json({ error: 'addons must be an array' });
  }

  for (const addon of addons) {
    if (!addon.transportUrl || !addon.manifest?.id) {
      return res.status(400).json({ error: 'Each addon must have transportUrl and manifest.id' });
    }
  }

  setMasterConfig(addons);
  res.json({ success: true, count: addons.length });
});

router.post('/import', async (req, res) => {
  try {
    const { email, password, authKey: providedAuthKey } = req.body || {};

    let authKey = providedAuthKey;

    if (!authKey) {
      if (!email || !password) {
        return res.status(400).json({ error: 'Provide authKey or email+password' });
      }
      const result = await login(email, password);
      authKey = result.authKey;
    }

    const addons = await getAddons(authKey);

    // Filter out protected addons — master config only contains non-protected
    const nonProtected = addons.filter(a => !a.flags?.protected);

    setMasterConfig(nonProtected);
    res.json({
      success: true,
      imported: nonProtected.length,
      skippedProtected: addons.length - nonProtected.length,
    });
  } catch (err) {
    if (err.message?.includes('Login failed') || err.code) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    console.error('Config import error:', err.message);
    res.status(500).json({ error: 'Import failed' });
  }
});

// Import master config from an enrolled user's account
router.post('/import-from-user', async (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const user = getUserById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  try {
    const addons = await withReauth(userId, async (authKey) => {
      return getAddons(authKey);
    });

    const nonProtected = addons.filter(a => !a.flags?.protected);
    setMasterConfig(nonProtected);

    res.json({
      success: true,
      imported: nonProtected.length,
      skippedProtected: addons.length - nonProtected.length,
    });
  } catch (err) {
    console.error('Config import from user error:', err.message);
    res.status(500).json({ error: 'Import failed' });
  }
});

export default router;
