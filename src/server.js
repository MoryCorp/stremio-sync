import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Env validation (fail fast) ---
function validateEnv() {
  const required = ['SITE_TOKEN', 'ADMIN_TOKEN', 'ENCRYPTION_KEY'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  if (!/^[a-zA-Z0-9_-]{16,}$/.test(process.env.SITE_TOKEN)) {
    console.error('SITE_TOKEN must be at least 16 alphanumeric/hyphen/underscore characters');
    process.exit(1);
  }

  if (!/^[0-9a-f]{64}$/i.test(process.env.ENCRYPTION_KEY)) {
    console.error('ENCRYPTION_KEY must be exactly 64 hex characters');
    process.exit(1);
  }

  if (process.env.ADMIN_TOKEN.length < 32) {
    console.error('ADMIN_TOKEN must be at least 32 characters');
    process.exit(1);
  }
}

validateEnv();

// --- Imports that depend on env being valid ---
import * as db from './db.js';
import { adminAuth } from './routes/auth.js';
import enrollRoutes from './routes/enroll.js';
import userRoutes from './routes/users.js';
import configRoutes from './routes/config.js';
import deployRoutes from './routes/deploy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT, 10) || 3000;
const SITE_TOKEN = process.env.SITE_TOKEN;

const app = express();

// --- Security headers ---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
    },
  },
}));

app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

app.use(express.json({ limit: '1mb' }));

// --- Health check (outside site token) ---
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// --- App router (behind site token) ---
const appRouter = express.Router();

// Rate limit on enrollment
const enrollLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, try again later' },
});

// Public routes
appRouter.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

appRouter.use('/api/enroll', enrollLimiter, enrollRoutes);

// Admin routes
appRouter.get('/admin', (req, res, next) => {
  if (!req.originalUrl.endsWith('/')) {
    return res.redirect(301, `${req.originalUrl}/`);
  }
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

appRouter.use('/api/users', adminAuth, userRoutes);
appRouter.use('/api/config', adminAuth, configRoutes);
appRouter.use('/api/deploy', adminAuth, deployRoutes);

// Redirect /{SITE_TOKEN} to /{SITE_TOKEN}/ (trailing slash required for relative URLs)
app.get(`/${SITE_TOKEN}`, (req, res, next) => {
  if (req.originalUrl.endsWith('/')) return next();
  res.redirect(301, `${req.originalUrl}/`);
});

// Mount under site token
app.use(`/${SITE_TOKEN}`, appRouter);

// Catch-all: silent 404
app.use((req, res) => {
  res.status(404).end();
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// --- Start server ---
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`App available at /${SITE_TOKEN}/`);
});

// --- Graceful shutdown ---
function shutdown() {
  console.log('Shutting down...');
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
