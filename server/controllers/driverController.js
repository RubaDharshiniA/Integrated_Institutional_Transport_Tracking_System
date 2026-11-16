const db = require('../db');
const { logAudit } = require('../middleware/auditLogger');

async function getDrivers(req, res, next) {
  try {
    const { status, shift } = req.query;
    let sql = `
      SELECT d.*, 
             u.name, u.email, u.phone, u.department, u.roll_or_emp_id,
             v.bus_number, v.registration_plate, v.model as vehicle_model,
             (SELECT COUNT(*) FROM trips t WHERE t.driver_id = d.id AND t.status = 'in_progress') as active_trips_count
      FROM drivers d
      JOIN users u ON d.user_id = u.id
      LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      sql += ` AND d.status = $${params.length}`;
    }

    if (shift) {
      params.push(shift);
      sql += ` AND d.shift = $${params.length}`;
    }

    sql += ` ORDER BY d.id ASC`;

    const result = await db.query(sql, params);
    res.json({ drivers: result.rows, count: result.rows.length });
  } catch (err) {
    next(err);
  }
}

async function createDriver(req, res, next) {
  try {
    const { user_id, license_number, license_expiry, experience_years, assigned_vehicle_id, shift, emergency_contact } = req.body;

    if (!user_id || !license_number) {
      return res.status(400).json({ error: 'User ID and license number are required.' });
    }

    // Verify user exists and has driver role
    const userRes = await db.query(`SELECT id, role FROM users WHERE id = $1`, [user_id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (userRes.rows[0].role !== 'driver') {
      await db.query(`UPDATE users SET role = 'driver' WHERE id = $1`, [user_id]);
    }

    const insertRes = await db.query(
      `INSERT INTO drivers (user_id, license_number, license_expiry, experience_years, assigned_vehicle_id, shift, emergency_contact, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'available')
       RETURNING *`,
      [user_id, license_number.trim(), license_expiry || null, experience_years || 0, assigned_vehicle_id || null, shift || 'morning', emergency_contact || null]
    );

    const driver = insertRes.rows[0];
    await logAudit(req.user.id, 'CREATE_DRIVER', 'DRIVER', driver.id, `Created driver profile for user ${user_id}`, req);

    res.status(201).json({ message: 'Driver registered successfully', driver });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'License number already registered or driver record exists for this user.' });
    }
    next(err);
  }
}

async function updateDriver(req, res, next) {
  try {
    const { id } = req.params;
    const { license_number, license_expiry, experience_years, assigned_vehicle_id, shift, status, emergency_contact } = req.body;

    const updateRes = await db.query(
      `UPDATE drivers
       SET license_number = COALESCE($1, license_number),
           license_expiry = COALESCE($2, license_expiry),
           experience_years = COALESCE($3, experience_years),
           assigned_vehicle_id = COALESCE($4, assigned_vehicle_id),
           shift = COALESCE($5, shift),
           status = COALESCE($6, status),
           emergency_contact = COALESCE($7, emergency_contact)
       WHERE id = $8
       RETURNING *`,
      [license_number || null, license_expiry || null, experience_years !== undefined ? experience_years : null, assigned_vehicle_id !== undefined ? assigned_vehicle_id : null, shift || null, status || null, emergency_contact || null, id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Driver profile not found.' });
    }

    await logAudit(req.user.id, 'UPDATE_DRIVER', 'DRIVER', id, `Updated driver profile ${id}`, req);

    res.json({ message: 'Driver profile updated successfully', driver: updateRes.rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDrivers,
  createDriver,
  updateDriver
};
