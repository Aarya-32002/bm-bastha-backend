const db = require('../config/db');

// Helper: create notification
const notify = async (userId, title, message, type) => {
  await db.query(
    'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
    [userId, title, message, type]
  );
};

// ── POST /api/returns  (customer submits return) ───────────────────────────
const submitReturn = async (req, res) => {
  try {
    const { order_id, reason, description } = req.body;
    const user_id = req.user.id;

    if (!order_id || !reason) {
      return res.status(400).json({ success: false, message: 'order_id and reason are required' });
    }

    // 1. Verify the order belongs to this user and is delivered
    const [orders] = await db.query(
      'SELECT * FROM orders WHERE id = ? AND user_id = ?',
      [order_id, user_id]
    );
    if (!orders.length) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    const order = orders[0];

    if (order.status !== 'delivered') {
      return res.status(400).json({ success: false, message: 'Returns are only allowed for delivered orders' });
    }

    // 2. Check 2-day return window
    const deliveredAt  = new Date(order.updated_at);
    const now          = new Date();
    const hoursDiff    = (now - deliveredAt) / (1000 * 60 * 60);
    if (hoursDiff > 48) {
      return res.status(400).json({
        success: false,
        message: 'Return window has expired. Returns must be requested within 2 days of delivery.'
      });
    }

    // 3. Check if return already exists for this order (UNIQUE constraint)
    const [existing] = await db.query(
      'SELECT id, status FROM return_requests WHERE order_id = ?',
      [order_id]
    );
    if (existing.length) {
      return res.status(409).json({
        success: false,
        message: 'A return request for this order already exists. Status: ' + existing[0].status,
        existing: existing[0]
      });
    }

    // 4. Insert return request
    const [result] = await db.query(
      'INSERT INTO return_requests (order_id, user_id, reason, description) VALUES (?, ?, ?, ?)',
      [order_id, user_id, reason, description || null]
    );

    // 5. Notify the customer
    await notify(
      user_id,
      '↩️ Return Request Submitted',
      'Your return request for Order #' + order_id + ' has been received. Our team will contact you within 24 hours.',
      'return_submitted'
    );

    // 6. Notify admin (user_id = 1 is admin by default)
    const [admins] = await db.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (admins.length) {
      await notify(
        admins[0].id,
        '⚠️ New Return Request',
        'Order #' + order_id + ' — Customer requested return. Reason: ' + reason,
        'return_admin'
      );
    }

    res.status(201).json({
      success: true,
      message: 'Return request submitted successfully',
      return_id: result.insertId
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Return request already exists for this order' });
    }
    console.error('Return submit error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── GET /api/returns/my  (customer sees their returns) ─────────────────────
const getMyReturns = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT rr.*, o.total_price, o.delivery_address
       FROM return_requests rr
       JOIN orders o ON rr.order_id = o.id
       WHERE rr.user_id = ?
       ORDER BY rr.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, returns: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── GET /api/returns/check/:orderId  (check if return exists) ──────────────
const checkReturn = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, status, reason, created_at FROM return_requests WHERE order_id = ? AND user_id = ?',
      [req.params.orderId, req.user.id]
    );
    res.json({ success: true, hasReturn: rows.length > 0, returnRequest: rows[0] || null });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── GET /api/returns/admin  (admin sees all returns) ───────────────────────
const getAllReturns = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT rr.*, u.name as customer_name, u.phone as customer_phone,
              o.total_price, o.delivery_address, o.delivery_pincode
       FROM return_requests rr
       JOIN users u  ON rr.user_id  = u.id
       JOIN orders o ON rr.order_id = o.id
       ORDER BY rr.created_at DESC`
    );
    res.json({ success: true, returns: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── PUT /api/returns/:id/status  (admin updates return status) ─────────────
const updateReturnStatus = async (req, res) => {
  try {
    const { status, admin_note } = req.body;
    const validStatuses = ['pending', 'approved', 'rejected', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const [returns] = await db.query('SELECT * FROM return_requests WHERE id = ?', [req.params.id]);
    if (!returns.length) return res.status(404).json({ success: false, message: 'Return not found' });

    await db.query(
      'UPDATE return_requests SET status = ?, admin_note = ? WHERE id = ?',
      [status, admin_note || null, req.params.id]
    );

    const ret = returns[0];

    // Notify customer of status update
    const statusMessages = {
      approved:  'Your return request for Order #' + ret.order_id + ' has been APPROVED. We will arrange pickup soon.',
      rejected:  'Your return request for Order #' + ret.order_id + ' has been rejected. ' + (admin_note || 'Please contact support.'),
      completed: 'Your return for Order #' + ret.order_id + ' is complete. Refund will be processed in 5-7 business days.',
    };
    if (statusMessages[status]) {
      await notify(ret.user_id, '↩️ Return Update', statusMessages[status], 'return_update');
    }

    res.json({ success: true, message: 'Return status updated to ' + status });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { submitReturn, getMyReturns, checkReturn, getAllReturns, updateReturnStatus };