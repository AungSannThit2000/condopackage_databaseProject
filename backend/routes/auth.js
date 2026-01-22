import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { pool } from "../server.js";


const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    let result;
    try {
      // Try selecting both columns (supports legacy seeds)
      result = await pool.query(
        `
        select user_id, username, password, password_hash, role, status
        from user_account
        where username = $1
        `,
        [username]
      );
    } catch (err) {
      // If password_hash column does not exist, fall back to password only
      if (err.code === "42703") {
        result = await pool.query(
          `
          select user_id, username, password, null as password_hash, role, status
          from user_account
          where username = $1
          `,
          [username]
        );
      } else {
        throw err;
      }
    }

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const user = result.rows[0];

    if (user.status !== "ACTIVE") {
      return res.status(403).json({ error: "Account is not active" });
    }

    // Accept either plaintext password (password) or legacy password_hash column
    const storedPassword = user.password || user.password_hash || "";
    const isBcryptHash = storedPassword.startsWith("$2");

    let isValidPassword = false;
    if (isBcryptHash) {
      isValidPassword = await bcrypt.compare(password, storedPassword);
    } else {
      isValidPassword = password === storedPassword;
    }

    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const token = jwt.sign(
      { userId: user.user_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      token,
      role: user.role
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
