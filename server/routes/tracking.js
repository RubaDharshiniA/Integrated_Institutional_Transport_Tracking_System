const express = require('express');
const router = express.Router();
const trackingController = require('../controllers/trackingController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.use(authenticateToken);

router.post('/trips/:tripId/location', requireRole('driver', 'manager', 'admin'), trackingController.updateTripLocation);
router.get('/trips/:tripId/live', trackingController.getTripLiveTracking);
router.get('/all-active', trackingController.getAllActiveTracking);

module.exports = router;
