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
                xp INTEGER DEFAULT 0,
                badges TEXT[] DEFAULT ARRAY['Intro'],
                joined_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                verified BOOLEAN DEFAULT FALSE
            );
        `);

        // Add Community Messages
        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Add Streak support if missing
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS streak INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP DEFAULT NULL,
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

        // CLEANUP: Remove Root badge from everyone else (Security Fix)
        await pool.query(`
            UPDATE users 
            SET badges = array_remove(badges, 'Root') 
            WHERE username != 'Bomba'
        `);

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
        const result = await pool.query("SELECT id, username, email, level, xp, badges, streak, last_login, subscription_expires_at FROM users WHERE id = $1", [id]);

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

        let isPremium = false;
        if (user.subscription_expires_at && new Date(user.subscription_expires_at) > now) {
            isPremium = true;
        }
        if (role === 'Admin' || role === 'Root') isPremium = true;

        res.json({
            id: user.id,
            username: user.username,
            email: user.email,
            level: user.level,
            xp: user.xp || 0,
            badges: user.badges || [],
            streak: newStreak,
            role: role,
            isPremium: isPremium,
            subscription_expires_at: user.subscription_expires_at
        });

    } catch (err) {
        console.error("Profile Error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// Get Users (Admin)
app.get('/api/users', async (req, res) => {
    try {
        const { requesterId } = req.query;
        if (!requesterId) return res.status(401).json({ error: "Unauthorized" });

        const adminCheck = await pool.query("SELECT badges FROM users WHERE id = $1", [requesterId]);
        if (adminCheck.rows.length === 0 || !adminCheck.rows[0].badges.includes('Admin')) {
            return res.status(403).json({ error: "Forbidden" });
        }

        const result = await pool.query("SELECT id, username, email, level, badges, joined_date, verified, subscription_expires_at FROM users ORDER BY id ASC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

// Manage Subscription (Admin)
app.post('/api/admin/subscription', async (req, res) => {
    try {
        const { targetEmail, days, requesterId } = req.body;

        if (!requesterId) return res.status(401).json({ error: "Unauthorized" });
        const adminCheck = await pool.query("SELECT badges FROM users WHERE id = $1", [requesterId]);
        if (adminCheck.rows.length === 0 || !adminCheck.rows[0].badges.includes('Admin')) {
            return res.status(403).json({ error: "Forbidden" });
        }

        // Check if removing
        if (days === 0) {
            await pool.query("UPDATE users SET subscription_expires_at = NULL WHERE email = $1", [targetEmail]);
            return res.json({ success: true, message: "Předplatné odebráno." });
        }

        // Calculate new date
        const userRes = await pool.query("SELECT subscription_expires_at FROM users WHERE email = $1", [targetEmail]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: "User not found" });

        let currentExpiry = userRes.rows[0].subscription_expires_at ? new Date(userRes.rows[0].subscription_expires_at) : new Date();
        if (currentExpiry < new Date()) currentExpiry = new Date(); // If expired, start from now

        const newExpiry = new Date(currentExpiry.getTime() + (days * 24 * 60 * 60 * 1000));

        await pool.query("UPDATE users SET subscription_expires_at = $1 WHERE email = $2", [newExpiry, targetEmail]);

        res.json({ success: true, message: `Předplatné nastaveno do ${newExpiry.toLocaleDateString()}` });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

// Grant Certification
app.post('/api/certify', async (req, res) => {
    try {
        const { userId } = req.body;
        await pool.query("UPDATE users SET badges = array_append(badges, 'Certified') WHERE id = $1 AND NOT ('Certified' = ANY(badges))", [userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});
app.post('/api/progress', async (req, res) => {
    try {
        const { userId, xpGain } = req.body;

        // 1. Get current stats
        const userRes = await pool.query("SELECT xp, level FROM users WHERE id = $1", [userId]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: "User not found" });

        let { xp, level } = userRes.rows[0];

        // 2. Calculate New Stats
        const newXp = (xp || 0) + xpGain;
        const newLevel = Math.floor(newXp / 100) + 1; // Simple Leveling Formula: 100 XP per level

        let leveledUp = newLevel > level;

        // 3. Update DB
        await pool.query("UPDATE users SET xp = $1, level = $2 WHERE id = $3", [newXp, newLevel, userId]);

        res.json({
            success: true,
            newXp: newXp,
            newLevel: newLevel,
            leveledUp: leveledUp
        });

    } catch (err) {
        console.error("Progress Update Error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// Delete User (Admin)
app.post('/api/users/delete', async (req, res) => {
    try {
        const { id, requesterId, reason } = req.body;

        console.log(`[DELETE] Request to delete User ${id}. Reason: ${reason || 'Not specified'}`);

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
            // Remove Admin
            await pool.query("UPDATE users SET badges = array_remove(badges, 'Admin') WHERE id = $1", [id]);
        } else {
            // Add Admin ONLY (Root is exclusive to Bomba)
            await pool.query("UPDATE users SET badges = array_append(badges, 'Admin') WHERE id = $1", [id]);
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

// Leaderboard API
app.get('/api/leaderboard', async (req, res) => {
    try {
        // Top 50 users by Level (Excluding Owner 'Bomba')
        // Top 50 users by Level (Excluding Owner 'Bomba')
        const result = await pool.query(`
            SELECT username, level, xp, badges, joined_date, streak 
            FROM users 
            WHERE username != 'Bomba'
            ORDER BY level DESC, xp DESC, id ASC 
            LIMIT 50
        `);

        // Process data for frontend
        const leaderboard = result.rows.map(user => {
            let role = "Student";
            if (user.badges && user.badges.includes('Root')) role = "Root";
            else if (user.badges && user.badges.includes('Admin')) role = "Admin";

            return {
                username: user.username,
                level: user.level,
                xp: user.xp || 0,
                streak: user.streak || 0,
                role: role,
                badgesCount: user.badges ? user.badges.length : 0
            };
        });

        res.json(leaderboard);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

// Community Messages API
app.get('/api/messages', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        // Check premium
        const uRes = await pool.query("SELECT badges, subscription_expires_at FROM users WHERE id = $1", [userId]);
        const user = uRes.rows[0];
        if (!user) return res.status(404).json({ error: "User not found" });

        let isPremium = (user.badges && (user.badges.includes('Admin') || user.badges.includes('Root'))) || 
                        (user.subscription_expires_at && new Date(user.subscription_expires_at) > new Date());
        
        if (!isPremium) {
            return res.status(403).json({ error: "Tato sekce je pouze pro předplatitele." });
        }

        const result = await pool.query(`
            SELECT m.id, m.content, m.created_at, u.username, u.badges 
            FROM messages m
            JOIN users u ON m.user_id = u.id
            ORDER BY m.created_at ASC
            LIMIT 100
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

app.post('/api/messages', async (req, res) => {
    try {
        const { userId, content } = req.body;
        if (!userId || !content || content.trim() === '') return res.status(400).json({ error: "Bad request" });

        // Check premium
        const uRes = await pool.query("SELECT badges, subscription_expires_at FROM users WHERE id = $1", [userId]);
        const user = uRes.rows[0];
        if (!user) return res.status(404).json({ error: "User not found" });

        let isPremium = (user.badges && (user.badges.includes('Admin') || user.badges.includes('Root'))) || 
                        (user.subscription_expires_at && new Date(user.subscription_expires_at) > new Date());
        
        if (!isPremium) {
            return res.status(403).json({ error: "Tato sekce je pouze pro předplatitele." });
        }

        const newMsg = await pool.query(
            "INSERT INTO messages (user_id, content) VALUES ($1, $2) RETURNING id, content, created_at",
            [userId, content.trim()]
        );
        res.json({ success: true, message: newMsg.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    initDB(); // Try to connect to DB
});
