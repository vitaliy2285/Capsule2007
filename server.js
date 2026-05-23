require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const listCells = require('./api/list-cells');
const createPayment = require('./api/create-payment');
const yookassaWebhook = require('./api/yookassa-webhook');
const adminModerate = require('./api/admin-moderate');

const optional = (path) => {
  try {
    return require(path);
  } catch (error) {
    console.warn(`[Boot] optional route missing: ${path}`);
    return null;
  }
};

const getCell = optional('./api/get-cell');
const checkPayment = optional('./api/check-payment');
const myCell = optional('./api/my-cell');
const cleanupExpired = optional('./api/cleanup-expired');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 'loopback');

app.use(express.json({ limit: '1mb' }));

const allowedOrigins = new Set([
  'https://capsule2007.ru',
  'https://www.capsule2007.ru',
  'http://127.0.0.1',
  'http://localhost'
]);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-token']
}));

const limiterCreate = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false
});

const limiterMyCell = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false
});

const limiterAdmin = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'capsule2007-api',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/list-cells', listCells);
app.post('/api/create-payment', limiterCreate, createPayment);
app.all('/api/yookassa-webhook', yookassaWebhook);
app.all('/api/admin-moderate', limiterAdmin, adminModerate);

if (getCell) app.get('/api/get-cell', getCell);
if (checkPayment) app.get('/api/check-payment', checkPayment);
if (myCell) app.get('/api/my-cell', limiterMyCell, myCell);
if (cleanupExpired) app.post('/api/cleanup-expired', limiterAdmin, cleanupExpired);

app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, error: 'Not Found' });
});

app.use((error, req, res, next) => {
  console.error('[Server] unhandled error', {
    path: req.path,
    method: req.method,
    error: error?.message || String(error)
  });
  res.status(500).json({ ok: false, error: 'Internal server error' });
});

const PORT = Number(process.env.PORT || 3000);

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[Boot] Capsule2007 API listening on http://127.0.0.1:${PORT}`);
});
