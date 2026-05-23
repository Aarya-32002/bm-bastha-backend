const db = require('../config/db');

// @GET /api/products
const getProducts = async (req, res) => {
  try {
    const { category, search, sort } = req.query;
    let query = `SELECT p.*, 
          COALESCE(c.name, p.category) as category_name,
          COALESCE(c.icon, '🌾') as category_icon,
          COALESCE(c.color, '#16a34a') as category_color,
          c.slug as category_slug
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.is_active = TRUE`;
    const params = [];

    if (category && category !== 'all') {
      query += ' AND category = ?';
      params.push(category);
    }

    if (search) {
      query += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (sort === 'price_asc') query += ' ORDER BY price ASC';
    else if (sort === 'price_desc') query += ' ORDER BY price DESC';
    else query += ' ORDER BY created_at DESC';

    const [products] = await db.query(query, params);
    res.json({ success: true, products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @GET /api/products/:id
const getProduct = async (req, res) => {
  try {
    const [products] = await db.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (products.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Get reviews
    const [reviews] = await db.query(
      `SELECT r.*, u.name as user_name FROM reviews r
       JOIN users u ON r.user_id = u.id
       WHERE r.product_id = ? ORDER BY r.created_at DESC`,
      [req.params.id]
    );

    res.json({ success: true, product: products[0], reviews });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @POST /api/products (admin)
const createProduct = async (req, res) => {
  try {
    const { name, category, weight, price, description, image_url, stock, discount } = req.body;

    if (!name || !category || !weight || !price) {
      return res.status(400).json({ success: false, message: 'Required fields missing' });
    }

    const [result] = await db.query(
      'INSERT INTO products (name, category, weight, price, description, image_url, stock, discount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, category, weight, price, description, image_url, stock || 100, discount || 0]
    );

    res.status(201).json({ success: true, message: 'Product created', productId: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @PUT /api/products/:id (admin)
const updateProduct = async (req, res) => {
  try {
    const { name, category, weight, price, description, image_url, stock, discount, is_active } = req.body;
    await db.query(
      'UPDATE products SET name=?, category=?, weight=?, price=?, description=?, image_url=?, stock=?, discount=?, is_active=? WHERE id=?',
      [name, category, weight, price, description, image_url, stock, discount, is_active, req.params.id]
    );
    res.json({ success: true, message: 'Product updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @DELETE /api/products/:id (admin)
const deleteProduct = async (req, res) => {
  try {
    await db.query('UPDATE products SET is_active = FALSE WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Product deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getProducts, getProduct, createProduct, updateProduct, deleteProduct };