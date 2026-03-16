import { Router } from 'express';
import { login } from '../stremio-api.js';
import { encrypt } from '../crypto.js';
import { createUser, getUserByEmail } from '../db.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (getUserByEmail(email)) {
      return res.status(409).json({ error: 'Account already enrolled' });
    }

    const result = await login(email, password);

    const { encrypted, iv, tag } = encrypt(password);
    createUser({
      email,
      authKey: result.authKey,
      encryptedPassword: encrypted,
      iv,
      tag,
    });

    res.json({ success: true, email });
  } catch (err) {
    if (err.message?.includes('Login failed') || err.code) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    console.error('Enrollment error:', err.message);
    res.status(500).json({ error: 'Enrollment failed' });
  }
});

export default router;
