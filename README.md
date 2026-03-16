# Stremio Config Manager

Self-hosted tool to manage and deploy Stremio addon configurations across multiple user accounts.

When the admin updates the master addon list, a single deploy pushes the configuration to all enrolled Stremio accounts via the official API.

## Features

- Centralized addon configuration management
- Batch deploy to all users or individual sync
- Dry-run preview showing exactly what will change per user
- Encrypted credential storage (AES-256-GCM)
- URL-based access control (site token)
- Docker-ready with health checks

## Quick Start

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/stremio-config-manager.git
cd stremio-config-manager

# Generate secrets and configure
cp .env.example .env
# Edit .env with your generated tokens:
#   openssl rand -hex 16   → SITE_TOKEN
#   openssl rand -hex 32   → ADMIN_TOKEN
#   openssl rand -hex 32   → ENCRYPTION_KEY

# Run with Docker
docker compose up -d
```

The app will be available at `http://localhost:3000/{SITE_TOKEN}/`.

## Configuration

| Variable | Required | Description |
|---|---|---|
| `SITE_TOKEN` | Yes | URL access token (min 16 alphanumeric chars). All routes are behind `/{SITE_TOKEN}/` |
| `ADMIN_TOKEN` | Yes | Bearer token for admin API routes (min 32 chars) |
| `ENCRYPTION_KEY` | Yes | AES-256 key for password encryption (exactly 64 hex chars) |
| `PORT` | No | Server port (default: 3000) |

## Usage

### Enrollment

Share the enrollment URL with your users: `https://your-domain.com/{SITE_TOKEN}/`

They enter their Stremio email and password. Credentials are verified against the official Stremio API and stored encrypted.

### Admin Dashboard

Access at `https://your-domain.com/{SITE_TOKEN}/admin`

- **Users**: View enrolled users, test connections, sync individually, or remove users
- **Master Config**: View current addon list, import from an existing Stremio account, or remove individual addons
- **Deploy**: Preview changes (dry-run) before deploying, then push to all users

### How Deploy Works

1. For each user, the current addon collection is fetched from Stremio
2. Addons are merged: **protected** (Stremio built-ins) stay untouched, **master** addons are applied, **personal** addons are preserved
3. The merged collection is pushed back to Stremio
4. If a user's auth token has expired, the system re-authenticates automatically

## API

All admin endpoints require `Authorization: Bearer {ADMIN_TOKEN}`.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/enroll` | Enroll a user (public, rate-limited) |
| `GET` | `/api/users` | List enrolled users |
| `DELETE` | `/api/users/:id` | Remove a user |
| `POST` | `/api/users/:id/test` | Test a user's Stremio connection |
| `POST` | `/api/users/:id/sync` | Deploy to a single user |
| `GET` | `/api/config` | Get master addon config |
| `POST` | `/api/config` | Update master addon config |
| `POST` | `/api/config/import` | Import config from a Stremio account |
| `POST` | `/api/deploy` | Deploy to all users |
| `POST` | `/api/deploy/preview` | Preview deploy changes (dry-run) |
| `GET` | `/api/deploy/status` | Get last deploy status |

All paths are relative to `/{SITE_TOKEN}`.

## Local Development

```bash
npm install
cp .env.example .env
# Fill in .env values
node --env-file=.env src/server.js
# Or with auto-reload:
npm run dev
```

## Security

- All routes are behind a URL token — the app returns a blank 404 for unknown paths
- User passwords are encrypted at rest with AES-256-GCM
- Admin authentication uses timing-safe comparison
- Rate limiting on the enrollment endpoint
- Non-root Docker container
- No sensitive data in API responses or logs

## License

MIT
