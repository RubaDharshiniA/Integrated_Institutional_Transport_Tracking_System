-- ============================================================================
-- Integrated Institutional Transport Tracking System - Seed Data (PostgreSQL)
-- ============================================================================

-- 1. Seed Users (Passwords: Admin@123, Manager@123, Driver@123, Student@123)
INSERT INTO users (id, name, email, password_hash, role, phone, department, roll_or_emp_id, status) VALUES
(1, 'System Administrator', 'admin@transport.edu', '$2a$10$aPajnYQtm03Thn4YBaH1eev9ZZOur8UZOUCkfOXLY8GxBxjKiQlE.', 'admin', '+1-555-0101', 'IT Operations', 'EMP-ADM-01', 'active'),
(2, 'Ruba (Transport Manager)', 'manager@transport.edu', '$2a$10$vT8P37G3GjlwG.hYtQPrj.HsQFtmAH1t3HOjqwoxU9dd.v5H6RoQu', 'manager', '+1-555-0102', 'Transport & Logistics', 'EMP-MGR-02', 'active'),
(3, 'Siva (Lead Driver)', 'driver@transport.edu', '$2a$10$w9iLibZlZSBM5mJOyB02heyZ7X4emMJ4rnOhqciRZbLeVDrmkicni', 'driver', '+1-555-0103', 'Fleet Services', 'DRV-101', 'active'),
(4, 'VigneshSree (Driver)', 'mvance@transport.edu', '$2a$10$w9iLibZlZSBM5mJOyB02heyZ7X4emMJ4rnOhqciRZbLeVDrmkicni', 'driver', '+1-555-0104', 'Fleet Services', 'DRV-102', 'active'),
(5, 'Maheswari (Student)', 'student@transport.edu', '$2a$10$1cTnwa08S8vncTexACMsGueB3wxLjS7DwQ9bwEMqMqYVZXq5klFqa', 'student', '+1-555-0105', 'Computer Science', 'STU-2026-001', 'active'),
(6, 'Mathish (Student)', 'dmiller@transport.edu', '$2a$10$1cTnwa08S8vncTexACMsGueB3wxLjS7DwQ9bwEMqMqYVZXq5klFqa', 'student', '+1-555-0106', 'Mechanical Eng', 'STU-2026-002', 'active'),
(7, 'Anu (Student)', 'ewatson@transport.edu', '$2a$10$1cTnwa08S8vncTexACMsGueB3wxLjS7DwQ9bwEMqMqYVZXq5klFqa', 'student', '+1-555-0107', 'Electrical Eng', 'STU-2026-003', 'active'),
(8, 'Ramya (Driver)', 'ramya@transport.edu', '$2a$10$w9iLibZlZSBM5mJOyB02heyZ7X4emMJ4rnOhqciRZbLeVDrmkicni', 'driver', '+1-555-0108', 'Fleet Services', 'DRV-103', 'active'),
(9, 'Keerthi (Student)', 'keerthi@transport.edu', '$2a$10$1cTnwa08S8vncTexACMsGueB3wxLjS7DwQ9bwEMqMqYVZXq5klFqa', 'student', '+1-555-0109', 'Information Tech', 'STU-2026-004', 'active');

-- Set sequence if PostgreSQL
SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));

-- 2. Seed Vehicles
INSERT INTO vehicles (id, bus_number, registration_plate, capacity, model, fuel_type, status, fitness_expiry, insurance_expiry) VALUES
(1, 'BUS-101', 'KA-01-AB-1001', 35, 'Tata Starbus Ultra 35-Seater', 'Diesel', 'active', '2027-12-31', '2027-11-30'),
(2, 'BUS-102', 'KA-01-CD-2002', 40, 'Ashok Leyland Oyster Wide', 'CNG', 'active', '2027-10-15', '2027-09-30'),
(3, 'BUS-103', 'KA-01-EF-3003', 30, 'Eicher Skyline Pro 3009', 'Diesel', 'maintenance', '2026-11-20', '2026-12-15'),
(4, 'BUS-104', 'KA-01-GH-4004', 18, 'Force Traveller Cruiser Mini', 'Electric', 'active', '2028-05-10', '2028-04-25');

SELECT setval('vehicles_id_seq', (SELECT MAX(id) FROM vehicles));

-- 3. Seed Drivers
INSERT INTO drivers (id, user_id, license_number, license_expiry, experience_years, assigned_vehicle_id, shift, status, emergency_contact) VALUES
(1, 3, 'DL-KA-2015-88992', '2028-06-30', 8, 1, 'morning', 'on_duty', '+1-555-9001'),
(2, 4, 'DL-KA-2018-44551', '2029-02-15', 5, 2, 'both', 'available', '+1-555-9002');

SELECT setval('drivers_id_seq', (SELECT MAX(id) FROM drivers));

-- 4. Seed Routes
INSERT INTO routes (id, route_name, route_code, start_location, end_location, total_distance_km, estimated_duration_mins, default_vehicle_id, default_driver_id, status) VALUES
(1, 'Route 1: Central Metro - Tech Corridor - Campus', 'RT-01', 'Central Metro Hub', 'University North Gate', 18.5, 45, 1, 1, 'active'),
(2, 'Route 2: South Suburbs - Electronic City - Campus', 'RT-02', 'Silk Board Junction', 'University Main Campus', 22.0, 55, 2, 2, 'active');

SELECT setval('routes_id_seq', (SELECT MAX(id) FROM routes));

