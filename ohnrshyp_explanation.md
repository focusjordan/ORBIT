# Ohnrshyp - Modern Music Platform for Independent Artists

A full-stack music platform built for independent artists to upload, sell, and distribute their music directly to fans. Built with the MERN stack and modern cloud infrastructure, Ohnrshyp combines the power of streaming with direct artist-to-listener payments.

## 🎵 Platform Overview

Ohnrshyp is a production-ready music platform that eliminates intermediaries between artists and their audience. Artists keep the majority of their revenue, fans get direct access to high-quality music, and everyone benefits from a modern, intuitive interface.

## ✨ Key Features

### **For Artists**
- 🎤 **Direct Revenue** - Artists receive payments instantly via Stripe Connect
- 📀 **Album & Single Management** - Organize releases into albums or standalone singles
- 📊 **Analytics Dashboard** - Track streams, purchases, and revenue in real-time
- 🎨 **Artist Profiles** - Showcase your brand with customizable profiles
- 🔒 **Secure Uploads** - Comprehensive file validation and S3 cloud storage

### **For Listeners**
- 🎧 **High-Quality Streaming** - Seamless playback with persistent player state
- 🛒 **Smart Cart System** - Buy multiple tracks and save on processing fees
- 📱 **Progressive Web App** - Install on mobile for app-like experience
- 🌙 **Beautiful Design** - Modern UI with dark mode and mesh gradients
- 💳 **Secure Checkout** - Stripe-powered payments with inline checkout
- 📚 **Playlists** - Create and manage custom playlists
- 🔍 **Discovery** - Explore new music through intelligent recommendations

### **Platform Features**
- 🔐 **JWT Authentication** - Secure role-based access control
- 💰 **Stripe Integration** - Full payment processing with webhooks
- ☁️ **AWS Infrastructure** - S3 storage, App Runner deployment, CloudWatch logging
- 📱 **Responsive Design** - Optimized for mobile, tablet, and desktop
- 🎨 **Modern UI/UX** - Framer Motion animations, Tailwind CSS styling
- 🚦 **Rate Limiting** - Protection against abuse and DDoS
- 📊 **Reporting System** - Content moderation and user reporting
- 🔒 **Beta Access** - Controlled rollout with access gates

## 🛠️ Tech Stack

### **Backend**
- **Runtime:** Node.js, Express.js
- **Database:** MongoDB Atlas (Mongoose ODM)
- **Authentication:** JWT, Bcrypt
- **Payments:** Stripe API (Standard Connect)
- **Storage:** AWS S3
- **Deployment:** AWS App Runner (Docker)
- **Monitoring:** AWS CloudWatch
- **Security:** Helmet, CORS, Rate Limiting, Input Sanitization

### **Frontend**
- **Framework:** React 18, React Router v6
- **State Management:** Context API
- **UI Library:** Flowbite React, Tailwind CSS
- **Animations:** Framer Motion
- **Icons:** React Icons (Heroicons)
- **HTTP Client:** Axios
- **Audio:** HTML5 Audio API with custom controls
- **PWA:** Service Workers, Web App Manifest

### **DevOps**
- **Version Control:** Git, GitHub
- **CI/CD:** AWS App Runner auto-deploy
- **Container:** Docker
- **Environment:** dotenv for configuration

## 📁 Project Structure

