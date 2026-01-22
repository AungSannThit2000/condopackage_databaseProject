
INSERT INTO building (building_code, building_name)
VALUES
  ('A', 'Building A'),
  ('B', 'Building B');

INSERT INTO room (building_id, room_no, floor)
VALUES
  (1, '101', 1),
  (1, '102', 1),
  (2, '201', 2),
  (2, '202', 2);

INSERT INTO user_account (username, password_hash, role)
VALUES
  ('admin',   'admin',   'ADMIN'),
  ('officer', 'officer', 'OFFICER'),
  ('tenant1', 'tenant',  'TENANT'),
  ('tenant2', 'tenant',  'TENANT');

INSERT INTO staff (user_id, full_name, position)
VALUES
  (1, 'Admin User',   'ADMIN'),
  (2, 'Officer User', 'OFFICER');

INSERT INTO tenant (user_id, room_id, full_name)
VALUES
  (3, 1, 'Aung Sann Thit'),
  (4, 2, 'May Thu Chit');

