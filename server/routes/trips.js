const express = require('express');
const router = express.Router();
const tripController = require('../controllers/tripController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/', requireRole('admin', 'manager', 'driver'), tripController.getTrips);
router.get('/active', tripController.getActiveTrips);
router.get('/driver/my-trips', requireRole('driver'), tripController.getDriverMyTrips);
router.get('/:id/manifest', requireRole('admin', 'manager', 'driver'), tripController.getTripManifest);

router.post('/', requireRole('admin', 'manager'), tripController.createTrip);
router.put('/:id/start', requireRole('admin', 'manager', 'driver'), tripController.startTrip);
router.put('/:id/complete', requireRole('admin', 'manager', 'driver'), tripController.completeTrip);
router.put('/:id/cancel', requireRole('admin', 'manager'), tripController.cancelTrip);

module.exports = router;
