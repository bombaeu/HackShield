const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Init DB Table
const initDB = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                level INTEGER DEFAULT 1,
                badges TEXT[] DEFAULT ARRAY['Intro'],
                joined_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                verified BOOLEAN DEFAULT FALSE
            );
        `);

        // Add Streak support if missing
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS streak INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS last_login DATE DEFAULT CURRENT_DATE;
        `);

        console.log("Database initialized.");

        // FORCE RESTORE BOMBA PRIVILEGES (Every startup)
        await pool.query(`
            UPDATE users 
            SET badges = ARRAY['Admin', 'Root'] 
            WHERE username = 'Bomba' OR email = 'reznicekpatrik5@gmail.com'
        `);
        console.log("👮 Bomba permissions ensured.");

        // Create Default Admin if not exists
        const adminCheck = await pool.query("SELECT * FROM users WHERE email = $1", ['reznicekpatrik5@gmail.com']);
        if (adminCheck.rows.length === 0) {
            const salt = await bcrypt.genSalt(10);
            const hash = await bcrypt.hash('944Bm]*owk+36<"d', salt);
            await pool.query(`
                INSERT INTO users (username, email, password_hash, level, badges, verified)
                VALUES ($1, $2, $3, 99, ARRAY['Admin', 'Root'], TRUE)
            `, ['Bomba', 'reznicekpatrik5@gmail.com', hash]);
            console.log("Admin account 'Bomba' restored.");
        }
    } catch (err) {
        console.error("DB Init Error:", err);
    }
};

