const db = require('../config/db');

// GET /api/addresses — list all addresses for logged-in user
const getAddresses = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
      [req.user.id]
    );
    res.json({ success: true, addresses: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST /api/addresses — add new address
const addAddress = async (req, res) => {
  try {
    const { label, house_no, area, city, landmark, pincode, is_default } = req.body;
    if (!house_no || !city || !pincode) {
      return res.status(400).json({ success: false, message: 'House no, city and pincode are required' });
    }
    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({ success: false, message: 'Invalid pincode' });
    }
    // Validate pincode is serviceable
    const [pins] = await db.query(
      'SELECT * FROM service_pincodes WHERE pincode = ? AND is_active = TRUE', [pincode]
    );
    if (!pins.length) {
      return res.status(400).json({ success: false, message: `Pincode ${pincode} is not serviceable yet` });
    }
    // If setting as default, clear other defaults first
    if (is_default) {
      await db.query('UPDATE user_addresses SET is_default = FALSE WHERE user_id = ?', [req.user.id]);
    }
    const [result] = await db.query(
      'INSERT INTO user_addresses (user_id, label, house_no, area, city, landmark, pincode, is_default) VALUES (?,?,?,?,?,?,?,?)',
      [req.user.id, label || 'Home', house_no, area || null, city, landmark || null, pincode, is_default ? 1 : 0]
    );
    res.status(201).json({ success: true, message: 'Address added', id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PUT /api/addresses/:id — update address
const updateAddress = async (req, res) => {
  try {
    const { label, house_no, area, city, landmark, pincode, is_default } = req.body;
    const [existing] = await db.query(
      'SELECT * FROM user_addresses WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]
    );
    if (!existing.length) return res.status(404).json({ success: false, message: 'Address not found' });
    if (pincode) {
      const [pins] = await db.query(
        'SELECT * FROM service_pincodes WHERE pincode = ? AND is_active = TRUE', [pincode]
      );
      if (!pins.length) return res.status(400).json({ success: false, message: `Pincode ${pincode} is not serviceable` });
    }
    if (is_default) {
      await db.query('UPDATE user_addresses SET is_default = FALSE WHERE user_id = ?', [req.user.id]);
    }
    await db.query(
      'UPDATE user_addresses SET label=?, house_no=?, area=?, city=?, landmark=?, pincode=?, is_default=? WHERE id=? AND user_id=?',
      [label || 'Home', house_no, area || null, city, landmark || null, pincode, is_default ? 1 : 0, req.params.id, req.user.id]
    );
    res.json({ success: true, message: 'Address updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// DELETE /api/addresses/:id — delete address
const deleteAddress = async (req, res) => {
  try {
    const [existing] = await db.query(
      'SELECT * FROM user_addresses WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]
    );
    if (!existing.length) return res.status(404).json({ success: false, message: 'Address not found' });
    await db.query('DELETE FROM user_addresses WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true, message: 'Address deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PUT /api/addresses/:id/default — set as default
const setDefault = async (req, res) => {
  try {
    const [existing] = await db.query(
      'SELECT * FROM user_addresses WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]
    );
    if (!existing.length) return res.status(404).json({ success: false, message: 'Address not found' });
    await db.query('UPDATE user_addresses SET is_default = FALSE WHERE user_id = ?', [req.user.id]);
    await db.query('UPDATE user_addresses SET is_default = TRUE WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true, message: 'Default address updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getAddresses, addAddress, updateAddress, deleteAddress, setDefault };