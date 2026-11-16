const db = require('../db');
const { logAudit } = require('../middleware/auditLogger');

async function getIncidents(req, res, next) {
  try {
    const { status, severity } = req.query;
    let sql = `
      SELECT i.*,
             u.name as reporter_name, u.role as reporter_role, u.phone as reporter_phone,
             t.trip_code,
             v.bus_number,
             r.route_name
      FROM incidents i
      JOIN users u ON i.reported_by = u.id
      LEFT JOIN trips t ON i.trip_id = t.id
      LEFT JOIN vehicles v ON t.vehicle_id = v.id
      LEFT JOIN routes r ON t.route_id = r.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      sql += ` AND i.status = $${params.length}`;
    }

    if (severity) {
      params.push(severity);
      sql += ` AND i.severity = $${params.length}`;
    }

    sql += ` ORDER BY i.id DESC`;

    const result = await db.query(sql, params);
    res.json({ incidents: result.rows, count: result.rows.length });
  } catch (err) {
    next(err);
  }
}

async function createIncident(req, res, next) {
  try {
    const { trip_id, incident_type, severity, description } = req.body;

    if (!incident_type || !description) {
      return res.status(400).json({ error: 'Incident type and description are required.' });
    }

    const validTypes = ['breakdown', 'traffic_delay', 'accident', 'medical_emergency', 'bad_weather', 'sos'];
    if (!validTypes.includes(incident_type)) {
      return res.status(400).json({ error: `Invalid incident type. Allowed types: ${validTypes.join(', ')}` });
    }

    const sev = severity || (incident_type === 'sos' || incident_type === 'accident' ? 'critical' : 'medium');

    const insertRes = await db.query(
      `INSERT INTO incidents (trip_id, reported_by, incident_type, severity, description, status)
       VALUES ($1, $2, $3, $4, $5, 'open')
       RETURNING *`,
      [trip_id || null, req.user.id, incident_type, sev, description.trim()]
    );

    const incident = insertRes.rows[0];

    // If SOS or breakdown on active trip, optionally update trip status to delayed
    if (trip_id && (incident_type === 'breakdown' || incident_type === 'traffic_delay')) {
      await db.query(`UPDATE trips SET status = 'delayed' WHERE id = $1 AND status = 'in_progress'`, [trip_id]);
    }

    await logAudit(req.user.id, 'REPORT_INCIDENT', 'INCIDENT', incident.id, `Reported ${incident_type} (${sev})`, req);

    res.status(201).json({
      message: 'Incident reported successfully. Operations center has been notified.',
      incident
    });
  } catch (err) {
    next(err);
  }
}

async function resolveIncident(req, res, next) {
  try {
    const { id } = req.params;
    const { resolution_notes, status } = req.body;

    const updateRes = await db.query(
      `UPDATE incidents
       SET status = COALESCE($1, 'resolved'),
           resolution_notes = $2,
           resolved_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [status || 'resolved', resolution_notes || 'Resolved by transport control desk.', id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Incident not found.' });
    }

    await logAudit(req.user.id, 'RESOLVE_INCIDENT', 'INCIDENT', id, `Resolved incident ${id}: ${resolution_notes}`, req);

    res.json({ message: 'Incident resolved successfully', incident: updateRes.rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getIncidents,
  createIncident,
  resolveIncident
};
