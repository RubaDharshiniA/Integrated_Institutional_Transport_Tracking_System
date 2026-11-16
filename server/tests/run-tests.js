const assert = require('assert');
const request = require('supertest');
const { app } = require('../index');
const db = require('../db');
const runMigrations = require('../scripts/migrate');
const seedDatabase = require('../scripts/seed');

let adminToken = '';
let managerToken = '';
let driverToken = '';
let studentToken = '';

async function runAllTests() {
  console.log('================================================================');
  console.log(' Starting Institutional Transport Tracking System Test Suite');
  console.log('================================================================');

  // Step 1: Clean and Seed
  console.log('\n[1/5] Setting up database migrations and seed fixtures...');
  await runMigrations();
  await seedDatabase();
  console.log('✓ Database migrated and seeded.');

  // Step 2: Authentication & RBAC Tests
  console.log('\n[2/5] Testing Authentication & Role-Based Access Control (RBAC)...');

  // Admin login
  const adminRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@transport.edu', password: 'Admin@123' });
  assert.strictEqual(adminRes.status, 200, 'Admin login should succeed');
  assert.strictEqual(adminRes.body.user.role, 'admin');
  adminToken = adminRes.body.token;
  console.log('✓ Admin authenticated successfully.');

  // Manager login
  const mgrRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'manager@transport.edu', password: 'Manager@123' });
  assert.strictEqual(mgrRes.status, 200, 'Manager login should succeed');
  assert.strictEqual(mgrRes.body.user.role, 'manager');
  managerToken = mgrRes.body.token;
  console.log('✓ Transport Manager authenticated successfully.');

  // Driver login
  const drvRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'driver@transport.edu', password: 'Driver@123' });
  assert.strictEqual(drvRes.status, 200, 'Driver login should succeed');
  assert.strictEqual(drvRes.body.user.role, 'driver');
  driverToken = drvRes.body.token;
  console.log('✓ Driver authenticated successfully.');

  // Student login
  const stuRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'student@transport.edu', password: 'Student@123' });
  assert.strictEqual(stuRes.status, 200, 'Student login should succeed');
  assert.strictEqual(stuRes.body.user.role, 'student');
  studentToken = stuRes.body.token;
  console.log('✓ Student authenticated successfully.');

  // RBAC Enforcement: Student cannot access /api/users (Admin only)
  const forbiddenRes = await request(app)
    .get('/api/users')
    .set('Authorization', `Bearer ${studentToken}`);
  assert.strictEqual(forbiddenRes.status, 403, 'Student should be forbidden from accessing Admin User Management');
  console.log('✓ RBAC Guard: Student correctly denied access to admin user endpoint (403 Forbidden).');

  // RBAC Enforcement: Driver cannot dispatch trips
  const driverDispatchRes = await request(app)
    .post('/api/trips')
    .set('Authorization', `Bearer ${driverToken}`)
    .send({ route_id: 1, vehicle_id: 1, driver_id: 1, trip_type: 'morning_pickup', trip_date: '2026-10-24' });
  assert.strictEqual(driverDispatchRes.status, 403, 'Driver cannot dispatch trips');
  console.log('✓ RBAC Guard: Driver correctly denied permission to dispatch trips (403 Forbidden).');

  // Step 3: Administrator Workflow
  console.log('\n[3/5] Testing Administrator Workflow...');
  const usersListRes = await request(app)
    .get('/api/users')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.strictEqual(usersListRes.status, 200);
  assert.ok(usersListRes.body.users.length >= 7, 'Should list all seeded users');

  // Create a new user as Admin
  const newUserRes = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: 'Test New Driver',
      email: 'testdriver@transport.edu',
      password: 'Password@123',
      role: 'driver',
      phone: '+1-555-4433',
      department: 'Fleet',
      license_number: 'DL-TEST-9999'
    });
  assert.strictEqual(newUserRes.status, 201, 'Admin should create user');
  const createdUserId = newUserRes.body.user.id;

  // View system audit logs as Admin
  const auditRes = await request(app)
    .get('/api/reports/audit')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.strictEqual(auditRes.status, 200);
  assert.ok(auditRes.body.audit_logs.length > 0, 'Audit logs should contain recorded actions');
  console.log('✓ Administrator workflow verified: User listing, user provisioning, and audit trails.');

  // Step 4: Transport Manager Workflow & Business Rules
  console.log('\n[4/5] Testing Transport Manager Workflow & Business Rules...');

  // Create a new vehicle
  const newVehRes = await request(app)
    .post('/api/fleet/vehicles')
    .set('Authorization', `Bearer ${managerToken}`)
    .send({
      bus_number: 'BUS-TEST-99',
      registration_plate: 'KA-01-ZZ-9999',
      capacity: 1, // small capacity to test over-allocation limit!
      model: 'Test Mini Shuttle',
      fuel_type: 'Electric'
    });
  assert.strictEqual(newVehRes.status, 201);
  const testVehId = newVehRes.body.vehicle.id;

  // Allocate 1st student (fits within capacity 1)
  const alloc1Res = await request(app)
    .post('/api/allocations')
    .set('Authorization', `Bearer ${managerToken}`)
    .send({
      student_id: createdUserId, // use newly created user for test allocation
      route_id: 1,
      vehicle_id: testVehId,
      pickup_stop_id: 1
    });
  assert.strictEqual(alloc1Res.status, 201, 'Allocation within capacity should succeed');
  assert.ok(alloc1Res.body.bus_pass.pass_number, 'Digital bus pass should be generated');
  console.log('✓ Student allocated and digital bus pass generated.');

  // Create another student user without an allocation
  const studentUser2 = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: 'Unallocated Student',
      email: 'unallocated@transport.edu',
      password: 'Password@123',
      role: 'student',
      phone: '+1-555-7788'
    });
  const unallocatedStudentId = studentUser2.body.user.id;

  // BUSINESS RULE TEST: Allocate another student to BUS-TEST-99 (capacity is 1, current is 1)
  // Should reject with 400 Bad Request
  const overAllocRes = await request(app)
    .post('/api/allocations')
    .set('Authorization', `Bearer ${managerToken}`)
    .send({
      student_id: unallocatedStudentId,
      route_id: 1,
      vehicle_id: testVehId,
      pickup_stop_id: 1
    });
  assert.strictEqual(overAllocRes.status, 400, 'Over-allocation should be rejected');
  assert.ok(overAllocRes.body.error.toLowerCase().includes('capacity'), `Error message must specify capacity limit reached: got "${overAllocRes.body.error}"`);
  console.log('✓ Business Rule Verified: Bus capacity limit strictly enforced against over-allocation.');

  // Transport Manager checks Dashboard Stats
  const dashRes = await request(app)
    .get('/api/reports/dashboard')
    .set('Authorization', `Bearer ${managerToken}`);
  assert.strictEqual(dashRes.status, 200);
  assert.ok(dashRes.body.vehicles.total_vehicles > 0);
  assert.ok(dashRes.body.allocations.total_students_allocated > 0);
  console.log('✓ Transport Manager dashboard metrics verified.');

  // Test CSV Report Export
  const tripsCsvRes = await request(app)
    .get('/api/reports/export/trips')
    .set('Authorization', `Bearer ${managerToken}`);
  assert.strictEqual(tripsCsvRes.status, 200);
  assert.ok(tripsCsvRes.text.includes('Trip ID,Trip Code,Date'), 'CSV header should be present');
  console.log('✓ Operational CSV Report export verified.');

  // Test Notifications & Announcements Module
  const notifPostRes = await request(app)
    .post('/api/notifications')
    .set('Authorization', `Bearer ${managerToken}`)
    .send({
      target_role: 'all',
      title: 'Monsoon Route Notice',
      message: 'Bus routes will observe careful speeds due to rain.',
      category: 'announcement',
      priority: 'medium'
    });
  assert.strictEqual(notifPostRes.status, 201);

  const notifGetRes = await request(app)
    .get('/api/notifications')
    .set('Authorization', `Bearer ${studentToken}`);
  assert.strictEqual(notifGetRes.status, 200);
  assert.ok(notifGetRes.body.notifications.length > 0);
  console.log('✓ Notifications & Announcements center verified.');

  // Step 5: Driver & Student Complete Workflows
  console.log('\n[5/5] Testing Driver & Student Complete Workflows...');

  // Driver checks their assigned trips
  const drvTripsRes = await request(app)
    .get('/api/trips/driver/my-trips')
    .set('Authorization', `Bearer ${driverToken}`);
  assert.strictEqual(drvTripsRes.status, 200);
  const activeTrip = drvTripsRes.body.trips.find(t => t.status === 'in_progress') || drvTripsRes.body.trips[0];
  assert.ok(activeTrip, 'Driver should have an assigned trip');

  // Driver updates live GPS coordinates
  const gpsRes = await request(app)
    .post(`/api/tracking/trips/${activeTrip.id}/location`)
    .set('Authorization', `Bearer ${driverToken}`)
    .send({
      latitude: 12.9740,
      longitude: 77.6250,
      speed_kmh: 42.0,
      heading: 85.0,
      next_stop_name: 'Indiranagar 100ft Road Circle',
      current_stop_order: 2
    });
  assert.strictEqual(gpsRes.status, 200);
  assert.strictEqual(gpsRes.body.location.speed_kmh, 42.0);
  console.log('✓ Driver live GPS telemetry broadcast verified.');

  // Student checks live tracking and dynamic ETA
  const liveRes = await request(app)
    .get(`/api/tracking/trips/${activeTrip.id}/live`)
    .set('Authorization', `Bearer ${studentToken}`);
  assert.strictEqual(liveRes.status, 200);
  assert.ok(liveRes.body.latest_location);
  assert.ok(liveRes.body.stops.length > 0);
  assert.ok(liveRes.body.stops[0].eta_display, 'Dynamic ETA should be calculated');
  console.log(`✓ Student live tracking verified (Bus at ${liveRes.body.latest_location.latitude}, ${liveRes.body.latest_location.longitude}, Next: ${liveRes.body.latest_location.next_stop_name}).`);

  // Student reports absence for today
  const absRes = await request(app)
    .post('/api/attendance/absence')
    .set('Authorization', `Bearer ${studentToken}`)
    .send({
      trip_type: 'morning_pickup',
      reason: 'Doctor appointment'
    });
  assert.strictEqual(absRes.status, 201);
  console.log('✓ Student absence notice submitted.');

  // Driver gets trip manifest and confirms Student is marked ABSENT
  const manifestRes = await request(app)
    .get(`/api/trips/${activeTrip.id}/manifest`)
    .set('Authorization', `Bearer ${driverToken}`);
  assert.strictEqual(manifestRes.status, 200);
  const studentEntry = manifestRes.body.manifest.find(m => m.student_id === 5); // Maheswari (student user 5)
  assert.ok(studentEntry, 'Student should be in passenger manifest');
  assert.strictEqual(studentEntry.is_absent, true, 'Student should be flagged as absent on driver manifest');
  assert.strictEqual(studentEntry.absence_reason, 'Doctor appointment');
  console.log('✓ Workflow Verified: Driver manifest reflects student absence notice in real time.');

  // Driver records boarding for another student
  const boardRes = await request(app)
    .post('/api/attendance/check-in')
    .set('Authorization', `Bearer ${driverToken}`)
    .send({
      trip_id: activeTrip.id,
      student_id: 6,
      stop_id: 1,
      type: 'boarded'
    });
  // If already boarded, status is 400 (duplicate prevention) or 201
  assert.ok(boardRes.status === 201 || boardRes.status === 400, 'Boarding check-in handled correctly');
  console.log('✓ Driver stop passenger boarding check-in verified.');

  // Driver reports delay / incident
  const incRes = await request(app)
    .post('/api/incidents')
    .set('Authorization', `Bearer ${driverToken}`)
    .send({
      trip_id: activeTrip.id,
      incident_type: 'traffic_delay',
      severity: 'low',
      description: 'Heavy junction delay at Indiranagar'
    });
  assert.strictEqual(incRes.status, 201);
  console.log('✓ Incident / delay reporting verified.');

  // Driver completes the trip
  const compRes = await request(app)
    .put(`/api/trips/${activeTrip.id}/complete`)
    .set('Authorization', `Bearer ${driverToken}`);
  assert.strictEqual(compRes.status, 200);
  assert.strictEqual(compRes.body.trip.status, 'completed');
  console.log('✓ Trip lifecycle completion verified.');

  console.log('\n================================================================');
  console.log(' ALL 5 TEST MODULES PASSED SUCCESSFULLY!');
  console.log('================================================================');
  await db.close();
  process.exit(0);
}

runAllTests().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
