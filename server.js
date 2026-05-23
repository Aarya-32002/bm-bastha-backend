const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// CORS Configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman)
    if (!origin) return callback(null, true);

    // Allow localhost
    if (origin.startsWith('http://localhost')) {
      return callback(null, true);
    }

    // Allow local network IPs
    if (origin.match(/^http:\/\/(192\.168\.|10\.)/)) {
      return callback(null, true);
    }

    // Allow all during development
    return callback(null, true);
  },
  credentials: true
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =============================
// Routes
// =============================

app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/delivery', require('./routes/delivery'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/pincodes', require('./routes/pincodes'));
app.use('/api/returns', require('./routes/returns'));

// NEW FEATURES
app.use('/api/addresses', require('./routes/addresses'));
app.use('/api/categories', require('./routes/categories'));

// =============================
// Admin Routes
// =============================

// Admin: Users List
app.get(
  '/api/admin/users',
  require('./middleware/auth').authenticate,
  require('./middleware/auth').authorize('admin'),
  async (req, res) => {
    try {
      const db = require('./config/db');

      const [users] = await db.query(`
        SELECT 
          id,
          name,
          email,
          phone,
          address,
          pincode,
          role,
          created_at
        FROM users
        ORDER BY created_at DESC
      `);

      res.json({
        success: true,
        users
      });

    } catch (err) {
      console.error(err);

      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }
);

// =============================
// Reviews
// =============================

// Get All Reviews
app.get(
  '/api/admin/reviews',
  require('./middleware/auth').authenticate,
  require('./middleware/auth').authorize('admin'),
  async (req, res) => {
    try {
      const db = require('./config/db');

      const [reviews] = await db.query(`
        SELECT 
          r.*,
          u.name AS user_name,
          p.name AS product_name
        FROM reviews r
        JOIN users u ON r.user_id = u.id
        JOIN products p ON r.product_id = p.id
        ORDER BY r.created_at DESC
      `);

      res.json({
        success: true,
        reviews
      });

    } catch (err) {
      console.error(err);

      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }
);

// Submit Review
app.post(
  '/api/reviews',
  require('./middleware/auth').authenticate,
  require('./middleware/auth').authorize('customer'),
  async (req, res) => {
    try {
      const db = require('./config/db');

      const {
        product_id,
        order_id,
        rating,
        comment
      } = req.body;

      await db.query(
        `
        INSERT INTO reviews (
          user_id,
          product_id,
          order_id,
          rating,
          comment
        )
        VALUES (?, ?, ?, ?, ?)
        `,
        [
          req.user.id,
          product_id,
          order_id,
          rating,
          comment
        ]
      );

      res.json({
        success: true,
        message: 'Review submitted successfully'
      });

    } catch (err) {
      console.error(err);

      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }
);

// =============================
// Health Check
// =============================

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'BM Bastha API running',
    version: '1.0.0'
  });
});

// =============================
// 404 Handler
// =============================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// =============================
// Global Error Handler
// =============================

app.use((err, req, res, next) => {
  console.error(err.stack);

  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// =============================
// Server
// =============================

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log('===================================');
  console.log(`BM Bastha API running on PORT ${PORT}`);
  console.log('===================================');
  console.log(`Local   : http://localhost:${PORT}`);
  console.log(`Network : http://192.168.1.3:${PORT}`);
  console.log('===================================');
});