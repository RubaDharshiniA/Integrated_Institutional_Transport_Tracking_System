const db = require('../db');
const { logAudit } = require('../middleware/auditLogger');

async function getVehicles(req, res, next) {
  try {
    const { status } = req.query;
    let sql = `
      SELECT v.*, 
             d.id as driver_id, u.name as driver_name,
             (SELECT COUNT(*) FROM student_allocations sa WHERE sa.vehicle_id = v.id AND sa.allocation_status = 'approved') as allocated_students_count
      FROM vehicles v
      LEFT JOIN drivers d ON d.assigned_vehicle_id = v.id
      LEFT JOIN users u ON d.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      sql += ` AND v.status = $${params.length}`;
    }

    sql += ` ORDER BY v.id ASC`;

    const result = await db.query(sql, params);
    res.json({ vehicles: result.rows, count: result.rows.length });
  } catch (err) {
    next(err);
  }
}

async function createVehicle(req, res, next) {
  try {
    const { bus_number, registration_plate, capacity, model, fuel_type, fitness_expiry, insurance_expiry } = req.body;

    if (!bus_number || !registration_plate || !capacity || !model) {
      return res.status(400).json({ error: 'Bus number, registration plate, capacity, and model are required.' });
    }

    if (parseInt(capacity) <= 0) {
      return res.status(400).json({ error: 'Capacity must be greater than 0.' });
    }

    const insertRes = await db.query(
      `INSERT INTO vehicles (bus_number, registration_plate, capacity, model, fuel_type, status, fitness_expiry, insurance_expiry)
       VALUES ($1, $2, $3, $4, $5, 'active', $6, $7)
       RETURNING *`,
      [bus_number.trim(), registration_plate.trim().toUpperCase(), parseInt(capacity), model.trim(), fuel_type || 'Diesel', fitness_expiry || null, insurance_expiry || null]
    );

    const vehicle = insertRes.rows[0];
    await logAudit(req.user.id, 'CREATE_VEHICLE', 'VEHICLE', vehicle.id, `Created vehicle ${bus_number}`, req);

    res.status(201).json({ message: 'Vehicle created successfully', vehicle });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Bus number or registration plate already exists.' });
    }
    next(err);
  }
}

async function updateVehicle(req, res, next) {
  try {
    const { id } = req.params;
    const { bus_number, registration_plate, capacity, model, fuel_type, status, fitness_expiry, insurance_expiry } = req.body;

    if (capacity && parseInt(capacity) <= 0) {
      return res.status(400).json({ error: 'Capacity must be greater than 0.' });
    }

    const updateRes = await db.query(
      `UPDATE vehicles
       SET bus_number = COALESCE($1, bus_number),
           registration_plate = COALESCE($2, registration_plate),
           capacity = COALESCE($3, capacity),
           model = COALESCE($4, model),
           fuel_type = COALESCE($5, fuel_type),
           status = COALESCE($6, status),
           fitness_expiry = COALESCE($7, fitness_expiry),
           insurance_expiry = COALESCE($8, insurance_expiry)
       WHERE id = $9
       RETURNING *`,
      [
        bus_number || null,
        registration_plate ? registration_plate.toUpperCase() : null,
        capacity ? parseInt(capacity) : null,
        model || null,
        fuel_type || null,
        status || null,
        fitness_expiry || null,
        insurance_expiry || null,
        id
      ]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found.' });
    }

    await logAudit(req.user.id, 'UPDATE_VEHICLE', 'VEHICLE', id, `Updated vehicle ${id}`, req);

    res.json({ message: 'Vehicle updated successfully', vehicle: updateRes.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function deleteVehicle(req, res, next) {
  try {
    const { id } = req.params;
    // Check if vehicle has active trips or allocations
    const tripCheck = await db.query(`SELECT id FROM trips WHERE vehicle_id = $1 AND status IN ('scheduled', 'in_progress')`, [id]);
    if (tripCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Cannot remove vehicle with active or scheduled trips.' });
    }

    await db.query(`UPDATE vehicles SET status = 'out_of_service' WHERE id = $1`, [id]);
    await logAudit(req.user.id, 'DECOMMISSION_VEHICLE', 'VEHICLE', id, `Decommissioned vehicle ${id}`, req);

    res.json({ message: 'Vehicle decommissioned successfully.' });
  } catch (err) {
    next(err);
  }
}

async function getMaintenanceLogs(req, res, next) {
  try {
    const { vehicle_id } = req.query;
    let sql = `
      SELECT m.*, v.bus_number, v.registration_plate
      FROM maintenance_logs m
      JOIN vehicles v ON m.vehicle_id = v.id
      WHERE 1=1
    `;
    const params = [];

    if (vehicle_id) {
      params.push(vehicle_id);
      sql += ` AND m.vehicle_id = $${params.length}`;
    }

    sql += ` ORDER BY m.service_date DESC`;
    const result = await db.query(sql, params);
    res.json({ maintenance_logs: result.rows });
  } catch (err) {
    next(err);
  }
}

async function createMaintenanceLog(req, res, next) {
  try {
    const { vehicle_id, service_date, service_type, cost, description, performed_by, next_service_due, set_in_maintenance } = req.body;

    if (!vehicle_id || !service_date || !service_type) {
      return res.status(400).json({ error: 'Vehicle ID, service date, and service type are required.' });
    }

    const insertRes = await db.query(
      `INSERT INTO maintenance_logs (vehicle_id, service_date, service_type, cost, description, performed_by, next_service_due)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [vehicle_id, service_date, service_type, cost || 0, description || null, performed_by || null, next_service_due || null]
    );

    if (set_in_maintenance) {
      await db.query(`UPDATE vehicles SET status = 'maintenance' WHERE id = $1`, [vehicle_id]);
    }

    await logAudit(req.user.id, 'LOG_MAINTENANCE', 'VEHICLE', vehicle_id, `Logged maintenance: ${service_type}`, req);

    res.status(201).json({ message: 'Maintenance record saved successfully', record: insertRes.rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  getMaintenanceLogs,
  createMaintenanceLog
};
