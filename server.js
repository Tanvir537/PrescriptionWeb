const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');

const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'prescription-system-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// SQLite Database - No installation needed!
const db = new sqlite3.Database('./prescription.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
        
        // Create patients table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS patients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            age INTEGER NOT NULL,
            gender TEXT,
            phone TEXT,
            medicine_data TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error('Error creating table:', err);
            } else {
                console.log('Patients table ready!');
            }
        });
    }
});

// Authentication middleware
const requireLogin = (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    next();
};

// Routes
app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

app.get('/dashboard', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === 'admin' && password === 'password') {
        req.session.userId = 1;
        req.session.username = username;
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'Invalid credentials' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Enhanced Patient Routes
app.get('/add-patient', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'add_patient.html'));
});

app.post('/add-patient', requireLogin, (req, res) => {
    const { name, age, gender, phone, medicines } = req.body;
    
    console.log('Received patient data:', { name, age, gender, phone, medicines });
    
    // Validate required fields
    if (!name || !age) {
        return res.status(400).json({ 
            success: false, 
            message: 'Name and age are required' 
        });
    }
    
    const medicineData = JSON.stringify(medicines || []);
    
    const query = `INSERT INTO patients (name, age, gender, phone, medicine_data) 
                   VALUES (?, ?, ?, ?, ?)`;
    
    db.run(query, [name, age, gender, phone, medicineData], function(err) {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to add patient' 
            });
        }
        res.json({ 
            success: true, 
            message: 'Patient added successfully',
            patientId: this.lastID 
        });
    });
});

app.get('/view-patients', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'view_patients.html'));
});

app.get('/api/patients', requireLogin, (req, res) => {
    const query = `SELECT id, name, age, gender, phone, medicine_data, 
                   datetime(created_at) as created_at 
                   FROM patients ORDER BY created_at DESC`;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Failed to fetch patients' });
        }
        
        // Parse medicine_data from JSON string
        const patients = rows.map(patient => ({
            ...patient,
            medicine_data: patient.medicine_data ? JSON.parse(patient.medicine_data) : []
        }));
        
        res.json(patients);
    });
});

app.delete('/delete-patient/:id', requireLogin, (req, res) => {
    const patientId = req.params.id;
    
    const query = 'DELETE FROM patients WHERE id = ?';
    db.run(query, [patientId], function(err) {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ success: false, message: 'Failed to delete patient' });
        }
        res.json({ success: true, message: 'Patient deleted successfully' });
    });
});

// Start server
app.listen(port, () => {
    console.log(`🚀 Prescription System running at http://localhost:${port}`);
    console.log(`💾 Using SQLite database: prescription.db`);
    console.log(`🔐 Default login: admin / password`);
    console.log(`✅ No MySQL required! Database is automatically created.`);
});