// API ROUTES

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { loginInput, password } = req.body;
        const result = await pool.query("SELECT * FROM users WHERE email = $1 OR username = $1", [loginInput]);

        if (result.rows.length > 0) {
            const user = result.rows[0];
            const validPass = await bcrypt.compare(password, user.password_hash);
            if (validPass) {
                // Return user info (exclude hash)
                const { password_hash, ...userInfo } = user;
                return res.json({ success: true, user: userInfo });
            }
        }
        res.status(401).json({ success: false, message: "Invalid credentials" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

// Check User Exists (Public)
app.post('/api/check-user', async (req, res) => {
    try {
        const { username, email } = req.body;
        const result = await pool.query("SELECT * FROM users WHERE email = $1 OR username = $2", [email, username]);
        if (result.rows.length > 0) {
            return res.json({ exists: true });
        }
        res.json({ exists: false });
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

// Register
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // SECURITY: Strict Username Validation (No XSS, no special chars)
        // Allowed: a-z, A-Z, 0-9, underscore. Length: 3-20.
        const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
        if (!usernameRegex.test(username)) {
            return res.status(400).json({
                success: false,
                message: "Jméno může obsahovat pouze písmena, čísla a podtržítko (bez mezer)."
            });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        const newUser = await pool.query(
            "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email",
            [username, email, hash]
        );
        res.json({ success: true, user: newUser.rows[0] });
    } catch (err) {
        if (err.code === '23505') { // Unique violation
            return res.status(400).json({ success: false, message: "User exists" });
        }
        res.status(500).json({ error: "Server error" });
    }
});

// Refresh User Data (Get latest badges/roles)
app.post('/api/refresh-user', async (req, res) => {
    try {
        const { id } = req.body;
        const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);

        if (result.rows.length > 0) {
            res.json({ success: true, user: result.rows[0] });
        } else {
            res.json({ success: false });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

// Reset Password
app.post('/api/reset-password', async (req, res) => {
    try {
        const { email, newPassword } = req.body;

        // 1. Get current user info to check old password
        const userRes = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        const user = userRes.rows[0];

        if (!user) {
            return res.status(404).json({ success: false, message: "Uživatel nenalezen." });
        }

        // 2. CHECK: Is new password same as old password?
        const isSame = await bcrypt.compare(newPassword, user.password_hash);
        if (isSame) {
            return res.status(400).json({ success: false, message: "Nové heslo se musí lišit od starého." });
        }

        // 3. Hash NEW password & Save
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(newPassword, salt);

        await pool.query(
            "UPDATE users SET password_hash = $1 WHERE email = $2",
            [hash, email]
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

// Get User Profile & Update Streak
app.get('/api/user/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query("SELECT id, username, email, level, badges, streak, last_login FROM users WHERE id = $1", [id]);

        if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });

        const user = result.rows[0];

        // Streak Logic
        const now = new Date();
        const lastLogin = new Date(user.last_login); // Postgres returns date object

        // Normalize to YYYY-MM-DD to avoid timezone bugs
        const todayStr = now.toISOString().split('T')[0];
        const lastLoginStr = user.last_login ? lastLogin.toISOString().split('T')[0] : "1970-01-01";

        let newStreak = user.streak || 0;

        if (todayStr !== lastLoginStr) {
            // Check if yesterday was last login
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            if (lastLoginStr === yesterdayStr) {
                newStreak++;
            } else {
                newStreak = 1; // Reset or Start
            }

            // Update DB
            await pool.query("UPDATE users SET streak = $1, last_login = CURRENT_DATE WHERE id = $2", [newStreak, id]);
        }

        // Determine Role
        let role = "Student";
        if (user.badges && user.badges.includes('Root')) role = "Root";
        else if (user.badges && user.badges.includes('Admin')) role = "Admin";

        res.json({
            id: user.id,
            username: user.username,
            email: user.email,
            level: user.level,
            badges: user.badges || [],
            streak: newStreak,
            role: role
        });

    } catch (err) {
        console.error("Profile Error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// Get Users (Admin)
app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query("SELECT id, username, email, level, badges, joined_date, verified FROM users ORDER BY id ASC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

// Delete User (Admin)
app.post('/api/users/delete', async (req, res) => {
    try {
        const { id, requesterId } = req.body;

        // Get Permissions
        const rRes = await pool.query("SELECT * FROM users WHERE id = $1", [requesterId]);
        const requester = rRes.rows[0];
        const tRes = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
        const target = tRes.rows[0];

        if (!requester || !target) return res.status(404).json({ error: "User not found" });

        // SECURITY CHECK: Is requester currently an Admin?
        if (!requester.badges || !requester.badges.includes('Admin')) {
            return res.status(403).json({ error: "Nemáš oprávnění (Admin access lost)." });
        }

        if (target.badges.includes('Admin')) {
            if (requester.username !== 'Bomba') {
                return res.status(403).json({ error: "Jen Bomba může smazat Admina." });
            }
        }

        await pool.query("DELETE FROM users WHERE id = $1", [id]);
        res.json({ success: true });
    } catch (err) {
        console.error("Delete error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// Toggle Role (Root Only)
app.post('/api/users/toggle-role', async (req, res) => {
    try {
        const { id, isAdmin, requesterId } = req.body;

        const rRes = await pool.query("SELECT username FROM users WHERE id = $1", [requesterId]);
        const requester = rRes.rows[0];

        if (requester?.username !== 'Bomba') {
            return res.status(403).json({ error: "Jen Bomba může spravovat Admin role." });
        }

        if (isAdmin) {
            // Remove
            await pool.query("UPDATE users SET badges = array_remove(badges, 'Admin') WHERE id = $1", [id]);
            await pool.query("UPDATE users SET badges = array_remove(badges, 'Root') WHERE id = $1", [id]);
        } else {
            // Add
            await pool.query("UPDATE users SET badges = array_append(badges, 'Admin') WHERE id = $1", [id]);
            await pool.query("UPDATE users SET badges = array_append(badges, 'Root') WHERE id = $1", [id]);
        }

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

// Public Stats (User Count)
app.get('/api/stats', async (req, res) => {
    try {
        const result = await pool.query("SELECT COUNT(*) FROM users");
        // Row count is returned as string in PG count(*)
        res.json({ userCount: parseInt(result.rows[0].count, 10) });
    } catch (err) {
        console.error(err);
        res.json({ userCount: 0 }); // Fallback on error
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    initDB(); // Try to connect to DB
});
