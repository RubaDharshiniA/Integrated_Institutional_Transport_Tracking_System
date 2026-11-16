const bcrypt = require('bcryptjs');
const db = require('../db');
const { logAudit } = require('../middleware/auditLogger');

async function getUsers(req, res, next) {
  try {
    const { role, status, search } = req.query;
    let sql = `SELECT id, name, email, role, phone, department, roll_or_emp_id, status, created_at, updated_at FROM users WHERE 1=1`;
    const params = [];

    if (role) {
      params.push(role);
      sql += ` AND role = $${params.length}`;
    }

    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (name ILIKE $${params.length} OR email ILIKE $${params.length} OR roll_or_emp_id ILIKE $${params.length})`;
    }

    sql += ` ORDER BY id ASC`;

    const result = await db.query(sql, params);
    res.json({ users: result.rows, count: result.rows.length });
  } catch (err) {
    next(err);
  }
}

async function createUser(req, res, next) {
  try {
    const { name, email, password, role, phone, department, roll_or_emp_id } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password, and role are required.' });
    }

    const validRoles = ['admin', 'manager', 'driver', 'student'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Allowed roles: ${validRoles.join(', ')}` });
    }

    const existing = await db.query(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [email.trim()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const insertRes = await db.query(
      `INSERT INTO users (name, email, password_hash, role, phone, department, roll_or_emp_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
       RETURNING id, name, email, role, phone, department, roll_or_emp_id, status, created_at`,
      [name.trim(), email.trim(), hash, role, phone || null, department || null, roll_or_emp_id || null]
    );

    const newUser = insertRes.rows[0];

    // If role is driver, also create driver record if license provided
    if (role === 'driver' && req.body.license_number) {
      await db.query(
        `INSERT INTO drivers (user_id, license_number, license_expiry, experience_years, shift, status)
         VALUES ($1, $2, $3, $4, $5, 'available')`,
        [newUser.id, req.body.license_number, req.body.license_expiry || null, req.body.experience_years || 0, req.body.shift || 'morning']
      );
    }

    await logAudit(req.user.id, 'CREATE_USER', 'USER', newUser.id, `Created user ${newUser.email} with role ${role}`, req);

    res.status(201).json({ message: 'User created successfully', user: newUser });
  } catch (err) {
    next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    const { id } = req.params;
    const { name, role, phone, department, roll_or_emp_id, status, password } = req.body;

    const userRes = await db.query(`SELECT * FROM users WHERE id = $1`, [id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    let passwordHash = userRes.rows[0].password_hash;
    if (password && password.trim().length > 0) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    const updateRes = await db.query(
      `UPDATE users 
       SET name = COALESCE($1, name),
           role = COALESCE($2, role),
           phone = COALESCE($3, phone),
           department = COALESCE($4, department),
           roll_or_emp_id = COALESCE($5, roll_or_emp_id),
           status = COALESCE($6, status),
           password_hash = $7,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING id, name, email, role, phone, department, roll_or_emp_id, status, updated_at`,
      [name || null, role || null, phone || null, department || null, roll_or_emp_id || null, status || null, passwordHash, id]
    );

    await logAudit(req.user.id, 'UPDATE_USER', 'USER', id, `Updated user details for ID: ${id}`, req);

    res.json({ message: 'User updated successfully', user: updateRes.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;
    // Protect admin from deleting themselves
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'You cannot deactivate your own account.' });
    }

    await db.query(`UPDATE users SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
    await logAudit(req.user.id, 'DEACTIVATE_USER', 'USER', id, `Deactivated user ID: ${id}`, req);

    res.json({ message: 'User account deactivated successfully.' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getUsers,
  createUser,
  updateUser,
  deleteUser
};
