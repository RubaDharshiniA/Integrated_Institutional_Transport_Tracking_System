const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.use(authenticateToken);

router.post('/check-in', requireRole('driver', 'manager', 'admin'), attendanceController.checkInStudent);
router.get('/trip/:tripId', requireRole('driver', 'manager', 'admin'), attendanceController.getTripAttendance);
router.post('/absence', requireRole('student'), attendanceController.recordAbsence);
router.get('/my-absences', requireRole('student'), attendanceController.getMyAbsences);

module.exports = router;
