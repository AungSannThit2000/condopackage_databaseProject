-- USER ACCOUNT
CREATE TABLE user_account (
  user_id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('TENANT','OFFICER','ADMIN')),
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- BUILDING
CREATE TABLE building (
  building_id BIGSERIAL PRIMARY KEY,
  building_code TEXT UNIQUE NOT NULL,
  building_name TEXT NOT NULL
);

-- ROOM
CREATE TABLE room (
  room_id BIGSERIAL PRIMARY KEY,
  building_id BIGINT NOT NULL REFERENCES building(building_id),
  room_no TEXT NOT NULL,
  floor INT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  UNIQUE(building_id, room_no)
);

-- TENANT PROFILE (each tenant must have a room)
CREATE TABLE tenant (
  tenant_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT UNIQUE NOT NULL REFERENCES user_account(user_id),
  room_id BIGINT NOT NULL REFERENCES room(room_id),
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT
);

-- STAFF PROFILE (officer/admin info; NO room_id)
CREATE TABLE staff (
  staff_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT UNIQUE NOT NULL REFERENCES user_account(user_id),
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT
);

-- PACKAGE (received_by_staff_id points to staff)
CREATE TABLE package (
  package_id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenant(tenant_id),
  received_by_staff_id BIGINT NOT NULL REFERENCES staff(staff_id),
  tracking_no TEXT,
  carrier TEXT,
  sender_name TEXT,
  arrived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_status TEXT NOT NULL CHECK (current_status IN ('ARRIVED','NOTIFIED','PICKED_UP','RETURNED')),
  picked_up_at TIMESTAMPTZ
);

-- PACKAGE STATUS LOG
CREATE TABLE package_status_log (
  log_id BIGSERIAL PRIMARY KEY,
  package_id BIGINT NOT NULL REFERENCES package(package_id),
  updated_by_staff_id BIGINT NOT NULL REFERENCES staff(staff_id),
  status TEXT NOT NULL,
  status_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT
);