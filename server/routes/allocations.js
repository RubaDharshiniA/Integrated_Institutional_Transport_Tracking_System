const express = require('express');
const router = express.Router();
const allocationController = require('../controllers/allocationController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/', requireRole('admin', 'manager'), allocationController.getAllocations);
router.get('/my', requireRole('student'), allocationController.getMyAllocation);
router.post('/', requireRole('admin', 'manager'), allocationController.createAllocation);
router.put('/:id/status', requireRole('admin', 'manager'), allocationController.updateAllocationStatus);
router.get('/passes/:passNumber', allocationController.verifyBusPass);

module.exports = router;
