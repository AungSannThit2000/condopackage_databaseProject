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
  building_id BIGINT NOT NULL REFERENCES building(building_id),
  room_no TEXT NOT NULL,
  floor INT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (building_id, room_no)
);

-- TENANT PROFILE (each tenant must have a room)
CREATE TABLE tenant (
  tenant_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT UNIQUE NOT NULL REFERENCES user_account(user_id),
  building_id BIGINT NOT NULL,
  room_no TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  CONSTRAINT fk_tenant_room FOREIGN KEY (building_id, room_no) REFERENCES room(building_id, room_no),
  CONSTRAINT tenant_one_per_room UNIQUE (building_id, room_no)
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
  current_status TEXT NOT NULL CHECK (current_status IN ('ARRIVED','PICKED_UP','RETURNED')),
  picked_up_at TIMESTAMPTZ
);

CREATE TABLE package_status_log (
  package_id BIGINT NOT NULL REFERENCES package(package_id),
  updated_by_staff_id BIGINT NOT NULL REFERENCES staff(staff_id),
  status TEXT NOT NULL,
  status_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT,
  PRIMARY KEY (package_id, status_time)
);
