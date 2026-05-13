const express = require('express');
const router = express.Router();
const { getPartners, addPartner, getDeliveryProfile } = require('../controllers/deliveryController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/partners', authenticate, authorize('admin'), getPartners);
router.post('/partners', authenticate, authorize('admin'), addPartner);
router.get('/profile', authenticate, authorize('delivery'), getDeliveryProfile);

module.exports = router;
