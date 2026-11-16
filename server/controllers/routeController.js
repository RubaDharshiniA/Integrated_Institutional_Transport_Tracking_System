const db = require('../db');
const { logAudit } = require('../middleware/auditLogger');

async function getRoutes(req, res, next) {
  try {
    const { status } = req.query;
    let sql = `
      SELECT r.*,
             v.bus_number, v.capacity as vehicle_capacity,
             u.name as default_driver_name,
             (SELECT COUNT(*) FROM route_stops rs WHERE rs.route_id = r.id) as stops_count,
             (SELECT COUNT(*) FROM student_allocations sa WHERE sa.route_id = r.id AND sa.allocation_status = 'approved') as allocated_students_count
      FROM routes r
      LEFT JOIN vehicles v ON r.default_vehicle_id = v.id
      LEFT JOIN drivers d ON r.default_driver_id = d.id
      LEFT JOIN users u ON d.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      sql += ` AND r.status = $${params.length}`;
    }

    sql += ` ORDER BY r.id ASC`;

    const result = await db.query(sql, params);
    res.json({ routes: result.rows, count: result.rows.length });
  } catch (err) {
    next(err);
  }
}

async function getRouteById(req, res, next) {
  try {
    const { id } = req.params;

    const routeRes = await db.query(
      `SELECT r.*, v.bus_number, v.capacity as vehicle_capacity, u.name as default_driver_name
       FROM routes r
       LEFT JOIN vehicles v ON r.default_vehicle_id = v.id
       LEFT JOIN drivers d ON r.default_driver_id = d.id
       LEFT JOIN users u ON d.user_id = u.id
       WHERE r.id = $1`,
      [id]
    );

    if (routeRes.rows.length === 0) {
      return res.status(404).json({ error: 'Route not found.' });
    }

    const stopsRes = await db.query(
      `SELECT * FROM route_stops WHERE route_id = $1 ORDER BY stop_order ASC`,
      [id]
    );

    res.json({
      route: routeRes.rows[0],
      stops: stopsRes.rows
    });
  } catch (err) {
    next(err);
  }
}

async function createRoute(req, res, next) {
  try {
    const { route_name, route_code, start_location, end_location, total_distance_km, estimated_duration_mins, default_vehicle_id, default_driver_id, stops } = req.body;

    if (!route_name || !route_code || !start_location || !end_location) {
      return res.status(400).json({ error: 'Route name, route code, start location, and end location are required.' });
    }

    const insertRes = await db.query(
      `INSERT INTO routes (route_name, route_code, start_location, end_location, total_distance_km, estimated_duration_mins, default_vehicle_id, default_driver_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
       RETURNING *`,
      [route_name.trim(), route_code.trim().toUpperCase(), start_location.trim(), end_location.trim(), total_distance_km || 0, estimated_duration_mins || 45, default_vehicle_id || null, default_driver_id || null]
    );

    const newRoute = insertRes.rows[0];

    // If stops are provided in the payload, insert them in sequence
    if (Array.isArray(stops) && stops.length > 0) {
      for (let i = 0; i < stops.length; i++) {
        const s = stops[i];
        await db.query(
          `INSERT INTO route_stops (route_id, stop_name, stop_order, latitude, longitude, morning_pickup_time, evening_drop_time)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [newRoute.id, s.stop_name, i + 1, s.latitude || 12.9716, s.longitude || 77.5946, s.morning_pickup_time || null, s.evening_drop_time || null]
        );
      }
    }

    await logAudit(req.user.id, 'CREATE_ROUTE', 'ROUTE', newRoute.id, `Created route ${route_name} (${route_code})`, req);

    res.status(201).json({ message: 'Route created successfully', route: newRoute });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Route code already exists.' });
    }
    next(err);
  }
}

async function updateRoute(req, res, next) {
  try {
    const { id } = req.params;
    const { route_name, route_code, start_location, end_location, total_distance_km, estimated_duration_mins, default_vehicle_id, default_driver_id, status } = req.body;

    const updateRes = await db.query(
      `UPDATE routes
       SET route_name = COALESCE($1, route_name),
           route_code = COALESCE($2, route_code),
           start_location = COALESCE($3, start_location),
           end_location = COALESCE($4, end_location),
           total_distance_km = COALESCE($5, total_distance_km),
           estimated_duration_mins = COALESCE($6, estimated_duration_mins),
           default_vehicle_id = COALESCE($7, default_vehicle_id),
           default_driver_id = COALESCE($8, default_driver_id),
           status = COALESCE($9, status)
       WHERE id = $10
       RETURNING *`,
      [route_name || null, route_code ? route_code.toUpperCase() : null, start_location || null, end_location || null, total_distance_km !== undefined ? total_distance_km : null, estimated_duration_mins !== undefined ? estimated_duration_mins : null, default_vehicle_id !== undefined ? default_vehicle_id : null, default_driver_id !== undefined ? default_driver_id : null, status || null, id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Route not found.' });
    }

    await logAudit(req.user.id, 'UPDATE_ROUTE', 'ROUTE', id, `Updated route ${id}`, req);

    res.json({ message: 'Route updated successfully', route: updateRes.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function deleteRoute(req, res, next) {
  try {
    const { id } = req.params;
    await db.query(`DELETE FROM routes WHERE id = $1`, [id]);
    await logAudit(req.user.id, 'DELETE_ROUTE', 'ROUTE', id, `Deleted route ${id}`, req);
    res.json({ message: 'Route and its stops deleted successfully.' });
  } catch (err) {
    next(err);
  }
}

async function addStop(req, res, next) {
  try {
    const { id } = req.params;
    const { stop_name, stop_order, latitude, longitude, morning_pickup_time, evening_drop_time } = req.body;

    if (!stop_name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Stop name, latitude, and longitude are required.' });
    }

    let order = stop_order;
    if (!order) {
      const maxRes = await db.query(`SELECT MAX(stop_order) as max_order FROM route_stops WHERE route_id = $1`, [id]);
      order = (maxRes.rows[0]?.max_order || 0) + 1;
    }

    const insertRes = await db.query(
      `INSERT INTO route_stops (route_id, stop_name, stop_order, latitude, longitude, morning_pickup_time, evening_drop_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, stop_name.trim(), order, parseFloat(latitude), parseFloat(longitude), morning_pickup_time || null, evening_drop_time || null]
    );

    res.status(201).json({ message: 'Stop added successfully', stop: insertRes.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function deleteStop(req, res, next) {
  try {
    const { stopId } = req.params;
    await db.query(`DELETE FROM route_stops WHERE id = $1`, [stopId]);
    res.json({ message: 'Stop deleted successfully.' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getRoutes,
  getRouteById,
  createRoute,
  updateRoute,
  deleteRoute,
  addStop,
  deleteStop
};
