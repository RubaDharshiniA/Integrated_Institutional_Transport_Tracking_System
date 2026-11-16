const express = require('express');
const router = express.Router();
const fleetController = require('../controllers/fleetController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.use(authenticateToken);

// View fleet is accessible to manager, admin, and driver
router.get('/vehicles', requireRole('admin', 'manager', 'driver'), fleetController.getVehicles);
router.post('/vehicles', requireRole('admin', 'manager'), fleetController.createVehicle);
router.put('/vehicles/:id', requireRole('admin', 'manager'), fleetController.updateVehicle);
router.delete('/vehicles/:id', requireRole('admin', 'manager'), fleetController.deleteVehicle);

// Maintenance logs
router.get('/maintenance', requireRole('admin', 'manager'), fleetController.getMaintenanceLogs);
router.post('/maintenance', requireRole('admin', 'manager'), fleetController.createMaintenanceLog);

module.exports = router;
