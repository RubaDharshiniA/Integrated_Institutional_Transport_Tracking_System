const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/dashboard', requireRole('admin', 'manager'), reportController.getDashboardStats);
router.get('/audit', requireRole('admin'), reportController.getAuditLogs);
router.get('/export/trips', requireRole('admin', 'manager'), reportController.exportTripsCsv);
router.get('/export/attendance', requireRole('admin', 'manager'), reportController.exportAttendanceCsv);
router.get('/export/vehicles', requireRole('admin', 'manager'), reportController.exportVehiclesCsv);

module.exports = router;
