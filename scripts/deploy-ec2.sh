#!/bin/bash

# ORBIT EC2 Deployment Script
# Run this on a fresh g4dn.xlarge with Deep Learning AMI (Ubuntu)
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/YOUR-USERNAME/orbit/main/scripts/deploy-ec2.sh | bash
#   OR
#   wget -qO- https://raw.githubusercontent.com/YOUR-USERNAME/orbit/main/scripts/deploy-ec2.sh | bash
#   OR
#   scp this file to EC2 and run: chmod +x deploy-ec2.sh && ./deploy-ec2.sh

set -e

echo ""
echo "🛰️  ORBIT Production Deployment"
echo "════════════════════════════════════════════════════════════"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration - EDIT THESE
REPO_URL="${ORBIT_REPO_URL:-https://github.com/YOUR-USERNAME/orbit.git}"
DB_PASSWORD="${ORBIT_DB_PASSWORD:-$(openssl rand -base64 32)}"
SECRET_KEY="${ORBIT_SECRET_KEY:-$(openssl rand -hex 32)}"
INSTALL_DIR="/home/ubuntu/orbit"

echo -e "${YELLOW}Step 1: System Updates${NC}"
echo "───────────────────────────────────────────────────────────"
sudo apt-get update
sudo apt-get install -y curl git

echo ""
echo -e "${YELLOW}Step 2: Install Node.js 20${NC}"
echo "───────────────────────────────────────────────────────────"
if ! command -v node &> /dev/null || [[ $(node -v) != v20* ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
node -v
npm -v

echo ""
echo -e "${YELLOW}Step 3: Install Chromaprint & FFmpeg${NC}"
echo "───────────────────────────────────────────────────────────"
sudo apt-get install -y libchromaprint-tools ffmpeg
fpcalc -version

echo ""
echo -e "${YELLOW}Step 4: Install Docker${NC}"
echo "───────────────────────────────────────────────────────────"
if ! command -v docker &> /dev/null; then
    sudo apt-get install -y docker.io
    sudo systemctl start docker
    sudo systemctl enable docker
    sudo usermod -aG docker ubuntu
fi
docker --version

echo ""
echo -e "${YELLOW}Step 5: Start PostgreSQL with pgvector${NC}"
echo "───────────────────────────────────────────────────────────"
if ! docker ps | grep -q orbit-postgres; then
    docker run -d \
        --name orbit-postgres \
        --restart unless-stopped \
        -e POSTGRES_USER=orbit \
        -e POSTGRES_PASSWORD="${DB_PASSWORD}" \
        -e POSTGRES_DB=orbit \
        -p 5432:5432 \
        pgvector/pgvector:pg16
    echo "Waiting for PostgreSQL to start..."
    sleep 10
fi
echo "PostgreSQL running"

echo ""
echo -e "${YELLOW}Step 6: Clone ORBIT Repository${NC}"
echo "───────────────────────────────────────────────────────────"
if [ -d "$INSTALL_DIR" ]; then
    echo "ORBIT directory exists, pulling latest..."
    cd "$INSTALL_DIR"
    git pull
else
    echo "Cloning ORBIT..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

echo ""
echo -e "${YELLOW}Step 7: Install Node Dependencies${NC}"
echo "───────────────────────────────────────────────────────────"
cd "$INSTALL_DIR"
npm ci

echo ""
echo -e "${YELLOW}Step 8: Setup Python Virtual Environment${NC}"
echo "───────────────────────────────────────────────────────────"
if [ ! -d "$INSTALL_DIR/.venv" ]; then
    sudo apt-get install -y python3-venv python3-pip
    python3 -m venv "$INSTALL_DIR/.venv"
fi
source "$INSTALL_DIR/.venv/bin/activate"

# Check if CUDA is available (Deep Learning AMI should have it)
if command -v nvidia-smi &> /dev/null; then
    echo "NVIDIA GPU detected:"
    nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
    echo "Installing PyTorch with CUDA support..."
    pip install torch transformers librosa numpy soundfile silentcipher
else
    echo "No GPU detected, installing CPU-only PyTorch..."
    pip install torch --index-url https://download.pytorch.org/whl/cpu
    pip install transformers librosa numpy soundfile
    echo -e "${RED}WARNING: SilentCipher requires GPU. Falling back to spread spectrum.${NC}"
fi

deactivate

echo ""
echo -e "${YELLOW}Step 9: Configure Environment${NC}"
echo "───────────────────────────────────────────────────────────"
cat > "$INSTALL_DIR/.env" << EOF
# ORBIT Production Configuration
# Generated: $(date)

# Server
NODE_ENV=production
PORT=4000

# Database
DATABASE_URL=postgres://orbit:${DB_PASSWORD}@localhost:5432/orbit

# Security
ORBIT_SECRET_KEY=${SECRET_KEY}

# Watermarking (neural requires GPU)
ORBIT_WATERMARK_METHOD=auto

# Python venv path
PYTHON_VENV_PATH=${INSTALL_DIR}/.venv

# Logging
LOG_LEVEL=info
EOF

echo ".env file created"

echo ""
echo -e "${YELLOW}Step 10: Run Database Migrations${NC}"
echo "───────────────────────────────────────────────────────────"
cd "$INSTALL_DIR"
npm run migrate

echo ""
echo -e "${YELLOW}Step 11: Seed Ohnrshyp Platform${NC}"
echo "───────────────────────────────────────────────────────────"
npm run seed:platform -- ohnrshyp "Ohnrshyp Music"

# Also create a test platform for debugging
npm run seed:platform -- test-platform "Test Platform" || true

echo ""
echo -e "${YELLOW}Step 12: Install & Configure PM2${NC}"
echo "───────────────────────────────────────────────────────────"
sudo npm install -g pm2
pm2 delete orbit 2>/dev/null || true
pm2 start "$INSTALL_DIR/src/index.js" --name orbit --env production
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}🎉 ORBIT Deployment Complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo "📊 Status:"
pm2 status

echo ""
echo "🔗 Test the deployment:"
echo "   curl http://localhost:4000/health"
echo ""
echo "📁 Credentials saved to:"
echo "   $INSTALL_DIR/.ohnrshyp-credentials.json"
echo "   $INSTALL_DIR/.test-platform-credentials.json"
echo ""
echo "🔑 Database password: ${DB_PASSWORD}"
echo ""
echo "📝 Next steps:"
echo "   1. Open port 4000 in EC2 Security Group"
echo "   2. Test: curl http://YOUR-EC2-PUBLIC-IP:4000/health"
echo "   3. Set up domain: api.orbit.ohnrshyp.com → EC2 IP"
echo "   4. Copy credentials to Ohnrshyp .env"
echo ""
echo "📋 View logs:"
echo "   pm2 logs orbit"
echo ""

