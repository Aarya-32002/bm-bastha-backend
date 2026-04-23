const express = require('express');
const router = express.Router();
const {
  getServicePincodes,
  checkPincode,
  checkProductAvailability,
  getProductAllPincodes,
  addServicePincode,
  removeServicePincode,
  updateProductPincodeStock,
  getAdminProductStock,
} = require('../controllers/pincodeController');
const { authenticate, authorize } = require('../middleware/auth');

// Public
router.get('/', getServicePincodes);
router.get('/check/:pincode', checkPincode);
router.get('/product/:productId', checkProductAvailability);          // ?pincode=522001
router.get('/product/:productId/all', getProductAllPincodes);

// Admin only
router.post('/', authenticate, authorize('admin'), addServicePincode);
router.delete('/:pincode', authenticate, authorize('admin'), removeServicePincode);
router.put('/product-stock', authenticate, authorize('admin'), updateProductPincodeStock);
router.get('/admin/stock/:productId', authenticate, authorize('admin'), getAdminProductStock);

module.exports = router;