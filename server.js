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
        console.log("Database initialized.");

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
app.delete('/api/users/:id', async (req, res) => {
    try {
        await pool.query("DELETE FROM users WHERE id = $1", [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

// Toggle Role (Admin)
app.post('/api/users/toggle-role', async (req, res) => {
    try {
        const { id, isAdmin } = req.body;
        let newBadges;

        if (isAdmin) {
            // Was admin, remove
            await pool.query("UPDATE users SET badges = array_remove(badges, 'Admin') WHERE id = $1", [id]);
            await pool.query("UPDATE users SET badges = array_remove(badges, 'Root') WHERE id = $1", [id]);
        } else {
            // Make admin
            await pool.query("UPDATE users SET badges = array_append(badges, 'Admin') WHERE id = $1", [id]);
            await pool.query("UPDATE users SET badges = array_append(badges, 'Root') WHERE id = $1", [id]);
        }

        res.json({ success: true });
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
