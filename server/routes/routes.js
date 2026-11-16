const express = require('express');
const router = express.Router();
const routeController = require('../controllers/routeController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.use(authenticateToken);

// View routes is accessible to all authenticated roles
router.get('/', routeController.getRoutes);
router.get('/:id', routeController.getRouteById);

// Create / Edit / Delete routes restricted to Manager and Admin
router.post('/', requireRole('admin', 'manager'), routeController.createRoute);
router.put('/:id', requireRole('admin', 'manager'), routeController.updateRoute);
router.delete('/:id', requireRole('admin', 'manager'), routeController.deleteRoute);

// Stops management
router.post('/:id/stops', requireRole('admin', 'manager'), routeController.addStop);
router.delete('/stops/:stopId', requireRole('admin', 'manager'), routeController.deleteStop);

module.exports = router;
