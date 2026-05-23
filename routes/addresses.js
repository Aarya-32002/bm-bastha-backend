const express = require('express');
const router  = express.Router();
const { getAddresses, addAddress, updateAddress, deleteAddress, setDefault } = require('../controllers/addressController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/',            authenticate, authorize('customer'), getAddresses);
router.post('/',           authenticate, authorize('customer'), addAddress);
router.put('/:id',         authenticate, authorize('customer'), updateAddress);
router.delete('/:id',      authenticate, authorize('customer'), deleteAddress);
router.put('/:id/default', authenticate, authorize('customer'), setDefault);

module.exports = router;