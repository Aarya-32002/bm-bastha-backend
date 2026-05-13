const express = require('express');
const router  = express.Router();
const {
  submitReturn, getMyReturns, checkReturn,
  getAllReturns, updateReturnStatus
} = require('../controllers/returnController');
const { authenticate, authorize } = require('../middleware/auth');

// Customer
router.post('/',                    authenticate, authorize('customer'), submitReturn);
router.get('/my',                   authenticate, authorize('customer'), getMyReturns);
router.get('/check/:orderId',       authenticate, authorize('customer'), checkReturn);

// Admin
router.get('/admin',                authenticate, authorize('admin'), getAllReturns);
router.put('/admin/:id/status',     authenticate, authorize('admin'), updateReturnStatus);

module.exports = router;