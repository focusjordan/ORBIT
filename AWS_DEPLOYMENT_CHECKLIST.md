# AWS EC2 Deployment Checklist

## Quick Reference for Session 28

---

## 1️⃣ Pre-Deployment (Local)

- [ ] Push commits to GitHub:
  ```bash
  cd /Users/jordankugler/Cursor/ORBIT
  git push origin main
  ```

---

## 2️⃣ AWS Console - Launch EC2 Instance

1. **Go to**: AWS Console → EC2 → Launch Instance

2. **Name**: `orbit-production`

3. **AMI**: Search for "Deep Learning AMI GPU PyTorch" (Ubuntu)
   - This comes with CUDA pre-installed

4. **Instance Type**: `g4dn.xlarge`
   - 4 vCPUs, 16GB RAM, 1 NVIDIA T4 GPU
   - ~$0.53/hour on-demand (or ~$0.16/hour with Spot)

5. **Key Pair**: Create or select existing `.pem` key

6. **Network Settings**:
   - Allow SSH (port 22) from your IP
   - **Add Custom TCP Rule**: Port 4000 from 0.0.0.0/0 (ORBIT API)

7. **Storage**: 50GB gp3

8. **Launch Instance**

---

## 3️⃣ SSH Into Instance

```bash
# Wait ~2 minutes for instance to initialize
ssh -i ~/path/to/your-key.pem ubuntu@YOUR-EC2-PUBLIC-IP
```

---

## 4️⃣ Run Deployment Script

**Option A: Clone and run**
```bash
# Clone the repo (use your GitHub URL)
git clone https://github.com/YOUR-USERNAME/orbit.git
cd orbit
chmod +x scripts/deploy-ec2.sh
./scripts/deploy-ec2.sh
```

**Option B: If repo is private, use deploy token**
```bash
# Generate a Personal Access Token in GitHub Settings
git clone https://<YOUR-TOKEN>@github.com/YOUR-USERNAME/orbit.git
cd orbit
chmod +x scripts/deploy-ec2.sh
./scripts/deploy-ec2.sh
```

---

## 5️⃣ Verify Deployment

```bash
# On EC2:
curl http://localhost:4000/health
# Should return: {"status":"ok","version":"1.0.0"}

# Check if GPU is being used:
nvidia-smi

# View logs:
pm2 logs orbit
```

```bash
# From your local machine:
curl http://YOUR-EC2-PUBLIC-IP:4000/health
```

---

## 6️⃣ Get Ohnrshyp Credentials

```bash
# On EC2:
cat /home/ubuntu/orbit/.ohnrshyp-credentials.json
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