```
ohnrshyp/
├── frontend/                   # React application
│   ├── public/                # Static assets, PWA manifest
│   ├── src/
│   │   ├── components/        # React components
│   │   │   ├── auth/         # Login, Register, Profile
│   │   │   ├── cart/         # Shopping cart, inline checkout
│   │   │   ├── common/       # Reusable UI components
│   │   │   ├── layout/       # Navbar, Footer, Layout
│   │   │   ├── music/        # Track cards, player, playlists
│   │   │   └── payments/     # Stripe payment forms
│   │   ├── context/          # React Context providers
│   │   ├── pages/            # Route components
│   │   └── utils/            # API client, helpers
│   └── package.json
├── config/                    # Backend configuration
│   ├── db.config.js          # MongoDB connection
│   └── stripe.config.js      # Stripe initialization
├── middleware/                # Express middleware
│   ├── auth.middleware.js    # JWT authentication
│   ├── error.middleware.js   # Global error handler
│   └── upload.middleware.js  # File upload validation
├── models/                    # Mongoose schemas
│   ├── user.model.js         # User accounts
│   ├── track.model.js        # Music tracks
│   ├── album.model.js        # Album collections
│   ├── playlist.model.js     # User playlists
│   └── transaction.model.js  # Payment records
├── routes/                    # API endpoints
│   ├── auth.routes.js        # Authentication
│   ├── music.routes.js       # Track CRUD
│   ├── stripe.routes.js      # Payment processing
│   ├── purchase.routes.js    # Purchase management
│   └── user.routes.js        # User profiles
├── utils/                     # Helper utilities
│   └── s3.js                 # AWS S3 operations
├── .env                       # Environment variables (not committed)
├── .gitignore
├── Dockerfile                 # Container definition
├── package.json               # Backend dependencies
└── server.js                  # Express app entry point
```

## 🚀 Local Development Setup

