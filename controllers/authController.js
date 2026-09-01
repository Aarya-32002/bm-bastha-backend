const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const db     = require('../config/db');

const JWT_SECRET  = process.env.JWT_SECRET  || 'bmbastha_super_secret_jwt_key_2024';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '365d';

const generateToken = (user) =>
  jwt.sign(
    { id: user.id, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

/* ── POST /api/auth/signup ─────────────────────────────────────────────── */
const signup = async (req, res) => {
  try {
    const { name, password, phone, address, pincode } = req.body;

    // Validation
    if (!name || !phone || !password) {
      return res.status(400).json({ success: false, message: 'Name, phone number and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    if (!pincode || !/^\d{6}$/.test(pincode)) {
      return res.status(400).json({ success: false, message: 'Valid 6-digit pincode is required' });
    }

    // Check pincode is serviceable
    const [serviceRows] = await db.query(
      'SELECT * FROM service_pincodes WHERE pincode = ? AND is_active = TRUE',
      [pincode]
    );
    if (!serviceRows.length) {
      return res.status(400).json({
        success: false,
        message: `Sorry, we do not deliver to pincode ${pincode} yet. Please try a nearby pincode.`
      });
    }

    // Check phone not already registered
    const normalizedPhone = phone ? String(phone).replace(/\D/g, '') : null;
    if (normalizedPhone) {
      const [existing] = await db.query('SELECT id FROM users WHERE phone = ?', [normalizedPhone]);
      if (existing.length > 0) {
        return res.status(409).json({ success: false, message: 'This phone number is already registered. Please login.' });
      }
    }

    // Hash password and create user
    const hashed = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (name, password, phone, address, pincode, role) VALUES (?, ?, ?, ?, ?, ?)',
      [name.trim(), hashed, phone || null, address || null, pincode, 'customer']
    );

    const user  = { id: result.insertId, name: name.trim(), role: 'customer', pincode };
    const token = generateToken(user);

    res.status(201).json({ success: true, message: 'Account created successfully!', token, user });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ success: false, message: 'Server error during signup. Please try again.' });
  }
};

/* ── POST /api/auth/login ──────────────────────────────────────────────── */
const login = async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ success: false, message: 'Phone number and password are required' });
    }

    const normalizedPhone = String(phone).replace(/\D/g, '');
    const [users] = await db.query('SELECT * FROM users WHERE phone = ?', [normalizedPhone]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: 'Invalid phone number or password' });
    }

    const user    = users[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid phone number or password' });
    }

    const token               = generateToken(user);
    const { password: _, ...userWithoutPass } = user;

    res.json({ success: true, message: 'Login successful', token, user: userWithoutPass });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error during login. Please try again.' });
  }
};

/* ── GET /api/auth/profile ─────────────────────────────────────────────── */
const getProfile = async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, name, phone, address, pincode, role, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!users.length) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, user: users[0] });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/* ── PUT /api/auth/profile ─────────────────────────────────────────────── */
const updateProfile = async (req, res) => {
  try {
    const { name, phone, address, pincode } = req.body;

    if (pincode) {
      if (!/^\d{6}$/.test(pincode)) {
        return res.status(400).json({ success: false, message: 'Invalid pincode format' });
      }
      const [serviceRows] = await db.query(
        'SELECT * FROM service_pincodes WHERE pincode = ? AND is_active = TRUE',
        [pincode]
      );
      if (!serviceRows.length) {
        return res.status(400).json({
          success: false,
          message: `We do not deliver to pincode ${pincode} yet.`
        });
      }
    }

    await db.query(
      'UPDATE users SET name = ?, phone = ?, address = ?, pincode = ? WHERE id = ?',
      [name, phone || null, address || null, pincode || null, req.user.id]
    );
    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { signup, login, getProfile, updateProfile };