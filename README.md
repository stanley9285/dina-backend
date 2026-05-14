# Dina McReynolds — Backend API

Complete backend for the Luxury Personal Brand Website.
Built with: **Node.js · Express · SQLite · Nodemailer · JWT · Claude AI**

---

## What's included

| Feature | Endpoint | Description |
|---|---|---|
| Contact form | `POST /api/inquiry` | Saves inquiry + sends emails to Dina & visitor |
| Newsletter | `POST /api/newsletter` | Subscribes email, sends welcome email |
| AI Concierge | `POST /api/ai-concierge` | Powered by Claude — answers visitor questions |
| Admin login | `POST /api/admin/login` | Returns JWT token |
| Admin dashboard | `GET /api/admin/stats` | Inquiries, subscribers, AI stats |
| Admin inquiries | `GET /api/admin/inquiries` | List + filter all inquiries |
| Health check | `GET /api/health` | Server status |

---

## Quick Start (Local)

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env
# Edit .env with your values

# 3. Start the server
npm run dev
# → Running at http://localhost:3001
```

---

## Deploy to Render (Free tier — Recommended)

Render is the easiest way to deploy this backend for free.

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "Initial backend"
git remote add origin https://github.com/YOUR_USERNAME/dina-backend.git
git push -u origin main
```

### Step 2 — Create Render Web Service

1. Go to **render.com** → New → **Web Service**
2. Connect your GitHub repo
3. Set these settings:
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free

### Step 3 — Add Environment Variables on Render

In your Render service → **Environment** tab, add all variables from `.env.example`:

```
PORT              = 3001
NODE_ENV          = production
FRONTEND_URL      = https://your-figma-make-site.com
SMTP_HOST         = smtp.gmail.com
SMTP_PORT         = 587
SMTP_USER         = dina@gmail.com
SMTP_PASS         = your-gmail-app-password
ADMIN_EMAIL       = dina@yourdomain.com
JWT_SECRET        = (run: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
ADMIN_PASSWORD    = (choose a strong password)
ANTHROPIC_API_KEY = sk-ant-your-key
```

### Step 4 — Add Persistent Disk (for SQLite)

In Render → your service → **Disks** → Add disk:
- **Mount path:** `/data`
- **Size:** 1 GB (free)

Then update `server.js` line 22:
```js
const db = new Database('/data/dina.db');
```

### Step 5 — Connect Frontend

Add `VITE_API_URL` to your Figma Make / frontend environment:
```
VITE_API_URL = https://your-render-service.onrender.com
```

Copy `api.client.ts` into your frontend at `src/services/api.ts`.

---

## Deploy to Railway (Alternative)

```bash
npm install -g @railway/cli
railway login
railway init
railway up
railway variables set JWT_SECRET=... ADMIN_PASSWORD=... ANTHROPIC_API_KEY=...
```

---

## Connect to Your Figma Make Frontend

### InquiryForm.tsx — add this to your submit handler:
```tsx
import { api } from '@/services/api'

const handleSubmit = async (data) => {
  try {
    const result = await api.inquiry.submit({
      name: data.name,
      email: data.email,
      type: data.inquiryType,
      message: data.message,
      phone: data.phone,
      budget: data.budget,
    })
    toast.success(result.message)
  } catch (err) {
    toast.error(err.message)
  }
}
```

### AIConcierge.tsx — replace mock with real API:
```tsx
import { api, getOrCreateSessionId } from '@/services/api'

const handleSend = async (message: string) => {
  const sessionId = getOrCreateSessionId()
  const { reply } = await api.concierge.chat({ message, sessionId })
  // add reply to your chat state
}
```

### Newsletter signup:
```tsx
import { api } from '@/services/api'

await api.newsletter.subscribe({ email, name })
```

---

## Admin Dashboard Access

```
POST https://your-backend.com/api/admin/login
{ "password": "your-admin-password" }

→ Returns: { "token": "eyJ..." }

Use token in headers:
Authorization: Bearer eyJ...
```

---

## API Reference

### POST /api/inquiry
```json
{
  "name": "Alexandra Chen",
  "email": "alex@example.com",
  "type": "speaking",
  "message": "I'd love to have Dina keynote our leadership summit...",
  "phone": "+1 555 0100",
  "budget": "$10,000 - $25,000",
  "timeline": "Q3 2025"
}
```

### POST /api/newsletter
```json
{ "email": "hello@example.com", "name": "Alexandra" }
```

### POST /api/ai-concierge
```json
{
  "message": "What services does Dina offer?",
  "sessionId": "uuid-here"
}
```

---

## Security Features

- **Helmet.js** — HTTP security headers
- **Rate limiting** — 5 inquiries/hour per IP, 20 AI messages/minute
- **Input validation** — All fields sanitized and validated
- **JWT auth** — Admin routes protected
- **CORS** — Only your frontend domain allowed
- **SQL injection** — Prevented via parameterized queries (better-sqlite3)
