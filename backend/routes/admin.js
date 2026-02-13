/**
 * Admin routes.
 * Central place for building/room/officer/tenant/package management and higher-level system reporting.
 */

import express from "express";
import jwt from "jsonwebtoken";
import { pool } from "../server.js";

const router = express.Router();

async function requireAdmin(req, res) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      res.status(401).json({ message: "Unauthorized" });
      return null;
    }
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      res.status(401).json({ message: "Invalid token" });
      return null;
    }
    if (payload.role !== "ADMIN") {
      res.status(403).json({ message: "Forbidden" });
      return null;
    }
    return payload;
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
    return null;
  }
}

router.get("/summary", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const packagesAtCondoQ = await pool.query(
      `
      select count(*)::int as count
      from package
      where current_status = 'ARRIVED'
      `
    );

    const pickedUpTodayQ = await pool.query(
      `
      select count(*)::int as count
      from package
      where current_status = 'PICKED_UP'
        and picked_up_at::date = current_date
      `
    );

    const returnedThisMonthQ = await pool.query(
      `
      select count(*)::int as count
      from package
      where current_status = 'RETURNED'
        and date_trunc('month', arrived_at) = date_trunc('month', current_date)
      `
    );

    const activeOfficersQ = await pool.query(
      `
      select count(*)::int as count
      from staff s
      join user_account u on s.user_id = u.user_id
      where u.role = 'OFFICER' and u.status = 'ACTIVE'
      `
    );

    const totalUnitsQ = await pool.query(`select count(*)::int as count from room`);
    const tenantsQ = await pool.query(
      `
      select count(*)::int as count
      from tenant t
      join user_account u on t.user_id = u.user_id
      where u.status = 'ACTIVE'
      `
    );
    const totalOfficersQ = await pool.query(
      `
      select
        count(*) filter (where u.role = 'OFFICER')::int as total,
        count(*) filter (where u.role = 'OFFICER' and u.status = 'ACTIVE')::int as active,
        count(*) filter (where u.role = 'OFFICER' and u.status <> 'ACTIVE')::int as inactive
      from staff s
      join user_account u on s.user_id = u.user_id
      `
    );

    res.json({
      cards: {
        activeOfficers: activeOfficersQ.rows[0].count,
        totalUnits: totalUnitsQ.rows[0].count,
        tenantsRegistered: tenantsQ.rows[0].count,
      },
      quickStats: totalOfficersQ.rows[0],
      packageStats: {
        packagesAtCondo: packagesAtCondoQ.rows[0].count,
        pickedUpToday: pickedUpTodayQ.rows[0].count,
        returnedThisMonth: returnedThisMonthQ.rows[0].count,
      },
      systemStatus: "Online",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

async function deleteTenantCascade(client, tenantId) {
  // delete logs -> packages -> tenant -> user
  await client.query(
    `delete from package_status_log where package_id in (select package_id from package where tenant_id = $1)`,
    [tenantId]
  );
  await client.query(`delete from package where tenant_id = $1`, [tenantId]);
  const t = await client.query(`delete from tenant where tenant_id = $1 returning user_id`, [tenantId]);
  if (t.rows.length) {
    await client.query(`delete from user_account where user_id = $1`, [t.rows[0].user_id]);
  }
}

async function deleteStaffCascade(client, staffId) {
  // delete logs -> packages -> staff -> user
  await client.query(`delete from package_status_log where updated_by_staff_id = $1`, [staffId]);
  await client.query(`delete from package_status_log where package_id in (select package_id from package where received_by_staff_id = $1)`, [staffId]);
  await client.query(`delete from package where received_by_staff_id = $1`, [staffId]);
  const s = await client.query(`delete from staff where staff_id = $1 returning user_id`, [staffId]);
  if (s.rows.length) {
    await client.query(`delete from user_account where user_id = $1`, [s.rows[0].user_id]);
  }
}

// Buildings
router.get("/buildings", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const q = await pool.query(
      `
      select b.building_id, b.building_code, b.building_name,
             count(*)::int as room_count
      from building b
      left join room r on b.building_id = r.building_id
      group by b.building_id
      order by b.building_code
      `
    );
    res.json({ buildings: q.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/buildings", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const { building_code, building_name } = req.body;
    const q = await pool.query(
      `
      insert into building (building_code, building_name)
      values ($1, $2)
      returning building_id, building_code, building_name
      `,
      [building_code, building_name || null]
    );
    res.status(201).json({ building: q.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/buildings/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const { id } = req.params;
    const { building_code, building_name } = req.body;
    const q = await pool.query(
      `
      update building
      set building_code = $1,
          building_name = $2
      where building_id = $3
      returning building_id, building_code, building_name
      `,
      [building_code, building_name || null, id]
    );
    if (q.rows.length === 0) return res.status(404).json({ message: "Not found" });
    res.json({ building: q.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/buildings/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query("begin");
    // find tenants in this building
    const tenantIdsQ = await client.query(
      `
      select tenant_id
      from tenant
      where building_id = $1
      `,
      [id]
    );
    for (const row of tenantIdsQ.rows) {
      await deleteTenantCascade(client, row.tenant_id);
    }
    // delete rooms then building
    await client.query(`delete from room where building_id = $1`, [id]);
    const q = await client.query(`delete from building where building_id = $1 returning building_id`, [id]);
    if (q.rows.length === 0) {
      await client.query("rollback");
      return res.status(404).json({ message: "Not found" });
    }
    await client.query("commit");
    res.json({ message: "Deleted" });
  } catch (err) {
    await client.query("rollback");
    console.error(err);
    res.status(500).json({ message: "Cannot delete building (in use?)" });
  } finally {
    client.release();
  }
});

// Rooms
router.get("/rooms", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const q = await pool.query(
      `
      select
        r.room_no,
        r.floor,
        r.status,
        b.building_id,
        b.building_code,
        b.building_name
      from room r
      join building b on r.building_id = b.building_id
      order by b.building_code, r.room_no
      `
    );
    res.json({ rooms: q.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/rooms", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const { building_id, room_no, floor, status } = req.body;
    if (!building_id || !room_no) {
      return res.status(400).json({ message: "building_id and room_no are required" });
    }
    const q = await pool.query(
      `
      insert into room (building_id, room_no, floor, status)
      values ($1, $2, $3, coalesce($4, 'ACTIVE'))
      returning building_id, room_no, floor, status
      `,
      [building_id, room_no, floor || null, status || "ACTIVE"]
    );
    res.status(201).json({ room: q.rows[0] });
  } catch (err) {
    if (err.code === "23503") {
      // foreign key violation (building not found)
      return res.status(400).json({ message: "Building not found for building_id" });
    }
    if (err.code === "23505") {
      // duplicate primary key
      return res.status(409).json({ message: "Room already exists for this building" });
    }
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/rooms/:buildingId/:roomNo", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const { buildingId, roomNo } = req.params;
    const { room_no, floor, status } = req.body;
    const q = await pool.query(
      `
      update room
      set room_no = coalesce($1, room_no),
          floor = $2,
          status = coalesce($3, status)
      where building_id = $4 and room_no = $5
      returning building_id, room_no, floor, status
      `,
      [room_no || roomNo, floor || null, status || null, buildingId, roomNo]
    );
    if (q.rows.length === 0) return res.status(404).json({ message: "Not found" });
    res.json({ room: q.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/rooms/:buildingId/:roomNo", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const client = await pool.connect();
  try {
    const { buildingId, roomNo } = req.params;
    await client.query("begin");
    const tenantIdsQ = await client.query(
      `select tenant_id from tenant where building_id = $1 and room_no = $2`,
      [buildingId, roomNo]
    );
    for (const row of tenantIdsQ.rows) {
      await deleteTenantCascade(client, row.tenant_id);
    }
    const q = await client.query(
      `delete from room where building_id = $1 and room_no = $2 returning building_id`,
      [buildingId, roomNo]
    );
    if (q.rows.length === 0) {
      await client.query("rollback");
      return res.status(404).json({ message: "Not found" });
    }
    await client.query("commit");
    res.json({ message: "Deleted" });
  } catch (err) {
    await client.query("rollback");
    console.error(err);
    res.status(500).json({ message: "Cannot delete room (in use?)" });
  } finally {
    client.release();
  }
});

// Tenants
router.get("/tenants", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const q = await pool.query(
      `
      select
        t.tenant_id,
        t.full_name,
        t.phone,
        t.email,
        u.username,
        u.status,
        r.room_no,
        r.floor,
        b.building_code,
        b.building_id
      from tenant t
      join user_account u on t.user_id = u.user_id
      join room r on t.building_id = r.building_id and t.room_no = r.room_no
      join building b on r.building_id = b.building_id
      order by b.building_code, r.room_no
      `
    );
    res.json({ tenants: q.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/tenants", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const client = await pool.connect();
  try {
    const { username, password, full_name, phone, email, building_id, room_no } = req.body;
    await client.query("begin");
    const userQ = await client.query(
      `
      insert into user_account (username, password, role, status)
      values ($1, $2, 'TENANT', 'ACTIVE')
      returning user_id
      `,
      [username, password]
    );
    const userId = userQ.rows[0].user_id;
    const tenantQ = await client.query(
      `
      insert into tenant (user_id, building_id, room_no, full_name, phone, email)
      values ($1, $2, $3, $4, $5, $6)
      returning tenant_id
      `,
      [userId, building_id, room_no, full_name, phone || null, email || null]
    );
    await client.query("commit");
    res.status(201).json({ tenant_id: tenantQ.rows[0].tenant_id });
  } catch (err) {
    await client.query("rollback");
    if (err.code === "23505") {
      console.error("Duplicate username when creating tenant:", err.detail);
      return res.status(409).json({ message: "Username already exists" });
    }
    console.error(err);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
});

router.put("/tenants/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { full_name, phone, email, building_id, room_no, status, password } = req.body;
    await client.query("begin");
    const tenantQ = await client.query(
      `
      update tenant
      set full_name = coalesce($1, full_name),
          phone = $2,
          email = $3,
          building_id = coalesce($4, building_id),
          room_no = coalesce($5, room_no)
      where tenant_id = $6
      returning user_id
      `,
      [full_name || null, phone || null, email || null, building_id || null, room_no || null, id]
    );
    if (tenantQ.rows.length === 0) {
      await client.query("rollback");
      return res.status(404).json({ message: "Not found" });
    }
    if (status) {
      await client.query(`update user_account set status = $1 where user_id = $2`, [
        status,
        tenantQ.rows[0].user_id,
      ]);
    }
    if (password) {
      await client.query(`update user_account set password = $1 where user_id = $2`, [
        password,
        tenantQ.rows[0].user_id,
      ]);
    }
    await client.query("commit");
    res.json({ message: "Updated" });
  } catch (err) {
    await client.query("rollback");
    console.error(err);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
});

router.delete("/tenants/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query("begin");
    await deleteTenantCascade(client, id);
    await client.query("commit");
    res.json({ message: "Deleted" });
  } catch (err) {
    await client.query("rollback");
    console.error(err);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
});

// Officers
router.get("/officers", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const q = await pool.query(
      `
      select
        s.staff_id,
        s.full_name,
        s.phone,
        s.email,
        u.username,
        u.status
      from staff s
      join user_account u on s.user_id = u.user_id
      where u.role = 'OFFICER'
      order by s.full_name
      `
    );
    res.json({ officers: q.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/officers", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const client = await pool.connect();
  try {
    const { username, password, full_name, phone, email } = req.body;
    await client.query("begin");
    const userQ = await client.query(
      `
      insert into user_account (username, password, role, status)
      values ($1, $2, 'OFFICER', 'ACTIVE')
      returning user_id
      `,
      [username, password]
    );
    const staffQ = await client.query(
      `
      insert into staff (user_id, full_name, phone, email)
      values ($1, $2, $3, $4)
      returning staff_id
      `,
      [userQ.rows[0].user_id, full_name, phone || null, email || null]
    );
    await client.query("commit");
    res.status(201).json({ staff_id: staffQ.rows[0].staff_id });
  } catch (err) {
    await client.query("rollback");
    if (err.code === "23505") {
      console.error("Duplicate username when creating officer:", err.detail);
      return res.status(409).json({ message: "Username already exists" });
    }
    console.error(err);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
});

router.put("/officers/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { full_name, phone, email, status, password } = req.body;
    await client.query("begin");
    const staffQ = await client.query(
      `
      update staff
      set full_name = coalesce($1, full_name),
          phone = $2,
          email = $3
      where staff_id = $4
      returning user_id
      `,
      [full_name || null, phone || null, email || null, id]
    );
    if (staffQ.rows.length === 0) {
      await client.query("rollback");
      return res.status(404).json({ message: "Not found" });
    }
    if (status) {
      await client.query(`update user_account set status = $1 where user_id = $2`, [
        status,
        staffQ.rows[0].user_id,
      ]);
    }
    if (password) {
      await client.query(`update user_account set password = $1 where user_id = $2`, [
        password,
        staffQ.rows[0].user_id,
      ]);
    }
    await client.query("commit");
    res.json({ message: "Updated" });
  } catch (err) {
    await client.query("rollback");
    console.error(err);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
});

router.delete("/officers/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query("begin");
    await deleteStaffCascade(client, id);
    await client.query("commit");
    res.json({ message: "Deleted" });
  } catch (err) {
    await client.query("rollback");
    console.error(err);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
});

// Packages
router.get("/packages", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const { status, period, start_date, end_date } = req.query;
    const filters = [];
    const values = [];
    let idx = 1;
    if (status) {
      filters.push(`p.current_status = $${idx++}`);
      values.push(status);
    }

    const startDate = start_date;
    const endDate = end_date || (startDate ? new Date().toISOString().slice(0, 10) : null);

    if (startDate) {
      filters.push(`p.arrived_at::date >= $${idx++}`);
      values.push(startDate);
      if (endDate) {
        filters.push(`p.arrived_at::date <= $${idx++}`);
        values.push(endDate);
      }
    } else if (period === "last7") {
      filters.push(`p.arrived_at::date >= (current_date - interval '6 days')`);
    } else if (period === "last30") {
      filters.push(`p.arrived_at::date >= (current_date - interval '29 days')`);
    } else if (period === "month") {
      filters.push(`date_trunc('month', p.arrived_at) = date_trunc('month', current_date)`);
    }
    const whereClause = filters.length ? `where ${filters.join(" and ")}` : "";
    const q = await pool.query(
      `
      select
        p.package_id,
        p.tracking_no,
        p.carrier,
        p.current_status,
        p.arrived_at,
        p.picked_up_at,
        t.full_name as tenant_name,
        b.building_code,
        r.room_no
      from package p
      join tenant t on p.tenant_id = t.tenant_id
      join room r on t.building_id = r.building_id and t.room_no = r.room_no
      join building b on r.building_id = b.building_id
      ${whereClause}
      order by p.arrived_at desc
      limit 300
      `,
      values
    );
    res.json({ packages: q.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/packages/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const { id } = req.params;
    const q = await pool.query(
      `
      select
        p.package_id,
        p.tracking_no,
        p.carrier,
        p.current_status,
        p.arrived_at,
        p.picked_up_at,
        t.full_name as tenant_name,
        b.building_code,
        r.room_no,
        s.full_name as handled_by_staff
      from package p
      join tenant t on p.tenant_id = t.tenant_id
      join room r on t.building_id = r.building_id and t.room_no = r.room_no
      join building b on r.building_id = b.building_id
      left join staff s on p.received_by_staff_id = s.staff_id
      where p.package_id = $1
      `,
      [id]
    );
    if (q.rows.length === 0) return res.status(404).json({ message: "Not found" });
    const logQ = await pool.query(
      `
      select status, note, status_time, updated_by_staff_id
      from package_status_log
      where package_id = $1
      order by status_time desc
      limit 1
      `,
      [id]
    );
    res.json({ package: q.rows[0], latestNote: logQ.rows[0]?.note || "" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/packages", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  return res.status(403).json({ message: "Admins cannot create packages; please use officer workflow." });
});

router.patch("/packages/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const { id } = req.params;
    const { status, note, staff_id } = req.body;
    if (!staff_id) return res.status(400).json({ message: "staff_id required for logging" });
    const allowed = ["ARRIVED", "PICKED_UP", "RETURNED"];
    if (status && !allowed.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    let pickedUpSql = "picked_up_at";
    if (status === "PICKED_UP") {
      pickedUpSql = "now()";
    } else if (status === "ARRIVED") {
      pickedUpSql = "null";
    }
    const upd = await pool.query(
      `
      update package
      set current_status = coalesce($1, current_status),
          picked_up_at = ${status ? pickedUpSql : "picked_up_at"}
      where package_id = $2
      returning package_id, current_status
      `,
      [status || null, id]
    );
    if (upd.rows.length === 0) return res.status(404).json({ message: "Not found" });
    await pool.query(
      `
      insert into package_status_log (package_id, updated_by_staff_id, status, note)
      values ($1, $2, $3, $4)
      `,
      [id, staff_id, status || upd.rows[0].current_status, note || ""]
    );
    res.json({ message: "Updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/packages/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query("begin");
    await client.query(`delete from package_status_log where package_id = $1`, [id]);
    const q = await client.query(`delete from package where package_id = $1 returning package_id`, [id]);
    if (q.rows.length === 0) {
      await client.query("rollback");
      return res.status(404).json({ message: "Not found" });
    }
    await client.query("commit");
    res.json({ message: "Deleted" });
  } catch (err) {
    await client.query("rollback");
    console.error(err);
    res.status(500).json({ message: "Cannot delete package (in use?)" });
  } finally {
    client.release();
  }
});

// Package log
router.get("/package-log", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const { status } = req.query;
    const filters = [];
    const values = [];
    let idx = 1;
    if (status) {
      filters.push(`psl.status = $${idx++}`);
      values.push(status);
    }
    const whereClause = filters.length ? `where ${filters.join(" and ")}` : "";
    const q = await pool.query(
      `
      select
        psl.status,
        psl.status_time,
        psl.note,
        p.package_id,
        p.tracking_no,
        t.full_name as tenant_name,
        b.building_code,
        r.room_no,
        s.full_name as updated_by
      from package_status_log psl
      join package p on psl.package_id = p.package_id
      join tenant t on p.tenant_id = t.tenant_id
      join room r on t.building_id = r.building_id and t.room_no = r.room_no
      join building b on r.building_id = b.building_id
      left join staff s on psl.updated_by_staff_id = s.staff_id
      ${whereClause}
      order by psl.status_time desc
      limit 400
      `,
      values
    );
    res.json({ logs: q.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
