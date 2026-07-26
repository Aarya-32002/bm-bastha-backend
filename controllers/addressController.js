const db = require('../config/db');

const validatePincode = async (pincode) => {
  const [pins] = await db.query(
    'SELECT * FROM service_pincodes WHERE pincode = ? AND is_active = TRUE', [pincode]
  );
  return pins.length > 0;
};

// GET /api/addresses
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

// POST /api/addresses
const addAddress = async (req, res) => {
  try {
    const { label, house_no, street, area, city, landmark, pincode, phone, is_default } = req.body;
    if (!house_no || !city || !pincode) {
      return res.status(400).json({ success: false, message: 'House no, city and pincode are required' });
    }
    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({ success: false, message: 'Invalid pincode format' });
    }
    const serviceable = await validatePincode(pincode);
    if (!serviceable) {
      return res.status(400).json({ success: false, message: `Pincode ${pincode} is not serviceable yet` });
    }
    if (is_default) {
      await db.query('UPDATE user_addresses SET is_default = FALSE WHERE user_id = ?', [req.user.id]);
    }
    // Check if this is first address — auto-set as default
    const [existing] = await db.query('SELECT COUNT(*) as cnt FROM user_addresses WHERE user_id = ?', [req.user.id]);
    const isFirst = existing[0].cnt === 0;

    const [result] = await db.query(
      `INSERT INTO user_addresses
        (user_id, label, house_no, street, area, city, landmark, pincode, phone, is_default)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [req.user.id, label||'Home', house_no, street||null, area||null,
       city, landmark||null, pincode, phone||null, (is_default||isFirst) ? 1 : 0]
    );
    res.status(201).json({ success: true, message: 'Address added', id: result.insertId });
  } catch (err) {
    console.error('Add address error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PUT /api/addresses/:id
const updateAddress = async (req, res) => {
  try {
    const { label, house_no, street, area, city, landmark, pincode, phone, is_default } = req.body;
    const [existing] = await db.query(
      'SELECT * FROM user_addresses WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]
    );
    if (!existing.length) return res.status(404).json({ success: false, message: 'Address not found' });

    if (pincode) {
      if (!/^\d{6}$/.test(pincode)) return res.status(400).json({ success: false, message: 'Invalid pincode' });
      const ok = await validatePincode(pincode);
      if (!ok) return res.status(400).json({ success: false, message: `Pincode ${pincode} not serviceable` });
    }
    if (is_default) {
      await db.query('UPDATE user_addresses SET is_default = FALSE WHERE user_id = ?', [req.user.id]);
    }
    await db.query(
      `UPDATE user_addresses
       SET label=?, house_no=?, street=?, area=?, city=?, landmark=?, pincode=?, phone=?, is_default=?
       WHERE id=? AND user_id=?`,
      [label||existing[0].label, house_no||existing[0].house_no, street||null,
       area||null, city||existing[0].city, landmark||null,
       pincode||existing[0].pincode, phone||null,
       is_default ? 1 : existing[0].is_default,
       req.params.id, req.user.id]
    );
    res.json({ success: true, message: 'Address updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// DELETE /api/addresses/:id
const deleteAddress = async (req, res) => {
  try {
    const [existing] = await db.query(
      'SELECT * FROM user_addresses WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]
    );
    if (!existing.length) return res.status(404).json({ success: false, message: 'Address not found' });
    await db.query('DELETE FROM user_addresses WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    // If deleted was default, make the most recent one default
    if (existing[0].is_default) {
      const [rest] = await db.query(
        'SELECT id FROM user_addresses WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [req.user.id]
      );
      if (rest.length) {
        await db.query('UPDATE user_addresses SET is_default = TRUE WHERE id = ?', [rest[0].id]);
      }
    }
    res.json({ success: true, message: 'Address deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PUT /api/addresses/:id/default
const setDefault = async (req, res) => {
  try {
    const [existing] = await db.query(
      'SELECT * FROM user_addresses WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]
    );
    if (!existing.length) return res.status(404).json({ success: false, message: 'Address not found' });
    await db.query('UPDATE user_addresses SET is_default = FALSE WHERE user_id = ?', [req.user.id]);
    await db.query('UPDATE user_addresses SET is_default = TRUE WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Default address updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getAddresses, addAddress, updateAddress, deleteAddress, setDefault };