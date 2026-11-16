const db = require('../db');
const { logAudit } = require('../middleware/auditLogger');

async function getNotifications(req, res, next) {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    // Fetch notifications specifically for this user, OR for their role, OR for 'all'
    const sql = `
      SELECT n.*, r.route_name
      FROM notifications n
      LEFT JOIN routes r ON n.route_id = r.id
      WHERE (n.user_id = $1 OR n.target_role = $2 OR n.target_role = 'all' OR n.target_role IS NULL)
      ORDER BY n.created_at DESC
      LIMIT 50
    `;

    const result = await db.query(sql, [userId, role]);
    const unreadCount = result.rows.filter(n => !n.is_read || n.is_read === 0).length;

    res.json({
      notifications: result.rows,
      unread_count: unreadCount,
      total: result.rows.length
    });
  } catch (err) {
    next(err);
  }
}

async function createNotification(req, res, next) {
  try {
    const { user_id, target_role, route_id, category, title, message, priority } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required.' });
    }

    const insertRes = await db.query(
      `INSERT INTO notifications (user_id, target_role, route_id, category, title, message, priority, is_read)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0)
       RETURNING *`,
      [user_id || null, target_role || 'all', route_id || null, category || 'announcement', title.trim(), message.trim(), priority || 'medium']
    );

    const notif = insertRes.rows[0];
    await logAudit(req.user.id, 'CREATE_NOTIFICATION', 'NOTIFICATION', notif.id, `Created ${category} alert: ${title}`, req);

    res.status(201).json({
      message: 'Notification / announcement published successfully.',
      notification: notif
    });
  } catch (err) {
    next(err);
  }
}

async function markAsRead(req, res, next) {
  try {
    const { id } = req.params;
    await db.query(`UPDATE notifications SET is_read = 1 WHERE id = $1`, [id]);
    res.json({ message: 'Notification marked as read.' });
  } catch (err) {
    next(err);
  }
}

async function deleteNotification(req, res, next) {
  try {
    const { id } = req.params;
    await db.query(`DELETE FROM notifications WHERE id = $1`, [id]);
    res.json({ message: 'Notification deleted successfully.' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getNotifications,
  createNotification,
  markAsRead,
  deleteNotification
};