### Prerequisites
- **Node.js** v16+ ([Download](https://nodejs.org/))
- **MongoDB Atlas** account ([Sign up](https://www.mongodb.com/cloud/atlas))
- **Stripe** account ([Sign up](https://stripe.com))
- **AWS** account with S3 access ([Sign up](https://aws.amazon.com))

### 1. Clone & Install

```bash
# Clone the repository
git clone https://github.com/yourusername/ohnrshyp.git
cd ohnrshyp

# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### 2. Environment Configuration

Create `.env` in the **root directory**:

```env
# Server
PORT=5001
NODE_ENV=development

# Database
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/ohnrshyp

# Authentication
JWT_SECRET=your_super_secure_random_string_here
JWT_EXPIRES_IN=7d

# Stripe
STRIPE_SECRET_KEY=sk_test_your_test_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_test_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# AWS S3
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=ohnrshyp-music-files

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000
```

Create `.env` in the **frontend directory**:

```env
# Backend API URL
REACT_APP_API_URL=http://localhost:5001/api

# Stripe Publishable Key (for frontend)
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_your_test_key
```

### 3. AWS S3 Setup

1. Create an S3 bucket for file storage
2. Configure bucket CORS policy (see `AWS_APP_RUNNER_DEPLOYMENT.md`)
3. Add IAM user with S3 permissions
4. Update `.env` with credentials

### 4. Stripe Webhook Setup (for local development)

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:5001/api/stripe/webhook

# Copy the webhook secret to your .env file
```

### 5. Run the Application

```bash
# Terminal 1: Start backend server
npm run dev

# Terminal 2: Start frontend dev server
cd frontend
npm start
```

**Access the application:**
- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend API: [http://localhost:5001](http://localhost:5001)
- API Docs: [http://localhost:5001/api](http://localhost:5001/api)

## 📡 API Endpoints

### Authentication (`/api/auth`)
- `POST /register` - Create new account (Artist or Listener)
- `POST /login` - Authenticate user
- `GET /me` - Get current user profile
- `PUT /me` - Update user profile
- `DELETE /me` - Delete account

### Music (`/api/music`)
- `GET /` - Get all tracks (with filters)
- `POST /` - Upload track (Artists only)
- `GET /:id` - Get single track details
- `PUT /:id` - Update track (Artist only)
- `DELETE /:id` - Delete track (Artist only)
- `GET /artist/:artistId` - Get artist's tracks
- `GET /stream/:id` - Stream audio file

### Albums (`/api/albums`)
- `GET /` - Get all albums
- `POST /` - Create album (Artists only)
- `GET /:id` - Get album with tracks
- `PUT /:id` - Update album
- `DELETE /:id` - Delete album

### Playlists (`/api/playlists`)
- `GET /` - Get user's playlists
- `POST /` - Create playlist
- `GET /:id` - Get playlist with tracks
- `PUT /:id` - Update playlist
- `DELETE /:id` - Delete playlist
- `POST /:id/tracks` - Add track to playlist
- `DELETE /:id/tracks/:trackId` - Remove track

### Payments (`/api/stripe`)
- `GET /config` - Get Stripe publishable key
- `POST /create-payment-intent` - Create single track payment
- `POST /create-cart-payment-intent` - Create cart payment
- `POST /webhook` - Handle Stripe events

### Purchases (`/api/purchases`)
- `GET /` - Get user's purchased tracks
- `GET /check/:trackId` - Check if track is purchased
- `GET /download/:trackId` - Get secure download URL

### Cart (`/api/cart`)
- `GET /` - Get cart items
- `POST /` - Add track to cart
- `DELETE /:trackId` - Remove from cart
- `DELETE /` - Clear cart

### User Profiles (`/api/users`)
- `GET /:id` - Get public profile
- `GET /:id/tracks` - Get user's tracks
- `POST /:id/follow` - Follow user
- `DELETE /:id/follow` - Unfollow user

## 🎨 Design System

Ohnrshyp uses a cohesive design system built with Tailwind CSS:

- **Primary Color:** Purple (`primary-500` through `primary-900`)
- **Neutral Palette:** Gray scale with dark mode support
- **Typography:** Inter font family
- **Spacing:** Consistent 8px grid system
- **Animations:** Framer Motion for smooth transitions
- **Components:** Flowbite React for consistent UI elements

## 🔒 Security Features

- **Input Validation** - Comprehensive sanitization of all user inputs
- **File Validation** - Audio format verification, size limits, malware scanning
- **Rate Limiting** - Protection against brute force and DDoS
- **CORS Policy** - Configured for secure cross-origin requests
- **Helmet.js** - Security headers (CSP, XSS protection)
- **JWT Tokens** - Secure authentication with expiration
- **Bcrypt** - Password hashing with salt rounds
- **SQL Injection Prevention** - Mongoose parameterized queries
- **HTTPS Only** - Enforced in production

## 🚀 Deployment

Ohnrshyp is deployed on AWS App Runner with automatic CI/CD from GitHub.

See `DEPLOYMENT.md` and `AWS_APP_RUNNER_DEPLOYMENT.md` for full deployment instructions.

### Quick Deploy Checklist
- [ ] Configure production environment variables in AWS
- [ ] Set up MongoDB Atlas production cluster
- [ ] Configure Stripe webhooks for production domain
- [ ] Create production S3 bucket with CORS policy
- [ ] Set up CloudWatch logging
- [ ] Configure custom domain (if applicable)
- [ ] Test payment flow end-to-end
- [ ] Enable PWA features
- [ ] Set up monitoring and alerts

## 📊 Monitoring & Analytics

- **CloudWatch Logs** - Structured JSON logging
- **Stripe Dashboard** - Payment analytics
- **MongoDB Atlas** - Database metrics
- **Custom Metrics** - In-app payment success rates

## 🤝 Contributing

This is currently a private project. If you'd like to contribute or have feature requests, please contact the maintainers.

## 📄 License

All rights reserved. This is proprietary software.

## 🎯 Roadmap

### Phase 1 (Current)
- ✅ Core platform functionality
- ✅ Payment processing
- ✅ Cloud infrastructure
- ✅ Mobile-responsive design
- ✅ Inline cart checkout

### Phase 2 (Planned)
- [ ] Social features (comments, likes)
- [ ] Advanced analytics for artists
- [ ] Automatic royalty splits for collaborations
- [ ] Enhanced recommendation algorithm
- [ ] Mobile native apps (iOS/Android)
- [ ] Artist verification system
- [ ] Subscription tiers

## 📞 Support

For technical issues or questions:
- Check `PRODUCTION_CHECKLIST.md` for common issues
- Review CloudWatch logs for error details
- Contact: support@ohnrshyp.com

---

**Built with ❤️ for independent artists**
