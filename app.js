// faucet-tracker-app/app.js

const express = require('express');
const sqlite3 = require('sqlite3').verbose(); // .verbose() provides more detailed stack traces
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000; // Use environment variable for port or default to 3000

// --- Database Setup ---
// Ensure the 'data' directory exists, or create it manually in your project root.
const dataDir = path.join(__dirname, 'data');
const DB_PATH = path.join(dataDir, 'faucets.db'); // Path to your database file

// Check and create 'data' directory if it doesn't exist (optional, good practice)
const fs = require('fs');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1); // Exit if DB connection fails
    } else {
        console.log('Connected to the SQLite database.');
        // Create the faucets table if it doesn't exist
        // This schema matches the features you outlined
        db.run(`CREATE TABLE IF NOT EXISTS faucets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            url TEXT NOT NULL UNIQUE,
            token_symbol TEXT,
            token_contract_address TEXT,
            network TEXT,
            payout_frequency TEXT,
            status TEXT DEFAULT 'under_review', 
            is_verified BOOLEAN DEFAULT 0,      -- 0 for false, 1 for true
            notes TEXT,
            date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error("Error creating faucets table:", err.message);
            } else {
                console.log("Faucets table created or already exists.");
                // You could insert some dummy data here for initial testing if needed
                // Example:
                /*
                const insert = 'INSERT INTO faucets (name, url, token_symbol, network, payout_frequency, status, is_verified) VALUES (?,?,?,?,?,?,?)';
                db.run(insert, ["Test Faucet", "http://test.com", "TST", "TestNet", "Hourly", "active", 1], (err) => {
                    if (err) console.error("Error inserting dummy data:", err.message);
                    else console.log("Dummy data inserted for testing");
                });
                */
            }
        });
    }
});

// --- Middleware ---
// Middleware to parse JSON request bodies (for POST/PUT requests like faucet submission)
app.use(express.json());
// Middleware to parse URL-encoded request bodies (for traditional HTML forms)
app.use(express.urlencoded({ extended: true }));


// --- API Endpoints ---

// Basic route for testing the server
app.get('/', (req, res) => {
    res.send('Faucet Tracker API is running!');
});

// GET /api/faucets - Fetch all verified faucets (or filter)
app.get('/api/faucets', (req, res) => {
    const { token, network, status } = req.query;
    let query = "SELECT * FROM faucets WHERE is_verified = 1"; // By default, show verified faucets
    const params = [];

    if (token) {
        query += " AND token_symbol = ?";
        params.push(token);
    }
    if (network) {
        query += " AND network = ?";
        params.push(network);
    }
    if (status) {
        query += " AND status = ?";
        params.push(status);
    } else {
        // If no specific status filter is applied by the user,
        // we might still want to only show 'active' ones on the main list.
        // Or, you can let 'is_verified = 1' handle this and the client can further filter/show status.
        // For now, let's stick to just 'is_verified=1' and any additional filters.
    }
    
    // To fetch ALL faucets for an admin panel later, you might have a different route
    // or an admin-only flag. For public view, only verified.

    db.all(query, params, (err, rows) => {
        if (err) {
            console.error("Error fetching faucets:", err.message);
            res.status(500).json({ error: 'Failed to retrieve faucets' });
            return;
        }
        res.json({ faucets: rows });
    });
});

// POST /api/faucets/submit - Submit a new faucet for review
app.post('/api/faucets/submit', (req, res) => {
    const { name, url, token_symbol, token_contract_address, network, payout_frequency } = req.body;

    // Basic validation
    if (!name || !url) {
        return res.status(400).json({ error: 'Faucet name and URL are required.' });
    }

    const insertSQL = `INSERT INTO faucets (name, url, token_symbol, token_contract_address, network, payout_frequency, status, is_verified)
                       VALUES (?, ?, ?, ?, ?, ?, 'under_review', 0)`;
    
    db.run(insertSQL, [name, url, token_symbol, token_contract_address, network, payout_frequency], function(err) {
        // Use `function(err)` to get access to `this.lastID`
        if (err) {
            if (err.message.includes("UNIQUE constraint failed: faucets.url")) {
                return res.status(409).json({ error: 'This faucet URL has already been submitted.' });
            }
            console.error("Error submitting faucet:", err.message);
            return res.status(500).json({ error: 'Failed to submit faucet.' });
        }
        res.status(201).json({ message: 'Faucet submitted successfully for review!', faucetId: this.lastID });
    });
});


// --- Start the Server ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

// --- Graceful Shutdown ---
// Handles Ctrl+C in the terminal to close the database connection properly
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('Error closing database connection:', err.message);
        } else {
            console.log('Database connection closed.');
        }
        process.exit(0);
    });
});
