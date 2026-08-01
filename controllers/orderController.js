const db = require('../config/db');
const { getLinkedUserIds } = require('../utils/accountScope');

const createNotification = async (userId, title, message, type) => {
  await db.query(
    'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
    [userId, title, message, type]
  );
};

// @POST /api/orders
const placeOrder = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { items, delivery_address, delivery_pincode, payment_method, coupon_code, notes } = req.body;
    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }
    if (!delivery_pincode || !/^\d{6}$/.test(delivery_pincode)) {
      return res.status(400).json({ success: false, message: 'Valid delivery pincode is required' });
    }

    // Verify pincode is serviceable
    const [serviceRow] = await conn.query(
      'SELECT * FROM service_pincodes WHERE pincode = ? AND is_active = TRUE',
      [delivery_pincode]
    );
    if (!serviceRow.length) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'We do not deliver to pincode ' + delivery_pincode });
    }

    let total = 0;
    let discount_amount = 0;

    // Validate each product's availability at the pincode
    for (const item of items) {
      const [products] = await conn.query('SELECT price, discount, stock FROM products WHERE id = ? AND is_active = TRUE', [item.product_id]);
      if (!products.length) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'Product ID ' + item.product_id + ' not found' });
      }

      // Check pincode-specific stock
      const [pincodeStock] = await conn.query(
        'SELECT stock, is_available FROM product_pincode_stock WHERE product_id = ? AND pincode = ?',
        [item.product_id, delivery_pincode]
      );

      if (!pincodeStock.length || !pincodeStock[0].is_available) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'One or more products are not available at pincode ' + delivery_pincode });
      }
      if (pincodeStock[0].stock < item.quantity) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'Insufficient stock at your pincode. Available: ' + pincodeStock[0].stock });
      }

      const p = products[0];
      const discountedPrice = p.price * (1 - p.discount / 100);
      total += discountedPrice * item.quantity;
    }

    // Apply coupon
    if (coupon_code) {
      const [coupons] = await conn.query(
        'SELECT * FROM coupons WHERE code = ? AND is_active = TRUE AND (expires_at IS NULL OR expires_at >= CURDATE()) AND used_count < max_uses',
        [coupon_code]
      );
      if (coupons.length > 0) {
        const coupon = coupons[0];
        if (total >= coupon.min_order_amount) {
          if (coupon.discount_percent) discount_amount = (total * coupon.discount_percent) / 100;
          else if (coupon.discount_amount) discount_amount = coupon.discount_amount;
          await conn.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?', [coupon.id]);
        }
      }
    }

    const finalTotal = total - discount_amount;
    const estimated = new Date(Date.now() + 2 * 60 * 60 * 1000);

    const [orderResult] = await conn.query(
      `INSERT INTO orders (user_id, total_price, delivery_address, delivery_pincode, payment_method,
        coupon_code, discount_amount, notes, estimated_delivery)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, finalTotal, delivery_address, delivery_pincode, payment_method || 'cod', coupon_code, discount_amount, notes, estimated]
    );

    const orderId = orderResult.insertId;

    for (const item of items) {
      const [products] = await conn.query('SELECT price, discount FROM products WHERE id = ?', [item.product_id]);
      const p = products[0];
      const finalPrice = p.price * (1 - p.discount / 100);

      await conn.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [orderId, item.product_id, item.quantity, finalPrice]
      );

      // Deduct from BOTH global stock and pincode stock
      await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.product_id]);
      await conn.query(
        'UPDATE product_pincode_stock SET stock = stock - ? WHERE product_id = ? AND pincode = ?',
        [item.quantity, item.product_id, delivery_pincode]
      );
    }

    await conn.query(
      'INSERT INTO payments (order_id, method, amount) VALUES (?, ?, ?)',
      [orderId, payment_method || 'cod', finalTotal]
    );

    await conn.commit();

    await createNotification(
      req.user.id,
      'Order Placed!',
      'Your order #' + orderId + ' placed successfully. Total: Rs.' + finalTotal.toFixed(2),
      'order_placed'
    );

    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      orderId,
      total: finalTotal,
      discount: discount_amount
    });
  } catch (err) {
    await conn.rollback();
    console.error('Order error:', err);
    res.status(500).json({ success: false, message: 'Failed to place order' });
  } finally {
    conn.release();
  }
};

// @GET /api/orders/my
const getMyOrders = async (req, res) => {
  try {
    const linkedUserIds = await getLinkedUserIds(db, req.user);
    if (!linkedUserIds.length) {
      return res.json({ success: true, orders: [] });
    }

    const placeholders = linkedUserIds.map(() => '?').join(', ');
    const [orders] = await db.query(
      `SELECT o.*, dp.name as delivery_name, dp.contact as delivery_contact
       FROM orders o
       LEFT JOIN delivery_partners dp ON o.delivery_partner_id = dp.id
       WHERE o.user_id IN (${placeholders}) ORDER BY o.created_at DESC`,
      linkedUserIds
    );
    for (const order of orders) {
      const [items] = await db.query(
        'SELECT oi.*, p.name, p.image_url FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?',
        [order.id]
      );
      order.items = items;
    }
    res.json({ success: true, orders });
  } catch (err) {
    console.error('Get my orders error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @GET /api/orders/:id
const getOrder = async (req, res) => {
  try {
    const [orders] = await db.query(
      `SELECT o.*, u.name as customer_name, u.phone as customer_phone,
       dp.name as delivery_name, dp.contact as delivery_contact
       FROM orders o
       JOIN users u ON o.user_id = u.id
       LEFT JOIN delivery_partners dp ON o.delivery_partner_id = dp.id
       WHERE o.id = ?`,
      [req.params.id]
    );
    if (!orders.length) return res.status(404).json({ success: false, message: 'Order not found' });
    const order = orders[0];
    if (req.user.role === 'customer' && order.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const [items] = await db.query(
      'SELECT oi.*, p.name, p.image_url, p.weight FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?',
      [order.id]
    );
    order.items = items;
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @GET /api/orders/admin/all
const getAllOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    let query = `SELECT o.*, u.name as customer_name, u.phone as customer_phone,
                 dp.name as delivery_name
                 FROM orders o
                 JOIN users u ON o.user_id = u.id
                 LEFT JOIN delivery_partners dp ON o.delivery_partner_id = dp.id`;
    const params = [];
    if (status) { query += ' WHERE o.status = ?'; params.push(status); }
    query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
    const [orders] = await db.query(query, params);
    const [count] = await db.query('SELECT COUNT(*) as total FROM orders' + (status ? ' WHERE status = ?' : ''), status ? [status] : []);
    res.json({ success: true, orders, total: count[0].total });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @PUT /api/orders/:id/assign
const assignDelivery = async (req, res) => {
  try {
    const { delivery_partner_id } = req.body;
    const { id } = req.params;
    const [partners] = await db.query('SELECT * FROM delivery_partners WHERE id = ?', [delivery_partner_id]);
    if (!partners.length) return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    await db.query('UPDATE orders SET delivery_partner_id = ?, status = "assigned" WHERE id = ?', [delivery_partner_id, id]);
    await db.query('UPDATE delivery_partners SET status = "busy" WHERE id = ?', [delivery_partner_id]);
    const [orders] = await db.query('SELECT user_id FROM orders WHERE id = ?', [id]);
    if (orders.length) {
      await createNotification(orders[0].user_id, 'Delivery Assigned', 'Your order #' + id + ' assigned to ' + partners[0].name + '.', 'assigned');
    }
    await createNotification(partners[0].user_id, 'New Order Assigned', 'You have been assigned order #' + id + '.', 'new_assignment');
    res.json({ success: true, message: 'Delivery partner assigned successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @PUT /api/orders/:id/status
const updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;
    const validStatuses = ['accepted', 'picked_up', 'out_for_delivery', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const [orders] = await db.query(
      `SELECT o.*, dp.user_id as dp_user_id FROM orders o
       LEFT JOIN delivery_partners dp ON o.delivery_partner_id = dp.id
       WHERE o.id = ?`, [id]
    );
    if (!orders.length) return res.status(404).json({ success: false, message: 'Order not found' });
    const order = orders[0];
    if (req.user.role === 'delivery' && order.dp_user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not your order' });
    }
    await db.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
    if (status === 'delivered') {
      await db.query('UPDATE payments SET status = "paid" WHERE order_id = ?', [id]);
      await db.query('UPDATE delivery_partners SET status = "available", total_deliveries = total_deliveries + 1 WHERE id = ?', [order.delivery_partner_id]);
    }
    const statusMessages = {
      accepted: 'Your order #' + id + ' has been accepted by the delivery partner.',
      picked_up: 'Your order #' + id + ' has been picked up and is on its way!',
      out_for_delivery: 'Your order #' + id + ' is out for delivery. Get ready!',
      delivered: 'Your order #' + id + ' has been delivered. Enjoy your rice!',
      cancelled: 'Your order #' + id + ' has been cancelled.'
    };
    await createNotification(order.user_id, 'Order ' + status.replace(/_/g, ' ').toUpperCase(), statusMessages[status], status);
    res.json({ success: true, message: 'Order status updated to ' + status });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @GET /api/orders/delivery/assigned
const getAssignedOrders = async (req, res) => {
  try {
    const [partners] = await db.query('SELECT id FROM delivery_partners WHERE user_id = ?', [req.user.id]);
    if (!partners.length) return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    const [orders] = await db.query(
      `SELECT o.*, u.name as customer_name, u.phone as customer_phone
       FROM orders o JOIN users u ON o.user_id = u.id
       WHERE o.delivery_partner_id = ? AND o.status NOT IN ('delivered', 'cancelled')
       ORDER BY o.created_at DESC`,
      [partners[0].id]
    );
    for (const order of orders) {
      const [items] = await db.query(
        'SELECT oi.*, p.name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?',
        [order.id]
      );
      order.items = items;
    }
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Admin stats
const getStats = async (req, res) => {
  try {
    const [[{ total_orders }]] = await db.query('SELECT COUNT(*) as total_orders FROM orders');
    const [[{ revenue }]] = await db.query("SELECT COALESCE(SUM(total_price),0) as revenue FROM orders WHERE status != 'cancelled'");
    const [[{ active_deliveries }]] = await db.query("SELECT COUNT(*) as active_deliveries FROM orders WHERE status IN ('assigned','accepted','picked_up','out_for_delivery')");
    const [[{ total_customers }]] = await db.query("SELECT COUNT(*) as total_customers FROM users WHERE role = 'customer'");
    const [recent_orders] = await db.query(
      `SELECT o.id, o.total_price, o.status, o.created_at, o.delivery_pincode, u.name as customer_name
       FROM orders o JOIN users u ON o.user_id = u.id
       ORDER BY o.created_at DESC LIMIT 5`
    );
    res.json({ success: true, stats: { total_orders, revenue, active_deliveries, total_customers }, recent_orders });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Validate coupon
const validateCoupon = async (req, res) => {
  try {
    const { code, order_amount } = req.body;
    const [coupons] = await db.query(
      'SELECT * FROM coupons WHERE code = ? AND is_active = TRUE AND (expires_at IS NULL OR expires_at >= CURDATE()) AND used_count < max_uses',
      [code]
    );
    if (!coupons.length) return res.status(404).json({ success: false, message: 'Invalid or expired coupon' });
    const coupon = coupons[0];
    if (order_amount < coupon.min_order_amount) {
      return res.status(400).json({ success: false, message: 'Minimum order amount Rs.' + coupon.min_order_amount + ' required' });
    }
    let discount = 0;
    if (coupon.discount_percent) discount = (order_amount * coupon.discount_percent) / 100;
    else if (coupon.discount_amount) discount = coupon.discount_amount;
    res.json({ success: true, coupon, discount });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { placeOrder, getMyOrders, getOrder, getAllOrders, assignDelivery, updateStatus, getAssignedOrders, getStats, validateCoupon };