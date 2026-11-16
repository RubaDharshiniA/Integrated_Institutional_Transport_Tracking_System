const db = require('../db');
const crypto = require('crypto');
const { logAudit } = require('../middleware/auditLogger');

async function getAllocations(req, res, next) {
  try {
    const { route_id, vehicle_id, status } = req.query;
    let sql = `
      SELECT sa.*,
             u.name as student_name, u.email as student_email, u.phone as student_phone, u.roll_or_emp_id, u.department,
             r.route_name, r.route_code,
             v.bus_number, v.capacity as vehicle_capacity,
             rs1.stop_name as pickup_stop_name, rs1.morning_pickup_time,
             rs2.stop_name as drop_stop_name, rs2.evening_drop_time,
             bp.pass_number, bp.status as pass_status, bp.valid_until, bp.qr_code_token
      FROM student_allocations sa
      JOIN users u ON sa.student_id = u.id
      JOIN routes r ON sa.route_id = r.id
      JOIN vehicles v ON sa.vehicle_id = v.id
      JOIN route_stops rs1 ON sa.pickup_stop_id = rs1.id
      LEFT JOIN route_stops rs2 ON sa.drop_stop_id = rs2.id
      LEFT JOIN bus_passes bp ON bp.allocation_id = sa.id
      WHERE 1=1
    `;
    const params = [];

    if (route_id) {
      params.push(route_id);
      sql += ` AND sa.route_id = $${params.length}`;
    }

    if (vehicle_id) {
      params.push(vehicle_id);
      sql += ` AND sa.vehicle_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      sql += ` AND sa.allocation_status = $${params.length}`;
    }

    sql += ` ORDER BY sa.id DESC`;

    const result = await db.query(sql, params);
    res.json({ allocations: result.rows, count: result.rows.length });
  } catch (err) {
    next(err);
  }
}

async function getMyAllocation(req, res, next) {
  try {
    const studentId = req.user.id;

    const allocRes = await db.query(
      `SELECT sa.*,
              u.name as student_name, u.email as student_email, u.phone as student_phone, u.roll_or_emp_id, u.department,
              r.route_name, r.route_code, r.start_location, r.end_location,
              v.bus_number, v.registration_plate, v.model as vehicle_model,
              rs1.stop_name as pickup_stop_name, rs1.morning_pickup_time, rs1.latitude as pickup_lat, rs1.longitude as pickup_lng,
              rs2.stop_name as drop_stop_name, rs2.evening_drop_time, rs2.latitude as drop_lat, rs2.longitude as drop_lng,
              bp.id as pass_id, bp.pass_number, bp.status as pass_status, bp.valid_from, bp.valid_until, bp.qr_code_token
       FROM student_allocations sa
       JOIN users u ON sa.student_id = u.id
       JOIN routes r ON sa.route_id = r.id
       JOIN vehicles v ON sa.vehicle_id = v.id
       JOIN route_stops rs1 ON sa.pickup_stop_id = rs1.id
       LEFT JOIN route_stops rs2 ON sa.drop_stop_id = rs2.id
       LEFT JOIN bus_passes bp ON bp.allocation_id = sa.id
       WHERE sa.student_id = $1 AND sa.allocation_status = 'approved'`,
      [studentId]
    );

    if (allocRes.rows.length === 0) {
      return res.json({ allocated: false, message: 'No active transport pass or bus allocation found for your student profile.' });
    }

    const allocation = allocRes.rows[0];

    // Check if there is an active in-progress trip on this route right now
    const tripRes = await db.query(
      `SELECT t.id, t.trip_code, t.status, t.start_time,
              u.name as driver_name, u.phone as driver_phone
       FROM trips t
       JOIN drivers d ON t.driver_id = d.id
       JOIN users u ON d.user_id = u.id
       WHERE t.route_id = $1 AND t.status = 'in_progress'
       ORDER BY t.start_time DESC LIMIT 1`,
      [allocation.route_id]
    );

    res.json({
      allocated: true,
      allocation,
      active_trip: tripRes.rows[0] || null
    });
  } catch (err) {
    next(err);
  }
}

async function createAllocation(req, res, next) {
  try {
    const { student_id, route_id, vehicle_id, pickup_stop_id, drop_stop_id, seat_number } = req.body;

    if (!student_id || !route_id || !vehicle_id || !pickup_stop_id) {
      return res.status(400).json({ error: 'Student ID, route ID, vehicle ID, and pickup stop ID are required.' });
    }

    // 1. Verify student exists and is role='student'
    const studentRes = await db.query(`SELECT id, name, role FROM users WHERE id = $1`, [student_id]);
    if (studentRes.rows.length === 0) {
      return res.status(404).json({ error: 'Student user not found.' });
    }

    // 2. Check if student already has an active allocation
    const existing = await db.query(
      `SELECT id FROM student_allocations WHERE student_id = $1 AND allocation_status = 'approved'`,
      [student_id]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'This student already has an approved active transport allocation.' });
    }

    // 3. CRITICAL BUSINESS RULE: Bus Capacity Enforcement
    const vehRes = await db.query(
      `SELECT v.id, v.capacity, v.bus_number,
              (SELECT COUNT(*) FROM student_allocations sa WHERE sa.vehicle_id = v.id AND sa.allocation_status = 'approved') as current_occupancy
       FROM vehicles v
       WHERE v.id = $1`,
      [vehicle_id]
    );

    if (vehRes.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found.' });
    }

    const { capacity, bus_number, current_occupancy } = vehRes.rows[0];
    const occupancyNum = parseInt(current_occupancy);
    const capacityNum = parseInt(capacity);

    if (occupancyNum >= capacityNum) {
      return res.status(400).json({
        error: `Cannot allocate seat: Bus ${bus_number} has reached maximum seating capacity (${capacityNum} seats). Current occupancy: ${occupancyNum}/${capacityNum}.`
      });
    }

    // Assign seat number if not provided
    const assignedSeat = seat_number || `Seat-${String(occupancyNum + 1).padStart(2, '0')}`;

    // Insert student allocation
    const insertAllocRes = await db.query(
      `INSERT INTO student_allocations (student_id, route_id, vehicle_id, pickup_stop_id, drop_stop_id, seat_number, allocation_status)
       VALUES ($1, $2, $3, $4, $5, $6, 'approved')
       RETURNING *`,
      [student_id, route_id, vehicle_id, pickup_stop_id, drop_stop_id || null, assignedSeat]
    );

    const allocation = insertAllocRes.rows[0];

    // Auto-generate Digital Bus Pass
    const currentYear = new Date().getFullYear();
    const passNumber = `PASS-${currentYear}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const qrToken = `QR-TOKEN-${student_id}-${crypto.randomBytes(8).toString('hex')}`;
    const validUntil = `${currentYear}-12-31`;

    const passRes = await db.query(
      `INSERT INTO bus_passes (student_id, allocation_id, pass_number, qr_code_token, valid_from, valid_until, status)
       VALUES ($1, $2, $3, $4, CURRENT_DATE, $5, 'active')
       RETURNING *`,
      [student_id, allocation.id, passNumber, qrToken, validUntil]
    );

    await logAudit(
      req.user.id,
      'ALLOCATE_STUDENT',
      'STUDENT_ALLOCATION',
      allocation.id,
      `Allocated student ${student_id} to Bus ${bus_number} (Seat: ${assignedSeat})`,
      req
    );

    res.status(201).json({
      message: 'Student transport allocated and digital bus pass generated successfully.',
      allocation,
      bus_pass: passRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

async function updateAllocationStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['approved', 'pending', 'rejected', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Allowed values: ${validStatuses.join(', ')}` });
    }

    const updateRes = await db.query(
      `UPDATE student_allocations SET allocation_status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Allocation not found.' });
    }

    // Update bus pass accordingly
    const passStatus = status === 'approved' ? 'active' : 'suspended';
    await db.query(`UPDATE bus_passes SET status = $1 WHERE allocation_id = $2`, [passStatus, id]);

    await logAudit(req.user.id, 'UPDATE_ALLOCATION_STATUS', 'STUDENT_ALLOCATION', id, `Updated allocation status to ${status}`, req);

    res.json({ message: 'Allocation status updated successfully', allocation: updateRes.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function verifyBusPass(req, res, next) {
  try {
    const { passNumber } = req.params;

    const passRes = await db.query(
      `SELECT bp.*,
              u.name as student_name, u.email as student_email, u.roll_or_emp_id, u.department,
              r.route_name, r.route_code,
              v.bus_number,
              rs1.stop_name as pickup_stop_name,
              sa.seat_number
       FROM bus_passes bp
       JOIN users u ON bp.student_id = u.id
       JOIN student_allocations sa ON bp.allocation_id = sa.id
       JOIN routes r ON sa.route_id = r.id
       JOIN vehicles v ON sa.vehicle_id = v.id
       JOIN route_stops rs1 ON sa.pickup_stop_id = rs1.id
       WHERE bp.pass_number = $1 OR bp.qr_code_token = $1`,
      [passNumber]
    );

    if (passRes.rows.length === 0) {
      return res.status(404).json({ valid: false, error: 'Bus pass not found.' });
    }

    const pass = passRes.rows[0];
    const isDateValid = new Date(pass.valid_until) >= new Date();
    const isValid = pass.status === 'active' && isDateValid;

    res.json({
      valid: isValid,
      status: isValid ? 'VALID' : (pass.status !== 'active' ? pass.status.toUpperCase() : 'EXPIRED'),
      pass
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllocations,
  getMyAllocation,
  createAllocation,
  updateAllocationStatus,
  verifyBusPass
};
