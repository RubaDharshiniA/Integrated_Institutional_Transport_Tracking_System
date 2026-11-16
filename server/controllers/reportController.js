const db = require('../db');

async function getDashboardStats(req, res, next) {
  try {
    const vehStats = await db.query(`
      SELECT 
        COUNT(*) as total_vehicles,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_vehicles,
        SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) as maintenance_vehicles,
        SUM(capacity) as total_fleet_capacity
      FROM vehicles
    `);

    const routeStats = await db.query(`
      SELECT COUNT(*) as total_routes,
             SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_routes
      FROM routes
    `);

    const tripStats = await db.query(`
      SELECT 
        COUNT(*) as total_trips_today,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_trips,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_trips,
        SUM(CASE WHEN status = 'delayed' THEN 1 ELSE 0 END) as delayed_trips
      FROM trips
      WHERE trip_date = CURRENT_DATE
    `);

    const allocStats = await db.query(`
      SELECT COUNT(*) as total_students_allocated
      FROM student_allocations
      WHERE allocation_status = 'approved'
    `);

    const incidentStats = await db.query(`
      SELECT 
        COUNT(*) as total_incidents,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_incidents,
        SUM(CASE WHEN severity = 'critical' AND status = 'open' THEN 1 ELSE 0 END) as critical_incidents
      FROM incidents
    `);

    const totalFleetCapacity = parseInt(vehStats.rows[0]?.total_fleet_capacity || 0);
    const allocatedStudents = parseInt(allocStats.rows[0]?.total_students_allocated || 0);
    const fleetOccupancyPct = totalFleetCapacity > 0 ? Math.round((allocatedStudents / totalFleetCapacity) * 100) : 0;

    res.json({
      vehicles: vehStats.rows[0],
      routes: routeStats.rows[0],
      trips_today: tripStats.rows[0],
      allocations: {
        total_students_allocated: allocatedStudents,
        total_fleet_capacity: totalFleetCapacity,
        fleet_occupancy_percentage: fleetOccupancyPct
      },
      incidents: incidentStats.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

async function getAuditLogs(req, res, next) {
  try {
    const { action, entity_type, limit } = req.query;
    let sql = `
      SELECT al.*, u.name as user_name, u.email as user_email, u.role as user_role
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (action) {
      params.push(action);
      sql += ` AND al.action = $${params.length}`;
    }

    if (entity_type) {
      params.push(entity_type);
      sql += ` AND al.entity_type = $${params.length}`;
    }

    sql += ` ORDER BY al.id DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit) || 100);

    const result = await db.query(sql, params);
    res.json({ audit_logs: result.rows, count: result.rows.length });
  } catch (err) {
    next(err);
  }
}

async function exportTripsCsv(req, res, next) {
  try {
    const result = await db.query(`
      SELECT t.id, t.trip_code, t.trip_date, t.trip_type, t.status,
             r.route_code, r.route_name,
             v.bus_number, v.registration_plate,
             u.name as driver_name,
             t.start_time, t.end_time, t.notes
      FROM trips t
      JOIN routes r ON t.route_id = r.id
      JOIN vehicles v ON t.vehicle_id = v.id
      JOIN drivers d ON t.driver_id = d.id
      JOIN users u ON d.user_id = u.id
      ORDER BY t.trip_date DESC, t.id DESC
    `);

    let csv = 'Trip ID,Trip Code,Date,Type,Status,Route Code,Route Name,Bus Number,Plate,Driver,Start Time,End Time,Notes\n';
    for (const r of result.rows) {
      csv += `"${r.id}","${r.trip_code}","${r.trip_date}","${r.trip_type}","${r.status}","${r.route_code}","${r.route_name}","${r.bus_number}","${r.registration_plate}","${r.driver_name}","${r.start_time || ''}","${r.end_time || ''}","${(r.notes || '').replace(/"/g, '""')}"\n`;
    }

    res.header('Content-Type', 'text/csv');
    res.attachment('iitts-trips-report.csv');
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

async function exportAttendanceCsv(req, res, next) {
  try {
    const result = await db.query(`
      SELECT al.id, al.timestamp, al.type,
             t.trip_code, t.trip_date,
             u.name as student_name, u.email as student_email, u.roll_or_emp_id,
             rs.stop_name
      FROM attendance_logs al
      JOIN trips t ON al.trip_id = t.id
      JOIN users u ON al.student_id = u.id
      LEFT JOIN route_stops rs ON al.stop_id = rs.id
      ORDER BY al.timestamp DESC
    `);

    let csv = 'ID,Timestamp,Type,Trip Code,Date,Student Name,Email,Roll ID,Stop Name\n';
    for (const r of result.rows) {
      csv += `"${r.id}","${r.timestamp}","${r.type}","${r.trip_code}","${r.trip_date}","${r.student_name}","${r.student_email}","${r.roll_or_emp_id || ''}","${r.stop_name || ''}"\n`;
    }

    res.header('Content-Type', 'text/csv');
    res.attachment('iitts-attendance-report.csv');
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

async function exportVehiclesCsv(req, res, next) {
  try {
    const result = await db.query(`
      SELECT v.*, u.name as driver_name
      FROM vehicles v
      LEFT JOIN drivers d ON d.assigned_vehicle_id = v.id
      LEFT JOIN users u ON d.user_id = u.id
      ORDER BY v.id ASC
    `);

    let csv = 'ID,Bus Number,Plate,Capacity,Model,Fuel Type,Status,Fitness Expiry,Insurance Expiry,Driver\n';
    for (const r of result.rows) {
      csv += `"${r.id}","${r.bus_number}","${r.registration_plate}","${r.capacity}","${r.model}","${r.fuel_type}","${r.status}","${r.fitness_expiry || ''}","${r.insurance_expiry || ''}","${r.driver_name || ''}"\n`;
    }

    res.header('Content-Type', 'text/csv');
    res.attachment('iitts-vehicles-report.csv');
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDashboardStats,
  getAuditLogs,
  exportTripsCsv,
  exportAttendanceCsv,
  exportVehiclesCsv
};
