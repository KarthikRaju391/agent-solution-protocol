#!/usr/bin/env bash
set -euo pipefail

# ================================================
# ASP Registry - Sprite Bootstrap Script
# ================================================
# Run this inside a Sprite to set up the full stack:
#   PostgreSQL + pgvector, Node.js, ASP server
#
# Usage:
#   sprite create asp-registry
#   sprite console -s asp-registry
#   curl -fsSL https://raw.githubusercontent.com/KarthikRaju391/agent-solution-protocol/main/scripts/sprite-setup.sh | bash
#
# Or copy this script in and run it:
#   chmod +x sprite-setup.sh && ./sprite-setup.sh
# ================================================

APP_DIR="/opt/asp"
REPO_URL="https://github.com/KarthikRaju391/agent-solution-protocol.git"
DB_NAME="asp_registry"
DB_USER="asp_user"
DB_PASS="asp_password"

echo ""
echo "================================================"
echo "  ASP Registry - Sprite Setup"
echo "================================================"
echo ""

# --- 1. System packages ---
echo "[1/7] Installing system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl build-essential ca-certificates gnupg

# --- 2. PostgreSQL + pgvector ---
echo "[2/7] Installing PostgreSQL..."

# Clean up any broken apt repo from previous runs
rm -f /etc/apt/sources.list.d/pgdg.list /usr/share/keyrings/postgresql-keyring.gpg

# Install from system packages (avoids PGDG repo/codename issues)
apt-get update -qq
apt-get install -y -qq postgresql postgresql-common

# Detect installed PostgreSQL version
PG_VERSION=$(pg_lsclusters -h 2>/dev/null | awk '{print $1}' | head -1)
if [ -z "$PG_VERSION" ]; then
  echo "       ERROR: PostgreSQL installation failed" >&2
  exit 1
fi

# Install pgvector for the detected version
apt-get install -y -qq "postgresql-${PG_VERSION}-pgvector" 2>/dev/null || {
  echo "       pgvector package not available, building from source..."
  apt-get install -y -qq "postgresql-server-dev-${PG_VERSION}"
  git clone --branch v0.8.0 --depth 1 https://github.com/pgvector/pgvector.git /tmp/pgvector
  make -C /tmp/pgvector && make -C /tmp/pgvector install
  rm -rf /tmp/pgvector
}

# Start PostgreSQL
pg_ctlcluster "$PG_VERSION" main start 2>/dev/null || true

echo "       PostgreSQL ${PG_VERSION} + pgvector installed"

# --- 3. Create database ---
echo "[3/7] Setting up database..."
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;

SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec

GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
SQL

sudo -u postgres psql -d "${DB_NAME}" -v ON_ERROR_STOP=1 <<SQL
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
SQL

echo "       Database '${DB_NAME}' ready"

# --- 4. Node.js + pnpm ---
echo "[4/7] Installing Node.js 20 + pnpm..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
corepack enable
corepack prepare pnpm@9.15.0 --activate
echo "       Node $(node -v) + pnpm $(pnpm -v)"

# --- 5. Clone & build ---
echo "[5/7] Cloning and building ASP..."
if [ -d "${APP_DIR}/.git" ]; then
  cd "${APP_DIR}"
  git pull
else
  git clone "${REPO_URL}" "${APP_DIR}"
  cd "${APP_DIR}"
fi

pnpm install --frozen-lockfile
pnpm build
echo "       Build complete"

# --- 6. Environment ---
echo "[6/7] Configuring environment..."
if [ ! -f "${APP_DIR}/.env" ]; then
  cat > "${APP_DIR}/.env" <<EOF
PORT=8080
DATABASE_URL=postgres://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}
NODE_ENV=production
# Uncomment and set your Neon connection string as fallback:
# FALLBACK_DATABASE_URL=postgres://user:pass@ep-xxx.us-east-2.aws.neon.tech/asp_registry?sslmode=require
EOF
  echo "       Created ${APP_DIR}/.env"
else
  echo "       ${APP_DIR}/.env already exists, skipping"
fi

# --- 7. Systemd services ---
echo "[7/7] Registering services..."

cat > /etc/systemd/system/asp-server.service <<EOF
[Unit]
Description=ASP Registry Server
After=postgresql.service network.target
Requires=postgresql.service

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/node apps/server/dist/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable postgresql asp-server
systemctl restart asp-server

# Wait for server to be ready
echo ""
echo "       Waiting for server to start..."
for i in $(seq 1 15); do
  if curl -sf http://localhost:8080/health >/dev/null 2>&1; then
    echo "       Server is up!"
    break
  fi
  sleep 1
done

echo ""
echo "================================================"
echo "  Setup complete!"
echo "================================================"
echo ""
echo "  Server:    http://localhost:8080"
echo "  Health:    http://localhost:8080/health"
echo "  Database:  postgresql://localhost:5432/${DB_NAME}"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Expose publicly:"
echo "     sprite url -s asp-registry update --auth public"
echo ""
echo "  2. Set Neon fallback (optional):"
echo "     nano ${APP_DIR}/.env"
echo "     # Uncomment and fill in FALLBACK_DATABASE_URL"
echo "     systemctl restart asp-server"
echo ""
echo "  3. Check logs:"
echo "     journalctl -u asp-server -f"
echo ""
echo "  4. Test the API:"
echo "     curl http://localhost:8080/"
echo "     curl http://localhost:8080/health"
echo ""
