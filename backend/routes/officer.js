import express from "express";
import jwt from "jsonwebtoken";
import { pool } from "../server.js";

const router = express.Router();

// helper: allowed status list (NOTIFIED removed)
const STATUS_ALLOWED = ["ARRIVED", "PICKED_UP", "RETURNED"];

async function requireOfficer(req, res) {
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
    if (!["OFFICER", "ADMIN"].includes(payload.role)) {
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

// Profile info for header display
router.get("/me", async (req, res) => {
  const payload = await requireOfficer(req, res);
  if (!payload) return;
  try {
    const staffQ = await pool.query(
      `select staff_id, full_name from staff where user_id = $1`,
      [payload.userId]
    );
    if (staffQ.rows.length === 0) {
      return res.status(404).json({ message: "Profile not found" });
    }
    res.json({
      staff_id: staffQ.rows[0].staff_id,
      full_name: staffQ.rows[0].full_name,
      role: payload.role,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/dashboard", async (req, res) => {
  try {
    const { status, unit, date, period, start_date, end_date } = req.query;

    const filters = [];
    const values = [];
    let idx = 1;

    const startDate = start_date;
    const endDate = end_date || (startDate ? new Date().toISOString().slice(0, 10) : null);

    // date/period filter (range takes precedence)
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
    } else if (date) {
      filters.push(`p.arrived_at::date = $${idx++}`);
      values.push(date);
    } else {
      // default today
      filters.push(`p.arrived_at::date = current_date`);
    }

    if (status) {
      filters.push(`p.current_status = $${idx++}`);
      values.push(status);
    }

    if (unit) {
      filters.push(`(b.building_code || r.room_no) = $${idx++}`);
      values.push(unit);
    }

    const whereClause = filters.length ? `where ${filters.join(" and ")}` : "";

    const atCondoQ = await pool.query(`
      select count(*)::int as count
      from package
      where current_status = 'ARRIVED'
    `);

    const pickedUpTodayQ = await pool.query(`
      select count(*)::int as count
      from package
      where current_status = 'PICKED_UP'
        and picked_up_at::date = current_date
    `);

    const returnedThisMonthQ = await pool.query(`
      select count(*)::int as count
      from package
      where current_status = 'RETURNED'
        and date_trunc('month', arrived_at) = date_trunc('month', current_date)
    `);

    const todayPackagesQ = await pool.query(`
      select
        p.package_id,
        p.tracking_no,
        t.full_name as tenant_name,
        b.building_code,
        r.room_no,
        p.current_status,
        p.arrived_at
      from package p
      join tenant t on p.tenant_id = t.tenant_id
      join room r on t.room_id = r.room_id
      join building b on r.building_id = b.building_id
      ${whereClause}
      order by p.arrived_at desc
      limit 50
    `, values);

    const unitsQ = await pool.query(`
      select distinct (b.building_code || r.room_no) as unit
      from room r
      join building b on r.building_id = b.building_id
      order by unit
    `);

    res.json({
      cards: {
        packagesAtCondo: atCondoQ.rows[0].count,
        pickedUpToday: pickedUpTodayQ.rows[0].count,
        returnedThisMonth: returnedThisMonthQ.rows[0].count,
      },
      todayPackages: todayPackagesQ.rows,
      unitOptions: unitsQ.rows.map((u) => u.unit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /officer/package-form : options for add-package form
router.get("/package-form", async (_req, res) => {
  try {
    const buildingsQ = await pool.query(
      `
      select building_id, building_code, building_name
      from building
      order by building_code
      `
    );

    const roomsQ = await pool.query(
      `
      select
        r.room_id,
        r.room_no,
        r.building_id,
        b.building_code,
        b.building_name,
        t.tenant_id,
        t.full_name as tenant_name
      from room r
      join building b on r.building_id = b.building_id
      join tenant t on t.room_id = r.room_id
      order by b.building_code, r.room_no
      `
    );

    res.json({ buildings: buildingsQ.rows, rooms: roomsQ.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /officer/packages : create new package
router.post("/packages", async (req, res) => {
  try {
    const { tracking_no, carrier, tenant_id, status, note, arrived_at } = req.body;

    if (!tenant_id) {
      return res.status(400).json({ message: "tenant_id is required" });
    }

    if (status && !STATUS_ALLOWED.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const STAFF_ID = 1; // TODO: replace with JWT user id
    const effectiveStatus = status || "ARRIVED";

    // ensure tenant exists
    const tenantQ = await pool.query(`select tenant_id from tenant where tenant_id = $1`, [tenant_id]);
    if (tenantQ.rows.length === 0) {
      return res.status(400).json({ message: "Tenant not found" });
    }

    const insertPkg = await pool.query(
      `
      insert into package (tenant_id, received_by_staff_id, tracking_no, carrier, arrived_at, current_status)
      values ($1, $2, $3, $4, coalesce($5, now()), $6)
      returning package_id, current_status, arrived_at
      `,
      [tenant_id, STAFF_ID, tracking_no || null, carrier || null, arrived_at || null, effectiveStatus]
    );

    const pkgId = insertPkg.rows[0].package_id;

    await pool.query(
      `
      insert into package_status_log (package_id, updated_by_staff_id, status, note)
      values ($1, $2, $3, $4)
      `,
      [pkgId, STAFF_ID, effectiveStatus, note || ""]
    );

    res.status(201).json({ message: "Created", package_id: pkgId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /officer/packages/:id
router.get("/packages/:id", async (req, res) => {
  try {
    const packageId = req.params.id;

    const q = await pool.query(
      `
      select
        p.package_id,
        p.tracking_no,
        p.carrier,
        t.full_name as tenant_name,
        (b.building_code || r.room_no) as unit_room,
        p.current_status,
        p.arrived_at,
        p.picked_up_at,
        s.full_name as handled_by_staff
      from package p
      join tenant t on p.tenant_id = t.tenant_id
      join room r on t.room_id = r.room_id
      join building b on r.building_id = b.building_id
      join staff s on p.received_by_staff_id = s.staff_id
      where p.package_id = $1
      `,
      [packageId]
    );

    if (q.rows.length === 0) {
      return res.status(404).json({ message: "Package not found" });
    }

    // latest note (optional)
    const logQ = await pool.query(
      `
      select note
      from package_status_log
      where package_id = $1
      order by status_time desc
      limit 1
      `,
      [packageId]
    );

    res.json({
      package: q.rows[0],
      latestNote: logQ.rows[0]?.note || "",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /officer/package-log : activity feed of all package status changes
router.get("/package-log", async (req, res) => {
  try {
    const { status, unit, date } = req.query;

    const filters = [];
    const values = [];
    let idx = 1;

    if (status) {
      filters.push(`psl.status = $${idx++}`);
      values.push(status);
    }

    if (unit) {
      filters.push(`(b.building_code || r.room_no) = $${idx++}`);
      values.push(unit);
    }

    if (date) {
      filters.push(`psl.status_time::date = $${idx++}`);
      values.push(date);
    }

    const whereClause = filters.length ? `where ${filters.join(" and ")}` : "";

    const logsQ = await pool.query(
      `
      select
        psl.log_id,
        psl.package_id,
        psl.status,
        psl.status_time,
        coalesce(psl.note, '') as note,
        p.tracking_no,
        p.carrier,
        t.full_name as tenant_name,
        b.building_code,
        r.room_no,
        coalesce(s.full_name, 'Unknown') as updated_by
      from package_status_log psl
      join package p on psl.package_id = p.package_id
      join tenant t on p.tenant_id = t.tenant_id
      join room r on t.room_id = r.room_id
      join building b on r.building_id = b.building_id
      left join staff s on psl.updated_by_staff_id = s.staff_id
      ${whereClause}
      order by psl.status_time desc
      limit 200
      `,
      values
    );

    res.json({ logs: logsQ.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// PATCH /officer/packages/:id
router.patch("/packages/:id", async (req, res) => {
  try {
    const packageId = req.params.id;
    const { status, note } = req.body;

    const allowed = ["ARRIVED", "PICKED_UP", "RETURNED"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    // TEMP: use staff_id = 1 (beginner version)
    // Later we will get staff_id from JWT userId
    const STAFF_ID = 1;

    // update package status + picked_up_at
    let pickedUpAtSql = "picked_up_at";
    if (status === "PICKED_UP") {
      pickedUpAtSql = "now()";
    } else if (status === "ARRIVED") {
      pickedUpAtSql = "null";
    }

    const upd = await pool.query(
      `
      update package
      set current_status = $1,
          picked_up_at = ${pickedUpAtSql}
      where package_id = $2
      returning package_id, current_status, picked_up_at
      `,
      [status, packageId]
    );

    if (upd.rows.length === 0) {
      return res.status(404).json({ message: "Package not found" });
    }

    // write status log
    await pool.query(
      `
      insert into package_status_log (package_id, updated_by_staff_id, status, note)
      values ($1, $2, $3, $4)
      `,
      [packageId, STAFF_ID, status, note || ""]
    );

    res.json({ message: "Updated", package: upd.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;  // ✅ THIS LINE MUST EXIST
