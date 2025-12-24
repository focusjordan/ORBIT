# AWS EC2 Deployment Checklist

## ✅ DEPLOYMENT COMPLETED - Session 28

**Instance ID:** `i-083a415ff9e01864d`  
**Public IP:** `44.192.13.141` (changes on stop/start unless Elastic IP attached)  
**Status:** RUNNING AND TESTED  

---

## 🚀 Quick Start (For Future Sessions)

### Start the Instance
```bash
aws ec2 start-instances --instance-ids i-083a415ff9e01864d
# Wait 1-2 minutes, then get new public IP:
aws ec2 describe-instances --instance-ids i-083a415ff9e01864d --query 'Reservations[0].Instances[0].PublicIpAddress' --output text
```

### SSH In
```bash
ssh -i ~/Desktop/orbit-key.pem ubuntu@<PUBLIC-IP>
```

### Verify ORBIT is Running
```bash
pm2 status
curl http://localhost:4000/health
```

### Stop When Done (Save Money!)
```bash
aws ec2 stop-instances --instance-ids i-083a415ff9e01864d
```

---

## 📋 Original Deployment Steps (Reference)

### 1️⃣ Pre-Deployment (Local)

- [x] Push commits to GitHub

---

### 2️⃣ AWS Console - Launch EC2 Instance

1. **Go to**: AWS Console → EC2 → Launch Instance

2. **Name**: `orbit-production`

3. **AMI**: Deep Learning OSS Nvidia Driver AMI GPU PyTorch 2.9 (Ubuntu 24.04)
   - Comes with CUDA 13.0, Docker, Python 3.12 pre-installed

4. **Instance Type**: `g4dn.xlarge`
   - 4 vCPUs, 16GB RAM, 1 NVIDIA T4 GPU (15GB VRAM)
   - ~$0.53/hour on-demand

5. **Key Pair**: `orbit-key.pem` (saved to ~/Desktop)

6. **Security Group**: `orbit-sg1`
   - SSH (port 22) from your IP
   - Custom TCP (port 4000) from 0.0.0.0/0

7. **Storage**: 50GB gp3

---

### 3️⃣ SSH Into Instance

```bash
chmod 400 ~/Desktop/orbit-key.pem
ssh -i ~/Desktop/orbit-key.pem ubuntu@<PUBLIC-IP>
```

---

## 4️⃣ Manual Deployment Steps (What We Actually Did)

### Install Node.js 20
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Install Chromaprint & FFmpeg
```bash
sudo apt-get update
sudo apt-get install -y libchromaprint-tools ffmpeg
```

### Start Docker & PostgreSQL
```bash
# Docker is pre-installed on Deep Learning AMI
sudo systemctl start docker && sudo systemctl enable docker

# Generate secure password
export DB_PASSWORD=$(openssl rand -hex 16)
echo "Save this: $DB_PASSWORD"

# Start PostgreSQL with pgvector
sudo docker run -d --name orbit-postgres --restart unless-stopped \
  -e POSTGRES_USER=orbit \
  -e POSTGRES_PASSWORD="$DB_PASSWORD" \
  -e POSTGRES_DB=orbit \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

### Clone ORBIT (Private Repo)
```bash
# Use GitHub Personal Access Token
git clone https://<YOUR-TOKEN>@github.com/focusjordan/ORBIT.git
cd ORBIT
npm ci
```

### ⚠️ CRITICAL: Create SilentCipher venv with Python 3.10
```bash
# The Deep Learning AMI has Python 3.12, but SilentCipher needs torch<=2.0.0
# which requires Python 3.10
sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt-get update
sudo apt-get install -y python3.10 python3.10-venv python3.10-dev

# Create separate venv for SilentCipher
python3.10 -m venv .venv-watermark
source .venv-watermark/bin/activate
pip install torch==2.0.0 silentcipher librosa soundfile "numpy<2"
deactivate
```

### Create .env File
```bash
export SECRET_KEY=$(openssl rand -hex 32)
npm run generate:keypair  # Copy the PRIVATE KEY (88 chars)

