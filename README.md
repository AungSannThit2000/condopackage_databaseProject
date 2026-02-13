# Condo Package Management — Setup Guide

This repo contains a small condo package management system with a Node/Express backend (PostgreSQL) and a React/Vite frontend. Use this guide to set up the database, backend, and frontend on a new machine.

---

## 1) Prerequisites
- Node.js 18+ and npm
- PostgreSQL 14+ (CLI tools `psql` available)
- Git (optional, for cloning)

---

## 2) Database Setup (PostgreSQL)

Create a database and load the schema/data:
```bash
# 1) Create database (name it as you like)
createdb condo_project

# 2) Apply schema (tables)
psql condo_project <<'SQL'
CREATE TABLE user_account (
  user_id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT,           -- supports bcrypt hashes or plaintext (dev)
  password_hash TEXT,      -- legacy column; kept for compatibility
  role TEXT NOT NULL CHECK (role IN ('TENANT','OFFICER','ADMIN')),
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE building (
  building_id BIGSERIAL PRIMARY KEY,
  building_code TEXT UNIQUE NOT NULL,
  building_name TEXT NOT NULL
);

CREATE TABLE room (
  building_id BIGINT NOT NULL REFERENCES building(building_id),
  room_no TEXT NOT NULL,
  floor INT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (building_id, room_no)
);

CREATE TABLE tenant (
  tenant_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT UNIQUE NOT NULL REFERENCES user_account(user_id),
  building_id BIGINT NOT NULL,
  room_no TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  FOREIGN KEY (building_id, room_no) REFERENCES room(building_id, room_no),
  UNIQUE(building_id, room_no)
);

CREATE TABLE staff (
  staff_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT UNIQUE NOT NULL REFERENCES user_account(user_id),
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT
);

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
SQL
```

Seed sample data (from `initialdata.sql`):
```bash
psql condo_project -f initialdata.sql
```

> Default seed credentials (plaintext, dev only):
> - Admin: `admin` / `admin`
> - Officer: `officer` / `officer`
> - Tenants: `tenant1` / `tenant`, `tenant2` / `tenant`

---

## 3) Environment Variables

Create a `.env` file in `backend/`:
```
PORT=4000
DATABASE_URL=postgres://USERNAME:PASSWORD@localhost:5432/condo_project
JWT_SECRET=changeme_dev_secret
```

Create a `.env` file in `frontend/`:
```
VITE_API_BASE_URL=http://localhost:4000
```

Replace `USERNAME`/`PASSWORD` and host/port if your Postgres differs.

---

## 4) Install Dependencies

Backend:
```bash
cd backend
npm install
```

Frontend:
```bash
cd ../frontend
npm install
```

---

## 5) Run the Apps

Backend (Express):
```bash
cd backend
npm run dev
# Backend runs at http://localhost:4000 by default
```

Frontend (React/Vite):
```bash
cd frontend
npm run dev
# Vite will print a local dev URL, e.g. http://localhost:5173
```

Login flows:
- Admin goes to `/admin` (after login).
- Officer goes to `/officer`.
- Tenant goes to `/tenant`.

---

## 6) API Notes (quick reference)
- Auth: `POST /auth/login` with `{ username, password }` returns JWT.
- Admin:
  - CRUD: `/admin/buildings`, `/admin/rooms`, `/admin/tenants`, `/admin/officers`, `/admin/packages`
  - Package log: `/admin/package-log`
  - Package detail: `/admin/packages/:id`
- Officer: `/officer/dashboard`, `/officer/packages`, `/officer/packages/:id`, `/officer/package-log`
- Tenant: `/tenant/dashboard`, `/tenant/packages`, `/tenant/profile`

---

## 7) Common Issues
- 500 on login: ensure `JWT_SECRET` is set and the `user_account` table has either `password` or `password_hash` filled.
- FK delete errors: deletes now cascade via backend endpoints; use admin UI or corresponding DELETE endpoints.
- Wrong role redirect: admin login lands at `/admin`, officer at `/officer`, tenant at `/tenant`.

---

## 8) Project Structure (top-level)
```
backend/    # Express API
frontend/   # React/Vite UI
initialdata.sql  # Seed data
README.md   # This guide
```

You’re ready to run the system on another machine—set up Postgres, add env files, install deps, start backend then frontend, and log in with the seed accounts.