-- 5. Seed Route Stops
INSERT INTO route_stops (id, route_id, stop_name, stop_order, latitude, longitude, morning_pickup_time, evening_drop_time) VALUES
(1, 1, 'Central Metro Station Terminal', 1, 12.971600, 77.594600, '07:15 AM', '05:45 PM'),
(2, 1, 'Trinity Square Junction', 2, 12.973200, 77.620000, '07:30 AM', '05:30 PM'),
(3, 1, 'Indiranagar 100ft Road Circle', 3, 12.978400, 77.640800, '07:45 AM', '05:15 PM'),
(4, 1, 'Tech Innovation Park Gate 2', 4, 12.986000, 77.675000, '08:05 AM', '04:55 PM'),
(5, 1, 'University North Gate', 5, 12.992000, 77.705000, '08:20 AM', '04:40 PM'),
(6, 2, 'Silk Board Flyover Bay', 1, 12.917600, 77.623800, '07:10 AM', '05:50 PM'),
(7, 2, 'HSR Layout Sector 2 Circle', 2, 12.911000, 77.645000, '07:25 AM', '05:35 PM'),
(8, 2, 'Bellandur EcoSpace Crossing', 3, 12.930400, 77.678400, '07:45 AM', '05:15 PM'),
(9, 2, 'University Main Campus Terminal', 4, 12.992000, 77.705000, '08:15 AM', '04:45 PM');

SELECT setval('route_stops_id_seq', (SELECT MAX(id) FROM route_stops));

-- 6. Seed Trips
INSERT INTO trips (id, trip_code, route_id, vehicle_id, driver_id, trip_type, trip_date, status, start_time, current_stop_order, notes) VALUES
(1, 'TRIP-2026-M01', 1, 1, 1, 'morning_pickup', CURRENT_DATE, 'in_progress', CURRENT_TIMESTAMP - INTERVAL '25 minutes', 2, 'Morning commute with 18 confirmed passengers'),
(2, 'TRIP-2026-M02', 2, 2, 2, 'morning_pickup', CURRENT_DATE, 'scheduled', NULL, 0, 'Morning southern line departure scheduled 07:10 AM');

SELECT setval('trips_id_seq', (SELECT MAX(id) FROM trips));

-- 7. Seed Live Location for active Trip 1
INSERT INTO trip_locations (id, trip_id, latitude, longitude, speed_kmh, heading, next_stop_name, timestamp) VALUES
(1, 1, 12.975500, 77.629500, 38.5, 78.0, 'Indiranagar 100ft Road Circle', CURRENT_TIMESTAMP);

SELECT setval('trip_locations_id_seq', (SELECT MAX(id) FROM trip_locations));

-- 8. Seed Student Allocations
INSERT INTO student_allocations (id, student_id, route_id, vehicle_id, pickup_stop_id, drop_stop_id, seat_number, allocation_status) VALUES
(1, 5, 1, 1, 2, 5, 'Seat-12', 'approved'),
(2, 6, 1, 1, 1, 5, 'Seat-05', 'approved'),
(3, 7, 2, 2, 7, 9, 'Seat-08', 'approved');

SELECT setval('student_allocations_id_seq', (SELECT MAX(id) FROM student_allocations));

-- 9. Seed Bus Passes
INSERT INTO bus_passes (id, student_id, allocation_id, pass_number, qr_code_token, valid_from, valid_until, status) VALUES
(1, 5, 1, 'PASS-2026-STU01', 'QR-TOKEN-STU01-SECURE2026', '2026-01-01', '2026-12-31', 'active'),
(2, 6, 2, 'PASS-2026-STU02', 'QR-TOKEN-STU02-SECURE2026', '2026-01-01', '2026-12-31', 'active'),
(3, 7, 3, 'PASS-2026-STU03', 'QR-TOKEN-STU03-SECURE2026', '2026-01-01', '2026-12-31', 'active');

SELECT setval('bus_passes_id_seq', (SELECT MAX(id) FROM bus_passes));

-- 10. Seed Attendance Log
INSERT INTO attendance_logs (id, trip_id, student_id, stop_id, type, timestamp, verified_by_driver) VALUES
(1, 1, 6, 1, 'boarded', CURRENT_TIMESTAMP - INTERVAL '20 minutes', true);

SELECT setval('attendance_logs_id_seq', (SELECT MAX(id) FROM attendance_logs));

-- 11. Seed Absence Requests
INSERT INTO absence_requests (id, student_id, absence_date, trip_type, reason, status) VALUES
(1, 7, CURRENT_DATE, 'morning_pickup', 'Attending off-campus research seminar today', 'notified');

SELECT setval('absence_requests_id_seq', (SELECT MAX(id) FROM absence_requests));

-- 12. Seed Incidents
INSERT INTO incidents (id, trip_id, reported_by, incident_type, severity, description, status) VALUES
(1, 1, 3, 'traffic_delay', 'low', '10-minute congestion near Old Airport Road due to utility roadwork', 'open');

SELECT setval('incidents_id_seq', (SELECT MAX(id) FROM incidents));

-- 13. Seed Maintenance
INSERT INTO maintenance_logs (id, vehicle_id, service_date, service_type, cost, description, performed_by, next_service_due) VALUES
(1, 3, '2026-09-15', 'brake_inspection', 450.00, 'Front brake pads replacement and hydraulic oil top up', 'Apex Fleet AutoCare', '2027-03-15');

SELECT setval('maintenance_logs_id_seq', (SELECT MAX(id) FROM maintenance_logs));

-- 14. Seed Audit Logs
INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details) VALUES
(1, 1, 'SYSTEM_INITIALIZE', 'SYSTEM', '1', 'Initial transport tracking database seeding completed with baseline routes and roles'),
(2, 2, 'DISPATCH_TRIP', 'TRIP', '1', 'Morning pickup trip TRIP-2026-M01 dispatched on Route 1');

SELECT setval('audit_logs_id_seq', (SELECT MAX(id) FROM audit_logs));
