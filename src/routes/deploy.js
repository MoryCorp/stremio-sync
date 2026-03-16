import { Router } from 'express';
import { deployAll, previewDeploy, getDeployStatus, isDeployInProgress } from '../deploy.js';
import { getSyncLogs } from '../db.js';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const result = await deployAll();
    res.json(result);
  } catch (err) {
    if (err.message === 'Deploy already in progress') {
      return res.status(409).json({ error: err.message });
    }
    console.error('Deploy error:', err.message);
    res.status(500).json({ error: 'Deploy failed' });
  }
});

router.post('/preview', async (req, res) => {
  if (isDeployInProgress()) {
    return res.status(409).json({ error: 'Deploy in progress, cannot preview' });
  }

  try {
    const preview = await previewDeploy();
    res.json(preview);
  } catch (err) {
    console.error('Preview error:', err.message);
    res.status(500).json({ error: 'Preview failed' });
  }
});

router.get('/status', (req, res) => {
  const status = getDeployStatus();
  if (!status) {
    return res.json({ message: 'No deploy has been run yet' });
  }
  res.json(status);
});

router.get('/logs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const logs = getSyncLogs(limit);
  res.json({ logs });
});

export default router;
