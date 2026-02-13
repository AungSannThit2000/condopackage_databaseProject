/**
 * Tenant routes.
 * Serves tenant dashboard/history data and allows residents to update their own contact profile.
 */

import express from "express";
import jwt from "jsonwebtoken";
import { pool } from "../server.js";

const router = express.Router();

async function getTenantContext(req, res) {
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

    const userId = payload.userId;
    const tenantQ = await pool.query(
      `
      select
        t.tenant_id,
        t.full_name,
        t.phone,
        t.email,
        r.room_no,
        r.floor,
        b.building_code
      from tenant t
      join room r on t.building_id = r.building_id and t.room_no = r.room_no
      join building b on r.building_id = b.building_id
      where t.user_id = $1
      `,
      [userId]
    );

    if (tenantQ.rows.length === 0) {
      res.status(404).json({ message: "Tenant profile not found" });
      return null;
    }

    return tenantQ.rows[0];
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
    return null;
  }
}

// GET /tenant/dashboard
router.get("/dashboard", async (req, res) => {
  try {
    const ctx = await getTenantContext(req, res);
    if (!ctx) return;

    const TENANT_ID = ctx.tenant_id;

    // Cards
    const waitingQ = await pool.query(`
      select count(*)::int as count
      from package
      where tenant_id = $1
        and current_status = 'ARRIVED'
    `, [TENANT_ID]);

    const pickedUpThisMonthQ = await pool.query(`
      select count(*)::int as count
      from package
      where tenant_id = $1
        and current_status = 'PICKED_UP'
        and date_trunc('month', picked_up_at) = date_trunc('month', current_date)
    `, [TENANT_ID]);

    const returnedQ = await pool.query(`
      select count(*)::int as count
      from package
      where tenant_id = $1
        and current_status = 'RETURNED'
    `, [TENANT_ID]);

    // Latest waiting packages table
    const latestWaitingQ = await pool.query(`
      select tracking_no, carrier, current_status, arrived_at
      from package
      where tenant_id = $1
        and current_status = 'ARRIVED'
      order by arrived_at desc
      limit 5
    `, [TENANT_ID]);

    res.json({
      cards: {
        waiting: waitingQ.rows[0].count,
        pickedUpThisMonth: pickedUpThisMonthQ.rows[0].count,
        returned: returnedQ.rows[0].count,
      },
      latestWaiting: latestWaitingQ.rows,
      profile: ctx,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /tenant/packages : history with optional filters
router.get("/packages", async (req, res) => {
  try {
    const ctx = await getTenantContext(req, res);
    if (!ctx) return;

    const { status, search, period, start_date, end_date } = req.query;
    const filters = ["p.tenant_id = $1"];
    const values = [ctx.tenant_id];
    let idx = 2;

    const startDate = start_date;
    const endDate = end_date || (startDate ? new Date().toISOString().slice(0, 10) : null);

    if (startDate) {
      filters.push(`p.arrived_at::date >= $${idx++}`);
      values.push(startDate);
      if (endDate) {
        filters.push(`p.arrived_at::date <= $${idx++}`);
        values.push(endDate);
      }
    } else if (period === "today") {
      filters.push(`p.arrived_at::date = current_date`);
    } else if (period === "last7") {
      filters.push(`p.arrived_at::date >= (current_date - interval '6 days')`);
    } else if (period === "last30") {
      filters.push(`p.arrived_at::date >= (current_date - interval '29 days')`);
    } else if (period === "month") {
      filters.push(`date_trunc('month', p.arrived_at) = date_trunc('month', current_date)`);
    }

    if (status) {
      filters.push(`p.current_status = $${idx++}`);
      values.push(status);
    }

    if (search) {
      filters.push(`(
        lower(coalesce(p.tracking_no, '')) like $${idx}
        or lower(coalesce(p.carrier, '')) like $${idx}
        or lower(coalesce(p.sender_name, '')) like $${idx}
        or lower(p.current_status) like $${idx}
      )`);
      values.push(`%${search.toLowerCase()}%`);
      idx += 1;
    }

    const whereClause = `where ${filters.join(" and ")}`;

    const q = await pool.query(
      `
      select
        p.package_id,
        p.tracking_no,
        p.carrier,
        p.sender_name,
        p.current_status,
        p.arrived_at,
        p.picked_up_at
      from package p
      ${whereClause}
      order by p.arrived_at desc
      limit 200
      `,
      values
    );

    res.json({ packages: q.rows, profile: ctx });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /tenant/packages/:id/logs : status history for a tenant's package
router.get("/packages/:id/logs", async (req, res) => {
  try {
    const ctx = await getTenantContext(req, res);
    if (!ctx) return;

    const pkgId = req.params.id;

    const pkgQ = await pool.query(
      `select package_id, tenant_id, tracking_no from package where package_id = $1`,
      [pkgId]
    );

    if (pkgQ.rows.length === 0) {
      return res.status(404).json({ message: "Package not found" });
    }

    if (pkgQ.rows[0].tenant_id !== ctx.tenant_id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const logQ = await pool.query(
      `
      select
        l.status_time,
        l.status,
        l.note,
        s.full_name as updated_by
      from package_status_log l
      join staff s on l.updated_by_staff_id = s.staff_id
      where l.package_id = $1
      order by l.status_time desc
      `,
      [pkgId]
    );

    res.json({
      package: pkgQ.rows[0],
      logs: logQ.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /tenant/profile : read-only profile info
router.get("/profile", async (req, res) => {
  const ctx = await getTenantContext(req, res);
  if (!ctx) return;
  res.json({ profile: ctx });
});

// PUT /tenant/profile : update contact info (phone/email)
router.put("/profile", async (req, res) => {
  try {
    const ctx = await getTenantContext(req, res);
    if (!ctx) return;

    const { phone, email } = req.body || {};

    const updates = [];
    const values = [];
    let idx = 1;

    if (phone !== undefined) {
      const trimmed = String(phone).trim();
      if (trimmed.length === 0 || trimmed.length > 32) {
        return res.status(400).json({ message: "Phone must be 1-32 characters" });
      }
      updates.push(`phone = $${idx++}`);
      values.push(trimmed);
    }

    if (email !== undefined) {
      const trimmed = String(email).trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmed)) {
        return res.status(400).json({ message: "Invalid email format" });
      }
      updates.push(`email = $${idx++}`);
      values.push(trimmed);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    values.push(ctx.tenant_id);

    await pool.query(
      `update tenant set ${updates.join(", ")} where tenant_id = $${idx}`,
      values
    );

    // Return refreshed profile (building/room unchanged)
    const profile = { ...ctx };
    if (phone !== undefined) profile.phone = String(phone).trim();
    if (email !== undefined) profile.email = String(email).trim();

    res.json({ profile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
