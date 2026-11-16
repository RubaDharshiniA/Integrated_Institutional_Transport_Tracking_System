const fs = require('fs');
const path = require('path');
const db = require('../db');
const bcrypt = require('bcryptjs');

async function seedDatabase() {
  await db.ensureInit();
  const dbType = db.getDbType();
  console.log(`[SEED] Seeding database (Type: ${dbType})...`);

  if (dbType === 'postgres') {
    const seedPath = path.join(__dirname, '..', '..', 'sql', 'seed.sql');
    const sql = fs.readFileSync(seedPath, 'utf8');
    await db.query(sql);
    console.log('[SEED] PostgreSQL database seeded successfully from seed.sql.');
    return;
  }

  // Pre-hashed passwords for performance
  const adminPass = bcrypt.hashSync('Admin@123', 10);
  const managerPass = bcrypt.hashSync('Manager@123', 10);
  const driverPass = bcrypt.hashSync('Driver@123', 10);
  const studentPass = bcrypt.hashSync('Student@123', 10);

  // 1. Users
  const users = [
    [1, 'System Administrator', 'admin@transport.edu', adminPass, 'admin', '+1-555-0101', 'IT Operations', 'EMP-ADM-01', 'active'],
    [2, 'Ruba (Transport Manager)', 'manager@transport.edu', managerPass, 'manager', '+1-555-0102', 'Transport & Logistics', 'EMP-MGR-02', 'active'],
    [3, 'Siva (Lead Driver)', 'driver@transport.edu', driverPass, 'driver', '+1-555-0103', 'Fleet Services', 'DRV-101', 'active'],
    [4, 'VigneshSree (Driver)', 'mvance@transport.edu', driverPass, 'driver', '+1-555-0104', 'Fleet Services', 'DRV-102', 'active'],
    [5, 'Maheswari (Student)', 'student@transport.edu', studentPass, 'student', '+1-555-0105', 'Computer Science', 'STU-2026-001', 'active'],
    [6, 'Mathish (Student)', 'dmiller@transport.edu', studentPass, 'student', '+1-555-0106', 'Mechanical Eng', 'STU-2026-002', 'active'],
    [7, 'Anu (Student)', 'ewatson@transport.edu', studentPass, 'student', '+1-555-0107', 'Electrical Eng', 'STU-2026-003', 'active'],
    [8, 'Ramya (Driver)', 'ramya@transport.edu', driverPass, 'driver', '+1-555-0108', 'Fleet Services', 'DRV-103', 'active'],
    [9, 'Keerthi (Student)', 'keerthi@transport.edu', studentPass, 'student', '+1-555-0109', 'Information Tech', 'STU-2026-004', 'active']
  ];

  for (const u of users) {
    const exists = await db.query('SELECT id FROM users WHERE id = $1', [u[0]]);
    if (exists.rows.length > 0) {
      await db.query(
        `UPDATE users SET name = $1, email = $2, password_hash = $3, role = $4, phone = $5, department = $6, roll_or_emp_id = $7, status = $8 WHERE id = $9`,
        [u[1], u[2], u[3], u[4], u[5], u[6], u[7], u[8], u[0]]
      );
    } else {
      await db.query(
        `INSERT INTO users (id, name, email, password_hash, role, phone, department, roll_or_emp_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        u
      );
    }
  }

  // 2. Vehicles
  const vehicles = [
    [1, 'BUS-101', 'KA-01-AB-1001', 35, 'Tata Starbus Ultra 35-Seater', 'Diesel', 'active', '2027-12-31', '2027-11-30'],
    [2, 'BUS-102', 'KA-01-CD-2002', 40, 'Ashok Leyland Oyster Wide', 'CNG', 'active', '2027-10-15', '2027-09-30'],
    [3, 'BUS-103', 'KA-01-EF-3003', 30, 'Eicher Skyline Pro 3009', 'Diesel', 'maintenance', '2026-11-20', '2026-12-15'],
    [4, 'BUS-104', 'KA-01-GH-4004', 18, 'Force Traveller Cruiser Mini', 'Electric', 'active', '2028-05-10', '2028-04-25']
  ];

  for (const v of vehicles) {
    await db.query(
      `INSERT OR REPLACE INTO vehicles (id, bus_number, registration_plate, capacity, model, fuel_type, status, fitness_expiry, insurance_expiry)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      v
    );
  }

  // 3. Drivers
  const drivers = [
    [1, 3, 'DL-KA-2015-88992', '2028-06-30', 8, 1, 'morning', 'on_duty', '+1-555-9001'],
    [2, 4, 'DL-KA-2018-44551', '2029-02-15', 5, 2, 'both', 'available', '+1-555-9002']
  ];

  for (const d of drivers) {
    await db.query(
      `INSERT OR REPLACE INTO drivers (id, user_id, license_number, license_expiry, experience_years, assigned_vehicle_id, shift, status, emergency_contact)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      d
    );
  }

  // 4. Routes
  const routes = [
    [1, 'Route 1: Central Metro - Tech Corridor - Campus', 'RT-01', 'Central Metro Hub', 'University North Gate', 18.5, 45, 1, 1, 'active'],
    [2, 'Route 2: South Suburbs - Electronic City - Campus', 'RT-02', 'Silk Board Junction', 'University Main Campus', 22.0, 55, 2, 2, 'active']
  ];

  for (const r of routes) {
    await db.query(
      `INSERT OR REPLACE INTO routes (id, route_name, route_code, start_location, end_location, total_distance_km, estimated_duration_mins, default_vehicle_id, default_driver_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      r
    );
  }

  // 5. Route Stops
  const stops = [
    [1, 1, 'Central Metro Station Terminal', 1, 12.971600, 77.594600, '07:15 AM', '05:45 PM'],
    [2, 1, 'Trinity Square Junction', 2, 12.973200, 77.620000, '07:30 AM', '05:30 PM'],
    [3, 1, 'Indiranagar 100ft Road Circle', 3, 12.978400, 77.640800, '07:45 AM', '05:15 PM'],
    [4, 1, 'Tech Innovation Park Gate 2', 4, 12.986000, 77.675000, '08:05 AM', '04:55 PM'],
    [5, 1, 'University North Gate', 5, 12.992000, 77.705000, '08:20 AM', '04:40 PM'],
    [6, 2, 'Silk Board Flyover Bay', 1, 12.917600, 77.623800, '07:10 AM', '05:50 PM'],
    [7, 2, 'HSR Layout Sector 2 Circle', 2, 12.911000, 77.645000, '07:25 AM', '05:35 PM'],
    [8, 2, 'Bellandur EcoSpace Crossing', 3, 12.930400, 77.678400, '07:45 AM', '05:15 PM'],
    [9, 2, 'University Main Campus Terminal', 4, 12.992000, 77.705000, '08:15 AM', '04:45 PM']
  ];

  for (const s of stops) {
    await db.query(
      `INSERT OR REPLACE INTO route_stops (id, route_id, stop_name, stop_order, latitude, longitude, morning_pickup_time, evening_drop_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      s
    );
  }

  // 6. Trips
  const today = new Date().toISOString().split('T')[0];
  const trips = [
    [1, 'TRIP-2026-M01', 1, 1, 1, 'morning_pickup', today, 'in_progress', new Date(Date.now() - 25 * 60 * 1000).toISOString(), null, 2, 'Morning commute with 18 confirmed passengers'],
    [2, 'TRIP-2026-M02', 2, 2, 2, 'morning_pickup', today, 'scheduled', null, null, 0, 'Morning southern line departure scheduled 07:10 AM']
  ];

  for (const t of trips) {
    await db.query(
      `INSERT OR REPLACE INTO trips (id, trip_code, route_id, vehicle_id, driver_id, trip_type, trip_date, status, start_time, end_time, current_stop_order, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      t
    );
  }

  // 7. Live Trip Locations
  await db.query(
    `INSERT OR REPLACE INTO trip_locations (id, trip_id, latitude, longitude, speed_kmh, heading, next_stop_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [1, 1, 12.975500, 77.629500, 38.5, 78.0, 'Indiranagar 100ft Road Circle']
  );

  // 8. Student Allocations
  const allocations = [
    [1, 5, 1, 1, 2, 5, 'Seat-12', 'approved'],
    [2, 6, 1, 1, 1, 5, 'Seat-05', 'approved'],
    [3, 7, 2, 2, 7, 9, 'Seat-08', 'approved']
  ];

  for (const a of allocations) {
    await db.query(
      `INSERT OR REPLACE INTO student_allocations (id, student_id, route_id, vehicle_id, pickup_stop_id, drop_stop_id, seat_number, allocation_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      a
    );
  }

  // 9. Bus Passes
  const passes = [
    [1, 5, 1, 'PASS-2026-STU01', 'QR-TOKEN-STU01-SECURE2026', '2026-01-01', '2026-12-31', 'active'],
    [2, 6, 2, 'PASS-2026-STU02', 'QR-TOKEN-STU02-SECURE2026', '2026-01-01', '2026-12-31', 'active'],
    [3, 7, 3, 'PASS-2026-STU03', 'QR-TOKEN-STU03-SECURE2026', '2026-01-01', '2026-12-31', 'active']
  ];

  for (const p of passes) {
    await db.query(
      `INSERT OR REPLACE INTO bus_passes (id, student_id, allocation_id, pass_number, qr_code_token, valid_from, valid_until, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      p
    );
  }

  // 10. Attendance Logs
  await db.query(
    `INSERT OR REPLACE INTO attendance_logs (id, trip_id, student_id, stop_id, type, verified_by_driver)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [1, 1, 6, 1, 'boarded', 1]
  );

  // 11. Absence Requests
  await db.query(
    `INSERT OR REPLACE INTO absence_requests (id, student_id, absence_date, trip_type, reason, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [1, 7, today, 'morning_pickup', 'Attending off-campus research seminar today', 'notified']
  );

  // 12. Incidents
  await db.query(
    `INSERT OR REPLACE INTO incidents (id, trip_id, reported_by, incident_type, severity, description, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [1, 1, 3, 'traffic_delay', 'low', '10-minute congestion near Old Airport Road due to utility roadwork', 'open']
  );

  // 13. Maintenance Logs
  await db.query(
    `INSERT OR REPLACE INTO maintenance_logs (id, vehicle_id, service_date, service_type, cost, description, performed_by, next_service_due)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [1, 3, '2026-09-15', 'brake_inspection', 450.00, 'Front brake pads replacement and hydraulic oil top up', 'Apex Fleet AutoCare', '2027-03-15']
  );

  // 14. Audit Logs
  await db.query(
    `INSERT OR REPLACE INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [1, 1, 'SYSTEM_INITIALIZE', 'SYSTEM', '1', 'Initial transport tracking database seeding completed with baseline routes and roles']
  );

  // 15. Notifications & Announcements
  const notifications = [
    [1, 5, 'student', 1, 'delay', '10-Minute Route Delay', 'Bus 101 on Route 1 is currently experiencing minor traffic congestion near Trinity Square.', 'medium', 0],
    [2, null, 'all', null, 'announcement', 'Semester End Transport Schedule', 'Please note that special evening commute trips will operate during final exam week starting next Monday.', 'low', 0],
    [3, 3, 'driver', 1, 'maintenance', 'Scheduled Bus Inspection', 'Bus 101 routine maintenance inspection is due this weekend.', 'low', 0]
  ];

  for (const n of notifications) {
    await db.query(
      `INSERT OR REPLACE INTO notifications (id, user_id, target_role, route_id, category, title, message, priority, is_read)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      n
    );
  }

  console.log('[SEED] SQLite development database successfully seeded with realistic sample data!');
}

if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('[SEED] Seeding script completed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[SEED ERROR]', err);
      process.exit(1);
    });
}

module.exports = seedDatabase;
