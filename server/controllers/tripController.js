const db = require('../db');
const { logAudit } = require('../middleware/auditLogger');

async function getTrips(req, res, next) {
  try {
    const { date, status, route_id, driver_id } = req.query;
    let sql = `
      SELECT t.*,
             r.route_name, r.route_code, r.start_location, r.end_location,
             v.bus_number, v.registration_plate, v.capacity as vehicle_capacity,
             u.name as driver_name, u.phone as driver_phone,
             (SELECT COUNT(*) FROM attendance_logs al WHERE al.trip_id = t.id AND al.type = 'boarded') as passengers_boarded_count,
             (SELECT COUNT(*) FROM student_allocations sa WHERE sa.route_id = t.route_id AND sa.allocation_status = 'approved') as total_allocated_passengers
      FROM trips t
      JOIN routes r ON t.route_id = r.id
      JOIN vehicles v ON t.vehicle_id = v.id
      JOIN drivers d ON t.driver_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (date) {
      params.push(date);
      sql += ` AND t.trip_date = $${params.length}`;
    }

    if (status) {
      params.push(status);
      sql += ` AND t.status = $${params.length}`;
    }

    if (route_id) {
      params.push(route_id);
      sql += ` AND t.route_id = $${params.length}`;
    }

    if (driver_id) {
      params.push(driver_id);
      sql += ` AND t.driver_id = $${params.length}`;
    }

    sql += ` ORDER BY t.trip_date DESC, t.id DESC`;

    const result = await db.query(sql, params);
    res.json({ trips: result.rows, count: result.rows.length });
  } catch (err) {
    next(err);
  }
}

async function getActiveTrips(req, res, next) {
  try {
    const sql = `
      SELECT t.*,
             r.route_name, r.route_code,
             v.bus_number, v.registration_plate,
             u.name as driver_name, u.phone as driver_phone,
             tl.latitude as current_latitude, tl.longitude as current_longitude,
             tl.speed_kmh, tl.heading, tl.next_stop_name, tl.timestamp as last_location_update
      FROM trips t
      JOIN routes r ON t.route_id = r.id
      JOIN vehicles v ON t.vehicle_id = v.id
      JOIN drivers d ON t.driver_id = d.id
      JOIN users u ON d.user_id = u.id
      LEFT JOIN (
        SELECT trip_id, latitude, longitude, speed_kmh, heading, next_stop_name, timestamp
        FROM trip_locations
        WHERE id IN (SELECT MAX(id) FROM trip_locations GROUP BY trip_id)
      ) tl ON tl.trip_id = t.id
      WHERE t.status = 'in_progress'
      ORDER BY t.start_time DESC
    `;

    const result = await db.query(sql);
    res.json({ active_trips: result.rows, count: result.rows.length });
  } catch (err) {
    next(err);
  }
}

async function getDriverMyTrips(req, res, next) {
  try {
    // Driver user id is req.user.id
    const driverRes = await db.query(`SELECT id FROM drivers WHERE user_id = $1`, [req.user.id]);
    if (driverRes.rows.length === 0) {
      return res.status(404).json({ error: 'Driver profile not found for this user account.' });
    }
    const driverId = driverRes.rows[0].id;

    const tripsRes = await db.query(
      `SELECT t.*,
              r.route_name, r.route_code, r.start_location, r.end_location,
              v.bus_number, v.registration_plate, v.capacity as vehicle_capacity,
              (SELECT COUNT(*) FROM student_allocations sa WHERE sa.route_id = t.route_id AND sa.allocation_status = 'approved') as total_passengers
       FROM trips t
       JOIN routes r ON t.route_id = r.id
       JOIN vehicles v ON t.vehicle_id = v.id
       WHERE t.driver_id = $1
       ORDER BY t.trip_date DESC, t.id DESC`,
      [driverId]
    );

    res.json({ trips: tripsRes.rows, driverId });
  } catch (err) {
    next(err);
  }
}

async function createTrip(req, res, next) {
  try {
    const { route_id, vehicle_id, driver_id, trip_type, trip_date, notes } = req.body;

    if (!route_id || !vehicle_id || !driver_id || !trip_type || !trip_date) {
      return res.status(400).json({ error: 'Route, vehicle, driver, trip type, and trip date are required.' });
    }

    // Validate vehicle status
    const vehRes = await db.query(`SELECT status, bus_number FROM vehicles WHERE id = $1`, [vehicle_id]);
    if (vehRes.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found.' });
    }
    if (vehRes.rows[0].status !== 'active') {
      return res.status(400).json({ error: `Cannot schedule vehicle ${vehRes.rows[0].bus_number} because its status is '${vehRes.rows[0].status}'.` });
    }

    const tripCode = `TRIP-${Date.now().toString().slice(-6)}-${trip_type.startsWith('morning') ? 'M' : 'E'}`;

    const insertRes = await db.query(
      `INSERT INTO trips (trip_code, route_id, vehicle_id, driver_id, trip_type, trip_date, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', $7)
       RETURNING *`,
      [tripCode, route_id, vehicle_id, driver_id, trip_type, trip_date, notes || null]
    );

    const trip = insertRes.rows[0];
    await logAudit(req.user.id, 'SCHEDULE_TRIP', 'TRIP', trip.id, `Scheduled trip ${tripCode}`, req);

    res.status(201).json({ message: 'Trip scheduled successfully', trip });
  } catch (err) {
    next(err);
  }
}

async function startTrip(req, res, next) {
  try {
    const { id } = req.params;

    const tripRes = await db.query(`SELECT * FROM trips WHERE id = $1`, [id]);
    if (tripRes.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found.' });
    }
    const trip = tripRes.rows[0];

    if (trip.status === 'in_progress') {
      return res.status(400).json({ error: 'Trip is already in progress.' });
    }
    if (trip.status === 'completed') {
      return res.status(400).json({ error: 'Trip has already been completed.' });
    }

    // Business Rule Check: Ensure neither vehicle nor driver is already running another active trip!
    const activeVehTrip = await db.query(
      `SELECT id, trip_code FROM trips WHERE vehicle_id = $1 AND status = 'in_progress' AND id != $2`,
      [trip.vehicle_id, id]
    );
    if (activeVehTrip.rows.length > 0) {
      return res.status(400).json({
        error: `Vehicle is already on an active trip (${activeVehTrip.rows[0].trip_code}). Complete or cancel that trip first.`
      });
    }

    const activeDrvTrip = await db.query(
      `SELECT id, trip_code FROM trips WHERE driver_id = $1 AND status = 'in_progress' AND id != $2`,
      [trip.driver_id, id]
    );
    if (activeDrvTrip.rows.length > 0) {
      return res.status(400).json({
        error: `Driver is already running another active trip (${activeDrvTrip.rows[0].trip_code}). Complete that trip first.`
      });
    }

    // Update trip status to in_progress
    const updateRes = await db.query(
      `UPDATE trips
       SET status = 'in_progress',
           start_time = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    // Update driver status to on_duty
    await db.query(`UPDATE drivers SET status = 'on_duty' WHERE id = $1`, [trip.driver_id]);

    // Check if initial location exists; if not, seed with route's first stop
    const stopRes = await db.query(
      `SELECT * FROM route_stops WHERE route_id = $1 ORDER BY stop_order ASC LIMIT 1`,
      [trip.route_id]
    );
    if (stopRes.rows.length > 0) {
      const firstStop = stopRes.rows[0];
      await db.query(
        `INSERT INTO trip_locations (trip_id, latitude, longitude, speed_kmh, heading, next_stop_name)
         VALUES ($1, $2, $3, 0.0, 0.0, $4)`,
        [id, firstStop.latitude, firstStop.longitude, firstStop.stop_name]
      );
    }

    await logAudit(req.user.id, 'START_TRIP', 'TRIP', id, `Started trip ${trip.trip_code}`, req);

    res.json({ message: 'Trip successfully started', trip: updateRes.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function completeTrip(req, res, next) {
  try {
    const { id } = req.params;

    const tripRes = await db.query(`SELECT * FROM trips WHERE id = $1`, [id]);
    if (tripRes.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found.' });
    }
    const trip = tripRes.rows[0];

    if (trip.status === 'completed') {
      return res.status(400).json({ error: 'Trip is already marked as completed.' });
    }

    const updateRes = await db.query(
      `UPDATE trips
       SET status = 'completed',
           end_time = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    // Set driver back to available
    await db.query(`UPDATE drivers SET status = 'available' WHERE id = $1`, [trip.driver_id]);

    await logAudit(req.user.id, 'COMPLETE_TRIP', 'TRIP', id, `Completed trip ${trip.trip_code}`, req);

    res.json({ message: 'Trip successfully completed', trip: updateRes.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function cancelTrip(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const tripRes = await db.query(`SELECT * FROM trips WHERE id = $1`, [id]);
    if (tripRes.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found.' });
    }
    const trip = tripRes.rows[0];

    await db.query(
      `UPDATE trips SET status = 'cancelled', notes = COALESCE(notes || ' | Cancelled: ' || $1, $1) WHERE id = $2`,
      [reason || 'Cancelled by manager', id]
    );

    await db.query(`UPDATE drivers SET status = 'available' WHERE id = $1`, [trip.driver_id]);
    await logAudit(req.user.id, 'CANCEL_TRIP', 'TRIP', id, `Cancelled trip ${trip.trip_code}: ${reason}`, req);

    res.json({ message: 'Trip cancelled successfully.' });
  } catch (err) {
    next(err);
  }
}

async function getTripManifest(req, res, next) {
  try {
    const { id } = req.params;

    const tripRes = await db.query(
      `SELECT t.*, r.route_name, v.bus_number, v.capacity as vehicle_capacity
       FROM trips t
       JOIN routes r ON t.route_id = r.id
       JOIN vehicles v ON t.vehicle_id = v.id
       WHERE t.id = $1`,
      [id]
    );

    if (tripRes.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found.' });
    }
    const trip = tripRes.rows[0];

    // Fetch all approved student allocations for this route
    const allocRes = await db.query(
      `SELECT sa.id as allocation_id, sa.seat_number, sa.allocation_status,
              u.id as student_id, u.name as student_name, u.email as student_email, u.phone as student_phone, u.roll_or_emp_id,
              rs1.id as pickup_stop_id, rs1.stop_name as pickup_stop_name, rs1.stop_order as pickup_stop_order, rs1.morning_pickup_time,
              rs2.id as drop_stop_id, rs2.stop_name as drop_stop_name, rs2.evening_drop_time,
              bp.pass_number, bp.status as pass_status
       FROM student_allocations sa
       JOIN users u ON sa.student_id = u.id
       JOIN route_stops rs1 ON sa.pickup_stop_id = rs1.id
       LEFT JOIN route_stops rs2 ON sa.drop_stop_id = rs2.id
       LEFT JOIN bus_passes bp ON bp.allocation_id = sa.id
       WHERE sa.route_id = $1 AND sa.allocation_status = 'approved'
       ORDER BY rs1.stop_order ASC, u.name ASC`,
      [trip.route_id]
    );

    // Fetch attendance boarded for this trip
    const attRes = await db.query(`SELECT student_id, stop_id, timestamp FROM attendance_logs WHERE trip_id = $1 AND type = 'boarded'`, [id]);
    const boardedMap = new Map();
    attRes.rows.forEach(a => boardedMap.set(a.student_id, a));

    // Fetch absence requests for today
    const tripDate = trip.trip_date;
    const absRes = await db.query(
      `SELECT student_id, reason, status, trip_type FROM absence_requests 
       WHERE absence_date = $1 AND (trip_type = $2 OR trip_type = 'both')`,
      [tripDate, trip.trip_type]
    );
    const absenceMap = new Map();
    absRes.rows.forEach(a => absenceMap.set(a.student_id, a));

    const manifest = allocRes.rows.map(row => {
      const isBoarded = boardedMap.has(row.student_id);
      const absence = absenceMap.get(row.student_id);

      return {
        ...row,
        boarded: isBoarded,
        boarded_at: isBoarded ? boardedMap.get(row.student_id).timestamp : null,
        is_absent: !!absence,
        absence_reason: absence ? absence.reason : null
      };
    });

    res.json({
      trip,
      manifest,
      total_passengers: manifest.length,
      boarded_count: manifest.filter(m => m.boarded).length,
      absent_count: manifest.filter(m => m.is_absent).length
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getTrips,
  getActiveTrips,
  getDriverMyTrips,
  createTrip,
  startTrip,
  completeTrip,
  cancelTrip,
  getTripManifest
};
