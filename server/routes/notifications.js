const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/', notificationController.getNotifications);
router.post('/', requireRole('admin', 'manager'), notificationController.createNotification);
router.patch('/:id/read', notificationController.markAsRead);
router.delete('/:id', requireRole('admin', 'manager'), notificationController.deleteNotification);

module.exports = router;

