/**
 * Dina McReynolds — Luxury Personal Brand Website
 * Backend API Server
 * Node.js + Express + SQLite
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import nodemailer from 'nodemailer';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Database Setup ────────────────────────────────────────────────────────────
const DB_PATH = process.env.DB_PATH || join(__dirname, 'dina.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS inquiries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL,
    phone       TEXT,
    type        TEXT NOT NULL,
    message     TEXT NOT NULL,
    budget      TEXT,
    timeline    TEXT,
    source      TEXT DEFAULT 'website',
    status      TEXT DEFAULT 'new',
    ip          TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS newsletter (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT UNIQUE NOT NULL,
    name       TEXT,
    source     TEXT DEFAULT 'website',
    status     TEXT DEFAULT 'active',
    token      TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ai_conversations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    token      TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ─── Middleware ─────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
});

const inquiryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many inquiry submissions, please try again in an hour.' },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'AI concierge rate limit reached. Please wait a moment.' },
});

app.use(generalLimiter);

// ─── Email Transport ───────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendEmail(to, subject, html) {
  if (!process.env.SMTP_USER) {
    console.log(`[Email skipped — no SMTP configured] To: ${to} | Subject: ${subject}`);
    return;
  }
  await transporter.sendMail({
    from: `"Dina McReynolds" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });
}

// ─── Auth Middleware ───────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'change-me-in-production');
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ── Contact / Inquiry Form ─────────────────────────────────────────────────────
app.post('/api/inquiry',
  inquiryLimiter,
  [
    body('name').trim().isLength({ min: 2, max: 100 }).escape(),
    body('email').isEmail().normalizeEmail(),
    body('message').trim().isLength({ min: 10, max: 2000 }).escape(),
    body('type').optional().trim().isIn([
      'speaking', 'coaching', 'experiences', 'media', 'partnership', 'general'
    ]),
    body('subject').optional().trim().isIn([
      'speaking', 'coaching', 'experiences', 'media', 'partnership', 'general'
    ]),
    body('phone').optional().trim().isLength({ max: 30 }),
    body('budget').optional().trim().isLength({ max: 50 }),
    body('timeline').optional().trim().isLength({ max: 100 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid form data', details: errors.array() });
    }

    if (!req.body.type && !req.body.subject) {
      return res.status(400).json({ error: 'Invalid form data', details: [{ msg: 'type or subject is required' }] });
    }

    const { name, email, phone, message, budget, timeline } = req.body;
    const type = req.body.type || req.body.subject || 'general';
    const ip = req.ip;

    const result = db.prepare(`
      INSERT INTO inquiries (name, email, phone, type, message, budget, timeline, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, email, phone || null, type, message, budget || null, timeline || null, ip);

    // Email to Dina
    await sendEmail(
      process.env.ADMIN_EMAIL || process.env.SMTP_USER,
      `✨ New ${type} inquiry from ${name}`,
      `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
        <div style="background: #0a0a0a; padding: 32px; text-align: center;">
          <h1 style="color: #c9a96e; margin: 0; font-size: 24px; letter-spacing: 4px;">NEW INQUIRY</h1>
          <p style="color: #888; margin: 8px 0 0; letter-spacing: 2px; font-size: 12px; text-transform: uppercase;">${type}</p>
        </div>
        <div style="padding: 32px; background: #fafafa; border: 1px solid #e8e0d0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #888; font-size: 13px; width: 120px;">Name</td><td style="padding: 8px 0; font-weight: bold;">${name}</td></tr>
            <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Email</td><td style="padding: 8px 0;"><a href="mailto:${email}" style="color: #c9a96e;">${email}</a></td></tr>
            ${phone ? `<tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Phone</td><td style="padding: 8px 0;">${phone}</td></tr>` : ''}
            ${budget ? `<tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Budget</td><td style="padding: 8px 0;">${budget}</td></tr>` : ''}
            ${timeline ? `<tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Timeline</td><td style="padding: 8px 0;">${timeline}</td></tr>` : ''}
          </table>
          <div style="margin-top: 24px; padding: 20px; background: white; border-left: 3px solid #c9a96e;">
            <p style="color: #888; font-size: 12px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 2px;">Message</p>
            <p style="margin: 0; line-height: 1.7;">${message}</p>
          </div>
          <div style="margin-top: 24px; text-align: center;">
            <a href="${process.env.ADMIN_URL || 'http://localhost:3001'}/admin" style="background: #c9a96e; color: white; padding: 12px 32px; text-decoration: none; letter-spacing: 2px; font-size: 12px; text-transform: uppercase;">View in Dashboard</a>
          </div>
        </div>
      </div>
      `
    );

    // Confirmation email to sender
    await sendEmail(
      email,
      `Thank you for reaching out, ${name.split(' ')[0]}`,
      `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
        <div style="background: #0a0a0a; padding: 40px; text-align: center;">
          <h1 style="color: #c9a96e; margin: 0; font-size: 20px; letter-spacing: 4px;">DINA MCREYNOLDS</h1>
          <p style="color: #888; margin: 8px 0 0; letter-spacing: 3px; font-size: 11px; text-transform: uppercase;">Luxury Personal Brand</p>
        </div>
        <div style="padding: 40px; background: #fafafa; border: 1px solid #e8e0d0; text-align: center;">
          <p style="font-size: 22px; color: #c9a96e; margin: 0 0 16px;">Thank you, ${name.split(' ')[0]}.</p>
          <p style="line-height: 1.8; color: #555; margin: 0 0 24px;">Your message has been received. I personally review every inquiry and will be in touch within 48 hours.</p>
          <p style="line-height: 1.8; color: #555; font-style: italic;">"Every extraordinary journey begins with a single, intentional step."</p>
          <p style="color: #888; margin: 32px 0 0; font-size: 13px;">— Dina McReynolds</p>
        </div>
        <div style="background: #0a0a0a; padding: 20px; text-align: center;">
          <p style="color: #666; margin: 0; font-size: 11px; letter-spacing: 2px;">THIS IS AN AUTOMATED CONFIRMATION</p>
        </div>
      </div>
      `
    );

    res.status(201).json({
      success: true,
      message: 'Your inquiry has been received. Expect a response within 48 hours.',
      id: result.lastInsertRowid,
    });
  }
);

// ── Newsletter Signup ──────────────────────────────────────────────────────────
app.post('/api/newsletter',
  [
    body('email').isEmail().normalizeEmail(),
    body('name').optional().trim().isLength({ max: 100 }).escape(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid email address' });

    const { email, name } = req.body;
    const token = crypto.randomBytes(32).toString('hex');

    try {
      db.prepare(`
        INSERT INTO newsletter (email, name, token) VALUES (?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET status = 'active', updated_at = CURRENT_TIMESTAMP
      `).run(email, name || null, token);

      await sendEmail(
        email,
        'Welcome to Dina McReynolds Everage ✨',
        `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0a0a0a; padding: 40px; text-align: center;">
            <h1 style="color: #c9a96e; letter-spacing: 4px; font-size: 18px; margin: 0;">WELCOME</h1>
          </div>
          <div style="padding: 40px; background: #fafafa; border: 1px solid #e8e0d0; text-align: center;">
            <p style="font-size: 20px; color: #c9a96e;">${name ? `Welcome, ${name}.` : 'Welcome.'}</p>
            <p style="line-height: 1.8; color: #555;">You're now part of an intimate circle of visionaries, leaders, and souls who believe in living with intention and luxury.</p>
            <p style="line-height: 1.8; color: #555; font-style: italic; margin-top: 24px;">Expect curated insights, exclusive experiences, and personal reflections — delivered only when they matter.</p>
          </div>
        </div>
        `
      );

      res.status(201).json({ success: true, message: 'You\'re now on the list.' });
    } catch (err) {
      if (err.message?.includes('UNIQUE')) {
        return res.json({ success: true, message: 'You\'re already subscribed.' });
      }
      throw err;
    }
  }
);

// Unsubscribe
app.get('/api/newsletter/unsubscribe/:token', (req, res) => {
  const result = db.prepare(
    "UPDATE newsletter SET status = 'unsubscribed' WHERE token = ?"
  ).run(req.params.token);
  if (result.changes === 0) return res.status(404).json({ error: 'Token not found' });
  res.json({ success: true, message: 'You have been unsubscribed.' });
});

// ── AI Concierge ───────────────────────────────────────────────────────────────
app.post('/api/ai-concierge',
  aiLimiter,
  [
    body('message').trim().isLength({ min: 1, max: 1000 }).escape(),
    body('sessionId').trim().isLength({ min: 8, max: 64 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid request' });

    const { message, sessionId } = req.body;

    // Store user message
    db.prepare(
      'INSERT INTO ai_conversations (session_id, role, content) VALUES (?, ?, ?)'
    ).run(sessionId, 'user', message);

    // Get conversation history (last 10 messages)
    const history = db.prepare(`
      SELECT role, content FROM ai_conversations
      WHERE session_id = ? ORDER BY created_at DESC LIMIT 10
    `).all(sessionId).reverse();

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system: `You are Dina's AI Concierge — an elegant, warm, and sophisticated assistant for Dina McReynolds' luxury personal brand website. 

Dina McReynolds is a world-class speaker, luxury experience curator, and personal transformation coach. She works with visionary leaders, executives, and high-net-worth individuals.

Her services include:
- Keynote Speaking & Workshops
- Private Coaching & Mentorship  
- Signature Luxury Experiences (curated travel, retreats)
- Brand Partnerships & Media

Speak in a tone that is: warm, refined, confident, and emotionally intelligent. Never rushed. Think: a trusted advisor at a private members' club. Use elegant language but remain approachable.

Always guide visitors toward booking a discovery call or submitting an inquiry form. If asked about pricing, say packages are bespoke and invite them to connect directly. Keep responses concise — 2-4 sentences maximum.`,
        messages: history,
      }),
    });

    const data = await response.json();
    const reply = data.content?.[0]?.text || 'I\'d be delighted to connect you with Dina\'s team. Please use the inquiry form to share your vision.';

    // Store assistant reply
    db.prepare(
      'INSERT INTO ai_conversations (session_id, role, content) VALUES (?, ?, ?)'
    ).run(sessionId, 'assistant', reply);

    res.json({ reply, sessionId });
  }
);

// ── Admin Authentication ────────────────────────────────────────────────────────
app.post('/api/admin/login',
  [
    body('password').isLength({ min: 8 }),
  ],
  (req, res) => {
    const { password } = req.body;
    const adminPass = process.env.ADMIN_PASSWORD;

    if (!adminPass || password !== adminPass) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { role: 'admin', iat: Date.now() },
      process.env.JWT_SECRET || 'change-me-in-production',
      { expiresIn: '8h' }
    );

    res.json({ token, expiresIn: '8h' });
  }
);

// ── Admin: Inquiries ───────────────────────────────────────────────────────────
app.get('/api/admin/inquiries', requireAdmin, (req, res) => {
  const { status, type, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  let where = 'WHERE 1=1';
  const params = [];

  if (status) { where += ' AND status = ?'; params.push(status); }
  if (type) { where += ' AND type = ?'; params.push(type); }

  const inquiries = db.prepare(
    `SELECT * FROM inquiries ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  const total = db.prepare(`SELECT COUNT(*) as count FROM inquiries ${where}`).get(...params);

  res.json({ inquiries, total: total.count, page: parseInt(page), limit: parseInt(limit) });
});

app.get('/api/admin/inquiries/:id', requireAdmin, (req, res) => {
  const inquiry = db.prepare('SELECT * FROM inquiries WHERE id = ?').get(req.params.id);
  if (!inquiry) return res.status(404).json({ error: 'Not found' });
  res.json(inquiry);
});

app.put('/api/admin/inquiries/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  const valid = ['new', 'contacted', 'in-progress', 'closed', 'archived'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  db.prepare(
    "UPDATE inquiries SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(status, req.params.id);

  res.json({ success: true });
});

// ── Admin: Newsletter ──────────────────────────────────────────────────────────
app.get('/api/admin/newsletter', requireAdmin, (req, res) => {
  const subscribers = db.prepare(
    "SELECT id, email, name, source, status, created_at FROM newsletter WHERE status = 'active' ORDER BY created_at DESC"
  ).all();
  res.json({ subscribers, total: subscribers.length });
});

// ── Admin: Stats Dashboard ─────────────────────────────────────────────────────
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const stats = {
    inquiries: {
      total: db.prepare('SELECT COUNT(*) as c FROM inquiries').get().c,
      new: db.prepare("SELECT COUNT(*) as c FROM inquiries WHERE status = 'new'").get().c,
      thisMonth: db.prepare("SELECT COUNT(*) as c FROM inquiries WHERE created_at >= date('now','start of month')").get().c,
      byType: db.prepare("SELECT type, COUNT(*) as count FROM inquiries GROUP BY type").all(),
    },
    newsletter: {
      total: db.prepare("SELECT COUNT(*) as c FROM newsletter WHERE status = 'active'").get().c,
      thisMonth: db.prepare("SELECT COUNT(*) as c FROM newsletter WHERE created_at >= date('now','start of month')").get().c,
    },
    aiConversations: {
      sessions: db.prepare('SELECT COUNT(DISTINCT session_id) as c FROM ai_conversations').get().c,
      messages: db.prepare('SELECT COUNT(*) as c FROM ai_conversations').get().c,
    },
    recentInquiries: db.prepare(
      'SELECT id, name, email, type, status, created_at FROM inquiries ORDER BY created_at DESC LIMIT 5'
    ).all(),
  };
  res.json(stats);
});

// ─── 404 & Error Handlers ──────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║   DINA MCREYNOLDS — Backend API              ║
  ║   Running on http://localhost:${PORT}          ║
  ╚══════════════════════════════════════════════╝
  `);
});
