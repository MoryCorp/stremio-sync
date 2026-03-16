import crypto from 'node:crypto';

export function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const provided = Buffer.from(auth.slice(7));
  const expected = Buffer.from(process.env.ADMIN_TOKEN);

  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}
