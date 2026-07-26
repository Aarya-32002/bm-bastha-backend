const express = require('express');
const router  = express.Router();
const {
  getAll, getAllAdmin, create, update, remove, assignProduct, unassignProduct
} = require('../controllers/categoryController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/',                   getAll);
router.get('/admin',              authenticate, authorize('admin'), getAllAdmin);
router.post('/',                  authenticate, authorize('admin'), create);
router.put('/:id',                authenticate, authorize('admin'), update);
router.delete('/:id',             authenticate, authorize('admin'), remove);
router.put('/:id/assign-product', authenticate, authorize('admin'), assignProduct);
// Unassign route — uses 'unassign' as the id
router.put('/unassign/remove-product', authenticate, authorize('admin'), unassignProduct);

module.exports = router;