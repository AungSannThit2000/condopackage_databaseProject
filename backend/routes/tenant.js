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
        b.building_code
      from tenant t
      join room r on t.room_id = r.room_id
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

    const { status, search } = req.query;
    const filters = ["p.tenant_id = $1"];
    const values = [ctx.tenant_id];
    let idx = 2;

    if (status) {
      filters.push(`p.current_status = $${idx++}`);
      values.push(status);
    }

    if (search) {
      filters.push(`(lower(coalesce(p.tracking_no, '')) like $${idx})`);
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

// GET /tenant/profile : read-only profile info
router.get("/profile", async (req, res) => {
  const ctx = await getTenantContext(req, res);
  if (!ctx) return;
  res.json({ profile: ctx });
});

export default router;
