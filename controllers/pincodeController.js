const db = require('../config/db');

// @GET /api/pincodes — all service pincodes (public)
const getServicePincodes = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM service_pincodes WHERE is_active = TRUE ORDER BY city, area'
    );
    res.json({ success: true, pincodes: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @GET /api/pincodes/check/:pincode — check if pincode is serviceable
const checkPincode = async (req, res) => {
  try {
    const { pincode } = req.params;
    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({ success: false, message: 'Invalid pincode format' });
    }
    const [rows] = await db.query(
      'SELECT * FROM service_pincodes WHERE pincode = ? AND is_active = TRUE',
      [pincode]
    );
    if (rows.length === 0) {
      return res.json({ success: false, serviceable: false, message: 'Sorry, we do not deliver to this pincode yet.' });
    }
    res.json({ success: true, serviceable: true, area: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @GET /api/pincodes/product/:productId?pincode=522001
// Check availability + stock of a product at a specific pincode
const checkProductAvailability = async (req, res) => {
  try {
    const { productId } = req.params;
    const { pincode } = req.query;

    if (!pincode || !/^\d{6}$/.test(pincode)) {
      return res.status(400).json({ success: false, message: 'Valid 6-digit pincode required' });
    }

    // Check if pincode is serviced at all
    const [serviceRow] = await db.query(
      'SELECT * FROM service_pincodes WHERE pincode = ? AND is_active = TRUE',
      [pincode]
    );
    if (!serviceRow.length) {
      return res.json({
        success: true,
        available: false,
        stock: 0,
        message: 'We do not deliver to this pincode yet.',
        area: null
      });
    }

    // Check product-specific stock at this pincode
    const [stockRow] = await db.query(
      'SELECT * FROM product_pincode_stock WHERE product_id = ? AND pincode = ?',
      [productId, pincode]
    );

    if (!stockRow.length || !stockRow[0].is_available || stockRow[0].stock === 0) {
      return res.json({
        success: true,
        available: false,
        stock: 0,
        message: 'This product is currently unavailable at your pincode.',
        area: serviceRow[0]
      });
    }

    res.json({
      success: true,
      available: true,
      stock: stockRow[0].stock,
      message: `Available! ${stockRow[0].stock} units in stock.`,
      area: serviceRow[0]
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @GET /api/pincodes/product/:productId/all — all pincodes for a product with availability
const getProductAllPincodes = async (req, res) => {
  try {
    const { productId } = req.params;
    const [rows] = await db.query(
      `SELECT pps.pincode, pps.stock, pps.is_available,
              sp.area, sp.city, sp.state
       FROM product_pincode_stock pps
       JOIN service_pincodes sp ON pps.pincode = sp.pincode
       WHERE pps.product_id = ?
       ORDER BY pps.is_available DESC, sp.city, sp.area`,
      [productId]
    );
    res.json({ success: true, pincodes: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── ADMIN routes ─────────────────────────────────────────────────────────────

// @POST /api/pincodes — add service pincode (admin)
const addServicePincode = async (req, res) => {
  try {
    const { pincode, area, city, state } = req.body;
    if (!pincode || !area || !city) {
      return res.status(400).json({ success: false, message: 'pincode, area and city are required' });
    }
    await db.query(
      'INSERT INTO service_pincodes (pincode, area, city, state) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE area=VALUES(area), city=VALUES(city), is_active=TRUE',
      [pincode, area, city, state || 'Andhra Pradesh']
    );
    res.json({ success: true, message: 'Service pincode added' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @DELETE /api/pincodes/:pincode — deactivate pincode (admin)
const removeServicePincode = async (req, res) => {
  try {
    await db.query('UPDATE service_pincodes SET is_active = FALSE WHERE pincode = ?', [req.params.pincode]);
    res.json({ success: true, message: 'Pincode deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @PUT /api/pincodes/product-stock — update product stock per pincode (admin)
const updateProductPincodeStock = async (req, res) => {
  try {
    const { product_id, pincode, stock, is_available } = req.body;
    await db.query(
      `INSERT INTO product_pincode_stock (product_id, pincode, stock, is_available)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE stock=VALUES(stock), is_available=VALUES(is_available)`,
      [product_id, pincode, stock, is_available !== false]
    );
    res.json({ success: true, message: 'Stock updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @GET /api/pincodes/admin/stock/:productId — get all pincode stock for a product (admin)
const getAdminProductStock = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT pps.*, sp.area, sp.city
       FROM product_pincode_stock pps
       JOIN service_pincodes sp ON pps.pincode = sp.pincode
       WHERE pps.product_id = ?
       ORDER BY sp.city, sp.area`,
      [req.params.productId]
    );
    // Also return pincodes not yet configured for this product
    const [allPincodes] = await db.query(
      `SELECT sp.* FROM service_pincodes sp
       WHERE sp.is_active = TRUE
       AND sp.pincode NOT IN (
         SELECT pincode FROM product_pincode_stock WHERE product_id = ?
       )`,
      [req.params.productId]
    );
    res.json({ success: true, configured: rows, unconfigured: allPincodes });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  getServicePincodes,
  checkPincode,
  checkProductAvailability,
  getProductAllPincodes,
  addServicePincode,
  removeServicePincode,
  updateProductPincodeStock,
  getAdminProductStock,
};