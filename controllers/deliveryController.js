const db = require('../config/db');

// @GET /api/delivery/partners (admin)
const getPartners = async (req, res) => {
  try {
    const [partners] = await db.query(
      `SELECT dp.*, u.email FROM delivery_partners dp
       JOIN users u ON dp.user_id = u.id ORDER BY dp.created_at DESC`
    );
    res.json({ success: true, partners });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @POST /api/delivery/partners (admin)
const addPartner = async (req, res) => {
  const bcrypt = require('bcryptjs');
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { name, email, contact, vehicle, password } = req.body;

    if (!name || !email || !contact) {
      return res.status(400).json({ success: false, message: 'Name, email and contact required' });
    }

    const hashed = await bcrypt.hash(password || 'partner123', 10);

    const [userResult] = await conn.query(
      'INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashed, contact, 'delivery']
    );

    await conn.query(
      'INSERT INTO delivery_partners (user_id, name, contact, vehicle) VALUES (?, ?, ?, ?)',
      [userResult.insertId, name, contact, vehicle || 'Two Wheeler']
    );

    await conn.commit();
    res.status(201).json({ success: true, message: 'Delivery partner added successfully' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    conn.release();
  }
};

// @GET /api/delivery/profile
const getDeliveryProfile = async (req, res) => {
  try {
    const [partners] = await db.query(
      'SELECT dp.*, u.email FROM delivery_partners dp JOIN users u ON dp.user_id = u.id WHERE dp.user_id = ?',
      [req.user.id]
    );
    if (!partners.length) return res.status(404).json({ success: false, message: 'Profile not found' });
    res.json({ success: true, partner: partners[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getPartners, addPartner, getDeliveryProfile };