const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');

const app = express();
const port = 3000;

// Middleware - Serve frontend files from the frontend folder
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend'))); // Serve from frontend folder
app.use(session({
    secret: 'prescription-system-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// SQLite Database
const db = new sqlite3.Database('./prescription.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
        db.run(`CREATE TABLE IF NOT EXISTS patients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            age INTEGER NOT NULL,
            gender TEXT,
            phone TEXT,
            medicine_data TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});

// Authentication
const requireLogin = (req, res, next) => {
    if (!req.session.userId) return res.redirect('/login.html');
    next();
};

// Routes
app.get('/', (req, res) => res.redirect('/dashboard.html'));

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    console.log('Login attempt:', username, password); // Debug log
    
    if (username === 'admin' && password === 'password') {
        req.session.userId = 1;
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'Invalid credentials' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});

// Patient Routes
app.post('/add-patient', requireLogin, (req, res) => {
    const { name, age, gender, phone, medicines } = req.body;
    const medicineData = JSON.stringify(medicines || []);
    
    db.run(`INSERT INTO patients (name, age, gender, phone, medicine_data) VALUES (?, ?, ?, ?, ?)`, 
    [name, age, gender, phone, medicineData], function(err) {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ success: false, message: 'Failed to add patient' });
        }
        res.json({ success: true, message: 'Patient added successfully' });
    });
});

app.get('/api/patients', requireLogin, (req, res) => {
    db.all(`SELECT * FROM patients ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Failed to fetch patients' });
        }
        const patients = rows.map(patient => ({
            ...patient,
            medicine_data: patient.medicine_data ? JSON.parse(patient.medicine_data) : []
        }));
        res.json(patients);
    });
});

app.delete('/delete-patient/:id', requireLogin, (req, res) => {
    const patientId = req.params.id;
    db.run('DELETE FROM patients WHERE id = ?', [patientId], function(err) {
        if (err) return res.status(500).json({ success: false, message: 'Failed to delete patient' });
        res.json({ success: true, message: 'Patient deleted successfully' });
    });
});

app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
    console.log(`📁 Serving frontend from: ${path.join(__dirname, '../frontend')}`);
});