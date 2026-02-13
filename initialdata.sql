
BEGIN;

-- Clear existing data and reset identities so IDs start from 1 again
TRUNCATE package_status_log, package, tenant, staff, room, building, user_account
RESTART IDENTITY CASCADE;

INSERT INTO building (building_code, building_name) VALUES
  ('A', 'Building A'),
  ('B', 'Building B');

INSERT INTO room (building_id, room_no, floor, status) VALUES
  (1, '101', 1, 'ACTIVE'),
  (1, '102', 1, 'ACTIVE'),
  (2, '201', 2, 'ACTIVE'),
  (2, '202', 2, 'ACTIVE');

INSERT INTO user_account (username, password, role, status) VALUES
  ('admin',   'admin',   'ADMIN',   'ACTIVE'),
  ('officer', 'officer', 'OFFICER', 'ACTIVE'),
  ('tenant1', 'tenant',  'TENANT',  'ACTIVE'),
  ('tenant2', 'tenant',  'TENANT',  'ACTIVE');

INSERT INTO staff (user_id, full_name, phone, email) VALUES
  (1, 'Admin User',   '0999000001', 'admin@example.com'),
  (2, 'Officer User', '0999000002', 'officer@example.com');

INSERT INTO tenant (user_id, building_id, room_no, full_name, phone, email) VALUES
  (3, 1, '101', 'Aung Sann Thit', '0999000003', 'tenant1@example.com'),
  (4, 1, '102', 'May Thu Chit',   '0999000004', 'tenant2@example.com');

-- Seed packages covering all statuses
INSERT INTO package (tenant_id, received_by_staff_id, tracking_no, carrier, sender_name, arrived_at, current_status, picked_up_at) VALUES
  -- Awaiting pickup
  (1, 2, 'TRACK-ARR-1', 'DHL',   'Shop A', now() - interval '1 day',  'ARRIVED',  NULL),
  -- Already picked up
  (1, 2, 'TRACK-PICK-1','FedEx', 'Shop B', now() - interval '5 days', 'PICKED_UP', now() - interval '2 days'),
  -- Returned to sender
  (2, 2, 'TRACK-RET-1', 'UPS',   'Shop C', now() - interval '10 days','RETURNED', NULL);

-- Status history for the seeded packages
INSERT INTO package_status_log (package_id, updated_by_staff_id, status, note, status_time) VALUES
  (1, 2, 'ARRIVED',   'Seed: awaiting pickup',           now() - interval '1 day'),
  (2, 2, 'ARRIVED',   'Seed: delivered earlier',         now() - interval '5 days'),
  (2, 2, 'PICKED_UP', 'Seed: collected by tenant',       now() - interval '2 days'),
  (3, 2, 'ARRIVED',   'Seed: later returned to sender',  now() - interval '10 days'),
  (3, 2, 'RETURNED',  'Seed: carrier returned to depot', now() - interval '1 day');

COMMIT;
