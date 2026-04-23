const express = require('express');
const router = express.Router();
const {
  placeOrder, getMyOrders, getOrder, getAllOrders,
  assignDelivery, updateStatus, getAssignedOrders, getStats, validateCoupon
} = require('../controllers/orderController');
const { authenticate, authorize } = require('../middleware/auth');

// Customer
router.post('/', authenticate, authorize('customer'), placeOrder);
router.get('/my', authenticate, authorize('customer'), getMyOrders);
router.post('/coupon/validate', authenticate, validateCoupon);

// Admin
router.get('/admin/all', authenticate, authorize('admin'), getAllOrders);
router.get('/admin/stats', authenticate, authorize('admin'), getStats);
router.put('/:id/assign', authenticate, authorize('admin'), assignDelivery);

// Delivery
router.get('/delivery/assigned', authenticate, authorize('delivery'), getAssignedOrders);
router.put('/:id/status', authenticate, authorize('delivery', 'admin'), updateStatus);

// Shared - must be last to avoid conflict
router.get('/:id', authenticate, getOrder);

module.exports = router;