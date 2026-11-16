const db = require('../db');
const { logAudit } = require('../middleware/auditLogger');

async function checkInStudent(req, res, next) {
  try {
    const { trip_id, student_id, stop_id, type } = req.body;

    if (!trip_id || !student_id) {
      return res.status(400).json({ error: 'Trip ID and Student ID are required.' });
    }

    // Check if already checked in
    const existing = await db.query(
      `SELECT id FROM attendance_logs WHERE trip_id = $1 AND student_id = $2 AND type = $3`,
      [trip_id, student_id, type || 'boarded']
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: `Student is already marked as ${type || 'boarded'} for this trip.` });
    }

    const insertRes = await db.query(
      `INSERT INTO attendance_logs (trip_id, student_id, stop_id, type, verified_by_driver)
       VALUES ($1, $2, $3, $4, 1)
       RETURNING *`,
      [trip_id, student_id, stop_id || null, type || 'boarded']
    );

    res.status(201).json({
      message: `Student marked as ${type || 'boarded'} successfully.`,
      log: insertRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

async function getTripAttendance(req, res, next) {
  try {
    const { tripId } = req.params;

    const result = await db.query(
      `SELECT al.*, u.name as student_name, u.email as student_email, u.roll_or_emp_id, rs.stop_name
       FROM attendance_logs al
       JOIN users u ON al.student_id = u.id
       LEFT JOIN route_stops rs ON al.stop_id = rs.id
       WHERE al.trip_id = $1
       ORDER BY al.timestamp DESC`,
      [tripId]
    );

    res.json({ attendance: result.rows, count: result.rows.length });
  } catch (err) {
    next(err);
  }
}

async function recordAbsence(req, res, next) {
  try {
    const studentId = req.user.id;
    const { absence_date, trip_type, reason } = req.body;

    const dateToUse = absence_date || new Date().toISOString().split('T')[0];

    const insertRes = await db.query(
      `INSERT INTO absence_requests (student_id, absence_date, trip_type, reason, status)
       VALUES ($1, $2, $3, $4, 'notified')
       RETURNING *`,
      [studentId, dateToUse, trip_type || 'both', reason || 'Personal']
    );

    await logAudit(
      studentId,
      'REPORT_ABSENCE',
      'ABSENCE_REQUEST',
      insertRes.rows[0].id,
      `Student marked absence for ${dateToUse} (${trip_type || 'both'})`,
      req
    );

    res.status(201).json({
      message: 'Absence recorded successfully. Your driver has been notified not to stop for pickup.',
      absence: insertRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

async function getMyAbsences(req, res, next) {
  try {
    const studentId = req.user.id;
    const result = await db.query(
      `SELECT * FROM absence_requests WHERE student_id = $1 ORDER BY absence_date DESC`,
      [studentId]
    );
    res.json({ absences: result.rows });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  checkInStudent,
  getTripAttendance,
  recordAbsence,
  getMyAbsences
};
