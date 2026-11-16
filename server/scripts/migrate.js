const fs = require('fs');
const path = require('path');
const db = require('../db');

const SQLITE_SCHEMA = `
PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS maintenance_logs;
DROP TABLE IF EXISTS incidents;
DROP TABLE IF EXISTS absence_requests;
DROP TABLE IF EXISTS attendance_logs;
DROP TABLE IF EXISTS bus_passes;
DROP TABLE IF EXISTS student_allocations;
DROP TABLE IF EXISTS trip_locations;
DROP TABLE IF EXISTS trips;
DROP TABLE IF EXISTS route_stops;
DROP TABLE IF EXISTS routes;
DROP TABLE IF EXISTS drivers;
DROP TABLE IF EXISTS vehicles;
DROP TABLE IF EXISTS users;

PRAGMA foreign_keys = ON;

-- 1. Users
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'driver', 'student')),
    phone TEXT,
    department TEXT,
    roll_or_emp_id TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Vehicles
CREATE TABLE vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bus_number TEXT UNIQUE NOT NULL,
    registration_plate TEXT UNIQUE NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    model TEXT NOT NULL,
    fuel_type TEXT DEFAULT 'Diesel',
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'out_of_service')),
    fitness_expiry DATE,
    insurance_expiry DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Drivers
CREATE TABLE drivers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    license_number TEXT UNIQUE NOT NULL,
    license_expiry DATE,
    experience_years INTEGER DEFAULT 0,
    assigned_vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
    shift TEXT DEFAULT 'morning' CHECK (shift IN ('morning', 'evening', 'both')),
    status TEXT DEFAULT 'available' CHECK (status IN ('available', 'on_duty', 'on_leave')),
    emergency_contact TEXT
);

-- 4. Routes
CREATE TABLE routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_name TEXT NOT NULL,
    route_code TEXT UNIQUE NOT NULL,
    start_location TEXT NOT NULL,
    end_location TEXT NOT NULL,
    total_distance_km REAL DEFAULT 0.0,
    estimated_duration_mins INTEGER DEFAULT 45,
    default_vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
    default_driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Route Stops
CREATE TABLE route_stops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    stop_name TEXT NOT NULL,
    stop_order INTEGER NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    morning_pickup_time TEXT,
    evening_drop_time TEXT,
    UNIQUE (route_id, stop_order)
);

-- 6. Trips
CREATE TABLE trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_code TEXT UNIQUE NOT NULL,
    route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
    driver_id INTEGER NOT NULL REFERENCES drivers(id),
    trip_type TEXT NOT NULL CHECK (trip_type IN ('morning_pickup', 'evening_drop', 'special')),
    trip_date DATE NOT NULL,
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'delayed', 'cancelled')),
    start_time DATETIME,
    end_time DATETIME,
    current_stop_order INTEGER DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. Live Trip Locations
CREATE TABLE trip_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    speed_kmh REAL DEFAULT 0.0,
    heading REAL DEFAULT 0.0,
    next_stop_name TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. Student Transport Allocations
CREATE TABLE student_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    pickup_stop_id INTEGER NOT NULL REFERENCES route_stops(id),
    drop_stop_id INTEGER REFERENCES route_stops(id),
    seat_number TEXT,
    allocation_status TEXT DEFAULT 'approved' CHECK (allocation_status IN ('approved', 'pending', 'rejected', 'cancelled')),
    allocated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (student_id, allocation_status)
);

-- 9. Bus Passes
CREATE TABLE bus_passes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    allocation_id INTEGER NOT NULL REFERENCES student_allocations(id) ON DELETE CASCADE,
    pass_number TEXT UNIQUE NOT NULL,
    qr_code_token TEXT NOT NULL,
    valid_from DATE NOT NULL,
    valid_until DATE NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'suspended')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 10. Attendance Logs
CREATE TABLE attendance_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stop_id INTEGER REFERENCES route_stops(id),
    type TEXT DEFAULT 'boarded' CHECK (type IN ('boarded', 'dropped')),
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    verified_by_driver BOOLEAN DEFAULT 1
);

-- 11. Student Absence Notifications
CREATE TABLE absence_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    absence_date DATE NOT NULL,
    trip_type TEXT DEFAULT 'both' CHECK (trip_type IN ('morning_pickup', 'evening_drop', 'both')),
    reason TEXT,
    status TEXT DEFAULT 'notified' CHECK (status IN ('notified', 'acknowledged')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 12. Incidents & Delays
CREATE TABLE incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL,
    reported_by INTEGER NOT NULL REFERENCES users(id),
    incident_type TEXT NOT NULL CHECK (incident_type IN ('breakdown', 'traffic_delay', 'accident', 'medical_emergency', 'bad_weather', 'sos')),
    severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved')),
    resolution_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME
);

-- 13. Maintenance Logs
CREATE TABLE maintenance_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    service_date DATE NOT NULL,
    service_type TEXT NOT NULL,
    cost REAL DEFAULT 0.0,
    description TEXT,
    performed_by TEXT,
    next_service_due DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 14. Audit Logs
CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details TEXT,
    ip_address TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 15. Notifications & Announcements
CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    target_role TEXT DEFAULT 'all',
    route_id INTEGER REFERENCES routes(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT 'announcement',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    is_read BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

async function runMigrations() {
  await db.ensureInit();
  const dbType = db.getDbType();
  console.log(`[MIGRATION] Running migrations for database type: ${dbType}`);

  if (dbType === 'postgres') {
    const schemaPath = path.join(__dirname, '..', '..', 'sql', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    await db.query(sql);
    console.log('[MIGRATION] PostgreSQL schema migrated successfully.');
  } else {
    // For SQLite, split statements and run sequentially
    const statements = SQLITE_SCHEMA.split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const stmt of statements) {
      try {
        await db.query(stmt);
      } catch (e) {
        console.error('Failed statement:\n', stmt);
        throw e;
      }
    }
    console.log(`[MIGRATION] SQLite schema migrated successfully (${statements.length} statements executed).`);
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('[MIGRATION] All migrations finished cleanly.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[MIGRATION ERROR]', err);
      process.exit(1);
    });
}

module.exports = runMigrations;
