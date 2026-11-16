const express = require('express');
const router = express.Router();
const incidentController = require('../controllers/incidentController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/', requireRole('admin', 'manager', 'driver'), incidentController.getIncidents);
router.post('/', incidentController.createIncident);
router.put('/:id/resolve', requireRole('admin', 'manager'), incidentController.resolveIncident);

module.exports = router;
