# Environment Setup Fix

## Problem
Your `.env` file is missing the `DATABASE_URL` variable, causing the seed script to fail.

## Solution

Add the following to your `.env` file:

```env
# Database connection
DATABASE_URL=postgres://orbit:orbit@localhost:5432/orbit_dev

# ORBIT secret key for watermarking
ORBIT_SECRET_KEY=your-secret-key-here-change-in-production

# Optional: Override defaults
# PORT=4000
# NODE_ENV=development
```

## Quick Fix Commands

### Option 1: Append to existing .env
```bash
echo 'DATABASE_URL=postgres://orbit:orbit@localhost:5432/orbit_dev' >> .env
echo 'ORBIT_SECRET_KEY=dev-secret-key-change-in-production' >> .env
```

### Option 2: Create new .env from scratch
```bash
cat > .env << 'EOF'
# ORBIT Environment Configuration
DATABASE_URL=postgres://orbit:orbit@localhost:5432/orbit_dev
ORBIT_SECRET_KEY=dev-secret-key-change-in-production
PORT=4000
NODE_ENV=development
EOF
```

## Complete Setup Flow

1. **Start Database**:
   ```bash
   docker-compose up -d
   ```

2. **Fix .env** (use one of the options above)

3. **Run Migrations**:
   ```bash
   npm run migrate
   ```

4. **Seed Test Platform**:
   ```bash
   npm run seed:platform
   ```
   
   Copy the private key output and export:
   ```bash
   export TEST_PLATFORM_PRIVATE_KEY="<paste-the-base64-key-here>"
   ```

5. **Start Server** (in one terminal):
   ```bash
   npm run dev
   ```

6. **Run Test** (in another terminal):
   ```bash
   npm run test:register
   ```

## Verification

Check that your DATABASE_URL is set correctly:
```bash
node -e "require('dotenv').config(); console.log('DATABASE_URL:', process.env.DATABASE_URL)"
```

Expected output:
```
DATABASE_URL: postgres://orbit:orbit@localhost:5432/orbit_dev
```

## Database Connection String Format

```
postgres://[user]:[password]@[host]:[port]/[database]
```

For ORBIT development:
- User: `orbit`
- Password: `orbit`
- Host: `localhost`
- Port: `5432`
- Database: `orbit_dev`

