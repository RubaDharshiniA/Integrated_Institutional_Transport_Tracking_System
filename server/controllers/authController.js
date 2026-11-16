const bcrypt = require('bcryptjs');
const db = require('../db');
const { generateToken } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLogger');

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const result = await db.query(
      `SELECT * FROM users WHERE LOWER(email) = LOWER($1)`,
      [email.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials: user not found.' });
    }

    const user = result.rows[0];

    if (user.status !== 'active') {
      return res.status(403).json({ error: `Account is ${user.status}. Please contact administrator.` });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials: password incorrect.' });
    }

    // If user is a driver, fetch driver record id and assigned vehicle
    let driverProfile = null;
    if (user.role === 'driver') {
      const driverRes = await db.query(
        `SELECT d.*, v.bus_number, v.registration_plate 
         FROM drivers d 
         LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id 
         WHERE d.user_id = $1`,
        [user.id]
      );
      if (driverRes.rows.length > 0) {
        driverProfile = driverRes.rows[0];
      }
    }

    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      driverId: driverProfile ? driverProfile.id : null,
      assignedVehicleId: driverProfile ? driverProfile.assigned_vehicle_id : null
    };

    const token = generateToken(payload);

    await logAudit(user.id, 'LOGIN_SUCCESS', 'USER', user.id, `User logged in with role: ${user.role}`, req);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        roll_or_emp_id: user.roll_or_emp_id,
        phone: user.phone,
        driverProfile
      }
    });
  } catch (err) {
    next(err);
  }
}

async function getMe(req, res, next) {
  try {
    const result = await db.query(
      `SELECT id, name, email, role, phone, department, roll_or_emp_id, status, created_at 
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const user = result.rows[0];

    let extra = {};
    if (user.role === 'driver') {
      const driverRes = await db.query(
        `SELECT d.*, v.bus_number, v.registration_plate 
         FROM drivers d 
         LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id 
         WHERE d.user_id = $1`,
        [user.id]
      );
      extra.driver = driverRes.rows[0] || null;
    } else if (user.role === 'student') {
      const allocRes = await db.query(
        `SELECT sa.*, r.route_name, r.route_code, v.bus_number, 
                rs1.stop_name as pickup_stop_name, rs1.morning_pickup_time,
                rs2.stop_name as drop_stop_name, rs2.evening_drop_time,
                bp.pass_number, bp.status as pass_status, bp.valid_until
         FROM student_allocations sa
         JOIN routes r ON sa.route_id = r.id
         JOIN vehicles v ON sa.vehicle_id = v.id
         JOIN route_stops rs1 ON sa.pickup_stop_id = rs1.id
         LEFT JOIN route_stops rs2 ON sa.drop_stop_id = rs2.id
         LEFT JOIN bus_passes bp ON bp.allocation_id = sa.id
         WHERE sa.student_id = $1 AND sa.allocation_status = 'approved'`,
        [user.id]
      );
      extra.allocation = allocRes.rows[0] || null;
    }

    res.json({
      user,
      ...extra
    });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }

    const userRes = await db.query(`SELECT password_hash FROM users WHERE id = $1`, [req.user.id]);
    const match = await bcrypt.compare(currentPassword, userRes.rows[0].password_hash);
    if (!match) {
      return res.status(400).json({ error: 'Incorrect current password.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await db.query(`UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [newHash, req.user.id]);

    await logAudit(req.user.id, 'CHANGE_PASSWORD', 'USER', req.user.id, 'User changed password', req);
    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  login,
  getMe,
  changePassword
};
