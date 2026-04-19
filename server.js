const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const { errorHandler, notFound } = require('./middleware/errorMiddleware');

dotenv.config();
connectDB();

const app = express();

app.use(
  cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const d = Date.now() - start;
    const c =
      res.statusCode >= 500
        ? '\x1b[31m'
        : res.statusCode >= 400
          ? '\x1b[33m'
          : '\x1b[32m';
    console.log(
      `${c}[${res.statusCode}]\x1b[0m ${req.method} ${req.originalUrl} — ${d}ms`,
    );
  });
  next();
});

// ═══════════ Routes ═══════════
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/seasons', require('./routes/seasonRoutes'));
app.use('/api/suppliers', require('./routes/supplierRoutes'));
app.use('/api/items', require('./routes/itemRoutes'));
app.use('/api/purchase', require('./routes/purchaseRoutes'));
app.use('/api/customers', require('./routes/customerRoutes'));
app.use('/api/sales', require('./routes/saleRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/cash-register', require('./routes/cashRegisterRoutes'));
app.use('/api/returns', require('./routes/returnRoutes'));
app.use('/api/transfers', require('./routes/transferRoutes'));
app.use('/api/manufacturing', require('./routes/manufacturingRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/price-list', require('./routes/priceListRoutes'));
app.use('/api/audit', require('./routes/auditRoutes'));
app.get('/', (req, res) => res.json({ status: 'ok', message: 'API شغال ✅' }));

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
  console.log(`\x1b[32m✅ Server running on port ${PORT}\x1b[0m`);
  console.log(`\x1b[34m📡 http://localhost:${PORT}/api\x1b[0m`);
  console.log('\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
});
