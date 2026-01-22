import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { makePool } from "./db.js";
import authRoutes from "./routes/auth.js";
import officerRoutes from "./routes/officer.js";
import tenantRoutes from "./routes/tenant.js";
import adminRoutes from "./routes/admin.js";



dotenv.config();

const app = express();              // ✅ create app FIRST
app.use(cors());
app.use(express.json());

const pool = makePool(process.env.DATABASE_URL);
export { pool };

// routes
app.use("/auth", authRoutes);       // ✅ now app exists

app.use("/officer", officerRoutes);
app.use("/tenant", tenantRoutes);
app.use("/admin", adminRoutes);


// test route
app.get("/", async (req, res) => {
  const result = await pool.query("select now()");
  res.json({ serverTime: result.rows[0].now });
});

app.listen(process.env.PORT, () => {
  console.log(`Backend running on http://localhost:${process.env.PORT}`);
});
