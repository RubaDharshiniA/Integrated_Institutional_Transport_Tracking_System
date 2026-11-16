const express = require('express');
const router = express.Router();
const driverController = require('../controllers/driverController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/', requireRole('admin', 'manager'), driverController.getDrivers);
router.post('/', requireRole('admin', 'manager'), driverController.createDriver);
router.put('/:id', requireRole('admin', 'manager'), driverController.updateDriver);

module.exports = router;