cat > .env << EOF
NODE_ENV=production
PORT=4000
DATABASE_URL=postgres://orbit:$DB_PASSWORD@localhost:5432/orbit
ORBIT_SECRET_KEY=$SECRET_KEY
ORBIT_WATERMARK_METHOD=neural
ORBIT_PYTHON_PATH=/opt/pytorch/bin/python3
ORBIT_SILENTCIPHER_PYTHON=/home/ubuntu/ORBIT/.venv-watermark/bin/python3
LOG_LEVEL=info
ORBIT_PRIVATE_KEY=<88-char-base64-key-from-generate:keypair>
TEST_PLATFORM_PRIVATE_KEY=<from .test-platform-credentials.json after seeding>
EOF
```

### Run Migrations & Seed
```bash
npm run migrate
npm run seed:platform -- ohnrshyp "Ohnrshyp Music"
```

### Start with PM2
```bash
sudo npm install -g pm2
pm2 start src/index.js --name orbit
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

---

## 5️⃣ Verify Deployment

```bash
# On EC2:
curl http://localhost:4000/health
# Returns: {"status":"ok","service":"orbit","version":"1.0.0","environment":"production"}

# Check GPU:
nvidia-smi

# View logs:
pm2 logs orbit

# Run tests:
npm run test:fresh
```

```bash
# From your local machine:
curl http://44.192.13.141:4000/health
```

---

## 6️⃣ Get Ohnrshyp Credentials

```bash
# On EC2:
cat /home/ubuntu/ORBIT/.ohnrshyp-credentials.json
```

This contains:
- `platform_id`: `ohnrshyp`
- `private_key`: Base64 encoded → Use as `ORBIT_PRIVATE_KEY` in Ohnrshyp
- `api_key`: Use as `ORBIT_API_KEY` in Ohnrshyp

---

## 7️⃣ (Optional) Set Up Domain

Point `api.orbit.ohnrshyp.com` to EC2 IP:
1. Route53 / Your DNS provider
2. A record → EC2 Elastic IP (recommended) or Public IP

For HTTPS, add an Application Load Balancer with ACM certificate.

---

## 📋 Environment Variables for Ohnrshyp

Add these to Ohnrshyp's `.env`:

```env
ORBIT_API_URL=http://YOUR-EC2-IP:4000
ORBIT_PLATFORM_ID=ohnrshyp
ORBIT_PRIVATE_KEY=<from .ohnrshyp-credentials.json>
ORBIT_API_KEY=<from .ohnrshyp-credentials.json>
```

---

## 🔧 Troubleshooting

### PM2 not starting?
```bash
pm2 logs orbit --lines 100
```

### Database connection issues?
```bash
docker logs orbit-postgres
```

### GPU not detected?
```bash
nvidia-smi
# If not working, reboot: sudo reboot
```

### SilentCipher falling back to spread spectrum?
```bash
# Check Python environment
source /home/ubuntu/orbit/.venv/bin/activate
python -c "import torch; print(torch.cuda.is_available())"
```

---

## 💰 Cost Estimate

| Resource | Cost |
|----------|------|
| g4dn.xlarge (on-demand) | ~$0.53/hour = ~$380/month |
| g4dn.xlarge (spot) | ~$0.16/hour = ~$115/month |
| 50GB gp3 storage | ~$4/month |
| Data transfer | Variable |

**Tip**: Use Spot instances with a persistent request for significant savings.

---

## ✅ Deployment Complete When:

- [ ] `curl http://EC2-IP:4000/health` returns `{"status":"ok"}`
- [ ] `.ohnrshyp-credentials.json` exists with keys
- [ ] `pm2 status` shows `orbit` as `online`
- [ ] `nvidia-smi` shows GPU utilization when processing

---

*Next: Integrate with Ohnrshyp (see OHNRSHYP_INTEGRATION_HANDOFF.md)*


