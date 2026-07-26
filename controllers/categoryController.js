const db = require('../config/db');

const slugify = (name) =>
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// GET /api/categories — all active categories
const getAll = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM categories WHERE is_active = TRUE ORDER BY sort_order ASC, name ASC'
    );
    res.json({ success: true, categories: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /api/categories/admin — all categories (admin)
const getAllAdmin = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.*, COUNT(p.id) as product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id AND p.is_active = TRUE
       GROUP BY c.id
       ORDER BY c.sort_order ASC, c.name ASC`
    );
    res.json({ success: true, categories: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST /api/categories — create category (admin)
const create = async (req, res) => {
  try {
    const { name, description, icon, color, sort_order } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Category name is required' });
    const slug = slugify(name);
    const [existing] = await db.query('SELECT id FROM categories WHERE slug = ?', [slug]);
    if (existing.length) return res.status(409).json({ success: false, message: 'Category with this name already exists' });
    const [result] = await db.query(
      'INSERT INTO categories (name, slug, description, icon, color, sort_order) VALUES (?,?,?,?,?,?)',
      [name.trim(), slug, description || null, icon || '🌾', color || '#16a34a', sort_order || 0]
    );
    res.status(201).json({ success: true, message: 'Category created', id: result.insertId, slug });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PUT /api/categories/:id — update category (admin)
const update = async (req, res) => {
  try {
    const { name, description, icon, color, sort_order, is_active } = req.body;
    const [existing] = await db.query('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ success: false, message: 'Category not found' });
    const slug = name ? slugify(name) : existing[0].slug;
    await db.query(
      'UPDATE categories SET name=?, slug=?, description=?, icon=?, color=?, sort_order=?, is_active=? WHERE id=?',
      [name || existing[0].name, slug, description ?? existing[0].description,
       icon || existing[0].icon, color || existing[0].color,
       sort_order ?? existing[0].sort_order, is_active !== undefined ? is_active : existing[0].is_active,
       req.params.id]
    );
    res.json({ success: true, message: 'Category updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// DELETE /api/categories/:id — deactivate (admin)
const remove = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    await db.query('UPDATE categories SET is_active = FALSE WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Category deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PUT /api/categories/:id/assign-product — assign product to category
const assignProduct = async (req, res) => {
  try {
    const { product_id } = req.body;
    if (!product_id) return res.status(400).json({ success: false, message: 'product_id is required' });
    const [cat] = await db.query('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (!cat.length) return res.status(404).json({ success: false, message: 'Category not found' });
    await db.query(
      'UPDATE products SET category_id = ?, category = ? WHERE id = ?',
      [req.params.id, cat[0].slug, product_id]
    );
    res.json({ success: true, message: 'Product assigned to category' });
  } catch (err) {
    console.error('Assign product error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
};

// PUT /api/categories/unassign/assign-product — remove product from category
const unassignProduct = async (req, res) => {
  try {
    const { product_id } = req.body;
    if (!product_id) return res.status(400).json({ success: false, message: 'product_id is required' });
    await db.query(
      'UPDATE products SET category_id = NULL, category = ? WHERE id = ?',
      ['regular', product_id]
    );
    res.json({ success: true, message: 'Product removed from category' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getAll, getAllAdmin, create, update, remove, assignProduct, unassignProduct };