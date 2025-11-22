const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const xlsx = require('xlsx');
const bcrypt = require('bcryptjs');
const session = require('express-session');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use(session({
  secret: 'medical-prescription-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Database connection
const db = new sqlite3.Database('./prescweb_main.db', (err) => {
  if (err) {
    console.error(err.message);
  } else {
    console.log('Connected to the database.');
  }
});

// Initialize all tables with error handling
const initializeDatabase = () => {
  const tables = [
    // Doctors table
    `CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      qualification TEXT,
      registration_no TEXT,
      clinic_address TEXT,
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    
    // Medicines table
    `CREATE TABLE IF NOT EXISTS medicines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      generic_name TEXT NOT NULL,
      brand_names TEXT,
      dosage_form TEXT,
      strength TEXT,
      indication TEXT,
      contraindication TEXT,
      side_effects TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    
    // Prescriptions table
    `CREATE TABLE IF NOT EXISTS prescriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id INTEGER,
      patient_name TEXT,
      patient_age INTEGER,
      patient_gender TEXT,
      patient_weight TEXT,
      patient_id TEXT,
      diagnosis TEXT,
      chief_complaints TEXT,
      investigations TEXT,
      advice TEXT,
      follow_up TEXT,
      medications TEXT,
      template_used TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (doctor_id) REFERENCES doctors (id)
    )`,
    
    // Templates table - FIXED: Added is_default column
    `CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id INTEGER,
      name TEXT NOT NULL,
      template_data TEXT NOT NULL,
      is_default BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (doctor_id) REFERENCES doctors (id)
    )`,
    
    // Pad designs table
    `CREATE TABLE IF NOT EXISTS pad_designs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id INTEGER,
      name TEXT NOT NULL,
      design_data TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (doctor_id) REFERENCES doctors (id)
    )`
  ];

  // Create tables one by one with error handling
  const createTable = (sql, index) => {
    return new Promise((resolve, reject) => {
      db.run(sql, (err) => {
        if (err) {
          console.error(`Error creating table ${index + 1}:`, err.message);
          reject(err);
        } else {
          console.log(`Table ${index + 1} created/verified`);
          resolve();
        }
      });
    });
  };

  // Execute table creation sequentially
  const createTablesSequentially = async () => {
    for (let i = 0; i < tables.length; i++) {
      try {
        await createTable(tables[i], i);
      } catch (error) {
        console.error(`Failed to create table ${i + 1}:`, error.message);
      }
    }
    
    console.log('Database initialization completed');
    
    // Add default data after tables are created
    setTimeout(() => {
      addDefaultTemplates();
      addSampleMedicines();
    }, 1000);
  };

  createTablesSequentially();
};

// Add default templates with error handling
const addDefaultTemplates = () => {
  const defaultTemplates = [
    {
      name: 'Standard Prescription',
      template_data: JSON.stringify({
        layout: 'standard',
        showHeader: true,
        showFooter: true,
        showWatermark: false,
        headerLayout: 'split',
        footerLayout: 'split'
      })
    },
    {
      name: 'Minimal Prescription', 
      template_data: JSON.stringify({
        layout: 'minimal',
        showHeader: false,
        showFooter: true,
        showWatermark: false,
        headerLayout: 'none',
        footerLayout: 'centered'
      })
    }
  ];

  // First, try to add the is_default column if it doesn't exist
  const addColumnSQL = `ALTER TABLE templates ADD COLUMN is_default BOOLEAN DEFAULT 0`;
  
  db.run(addColumnSQL, (err) => {
    // It's okay if the column already exists
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding is_default column:', err.message);
    }
    
    // Now insert default templates
    defaultTemplates.forEach(template => {
      // Check if template already exists
      db.get('SELECT id FROM templates WHERE name = ? AND is_default = 1', [template.name], (err, row) => {
        if (err) {
          console.error('Error checking template:', err.message);
          return;
        }
        
        if (!row) {
          // Template doesn't exist, insert it
          db.run(
            'INSERT INTO templates (name, template_data, is_default) VALUES (?, ?, 1)',
            [template.name, template.template_data],
            function(err) {
              if (err) {
                console.error('Error inserting default template:', err.message);
              } else {
                console.log(`Default template "${template.name}" added`);
              }
            }
          );
        }
      });
    });
  });
};

// Add sample medicines
const addSampleMedicines = () => {
  const medicines = [
    {
      generic_name: "Paracetamol",
      brand_names: "Ace, Napa, Acedol",
      dosage_form: "Tablet",
      strength: "500mg",
      indication: "Fever, Pain",
      contraindication: "Liver disease",
      side_effects: "Nausea, Rash"
    },
    {
      generic_name: "Amoxicillin",
      brand_names: "Amoxil, Moxacil", 
      dosage_form: "Capsule",
      strength: "500mg",
      indication: "Bacterial infections",
      contraindication: "Penicillin allergy",
      side_effects: "Diarrhea, Rash"
    },
    {
      generic_name: "Metformin",
      brand_names: "Glyciphage, Metfor",
      dosage_form: "Tablet",
      strength: "500mg, 850mg", 
      indication: "Type 2 diabetes",
      contraindication: "Renal impairment",
      side_effects: "GI upset, Lactic acidosis"
    },
    {
      generic_name: "Atenolol",
      brand_names: "Tenormin, Betacard",
      dosage_form: "Tablet",
      strength: "25mg, 50mg, 100mg",
      indication: "Hypertension, Angina",
      contraindication: "Heart block, Asthma",
      side_effects: "Fatigue, Bradycardia"
    },
    {
      generic_name: "Omeprazole",
      brand_names: "Losec, Prilosec",
      dosage_form: "Capsule", 
      strength: "20mg, 40mg",
      indication: "Gastric ulcer, GERD",
      contraindication: "None known",
      side_effects: "Headache, Diarrhea"
    }
  ];

  medicines.forEach(medicine => {
    // Check if medicine already exists
    db.get('SELECT id FROM medicines WHERE generic_name = ?', [medicine.generic_name], (err, row) => {
      if (err) {
        console.error('Error checking medicine:', err.message);
        return;
      }
      
      if (!row) {
        // Medicine doesn't exist, insert it
        const sql = `INSERT INTO medicines 
                     (generic_name, brand_names, dosage_form, strength, indication, contraindication, side_effects) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)`;
        
        db.run(sql, [
          medicine.generic_name,
          medicine.brand_names,
          medicine.dosage_form,
          medicine.strength,
          medicine.indication,
          medicine.contraindication,
          medicine.side_effects
        ], function(err) {
          if (err) {
            console.error('Error inserting medicine:', err.message);
          } else {
            console.log(`Sample medicine "${medicine.generic_name}" added`);
          }
        });
      }
    });
  });
};

// Start database initialization
initializeDatabase();

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session.doctorId) {
    next();
  } else {
    res.status(401).json({ error: 'Authentication required' });
  }
};

// Serve HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/prescription', (req, res) => {
  res.sendFile(path.join(__dirname, 'prescription.html'));
});

app.get('/medicines', (req, res) => {
  res.sendFile(path.join(__dirname, 'medicines.html'));
});

app.get('/templates', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates.html'));
});

app.get('/designer', (req, res) => {
  res.sendFile(path.join(__dirname, 'pad.html'));
});

// API Routes

// Auth APIs
app.post('/api/register', async (req, res) => {
  const { name, email, password, qualification, registration_no, clinic_address, phone } = req.body;
  
  // Basic validation
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    db.run(
      `INSERT INTO doctors (name, email, password, qualification, registration_no, clinic_address, phone) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, email, hashedPassword, qualification, registration_no, clinic_address, phone],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Email already registered' });
          }
          return res.status(500).json({ error: err.message });
        }
        
        req.session.doctorId = this.lastID;
        req.session.doctorName = name;
        
        res.json({ 
          message: 'Registration successful',
          doctor: { id: this.lastID, name, email }
        });
      }
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  
  db.get('SELECT * FROM doctors WHERE email = ?', [email], async (err, doctor) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!doctor) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    try {
      const validPassword = await bcrypt.compare(password, doctor.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      
      req.session.doctorId = doctor.id;
      req.session.doctorName = doctor.name;
      
      res.json({ 
        message: 'Login successful',
        doctor: { 
          id: doctor.id, 
          name: doctor.name, 
          email: doctor.email,
          qualification: doctor.qualification,
          registration_no: doctor.registration_no,
          clinic_address: doctor.clinic_address,
          phone: doctor.phone
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logout successful' });
  });
});

app.get('/api/me', (req, res) => {
  if (!req.session.doctorId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  db.get('SELECT id, name, email, qualification, registration_no, clinic_address, phone FROM doctors WHERE id = ?', 
    [req.session.doctorId], (err, doctor) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!doctor) {
      req.session.destroy();
      return res.status(401).json({ error: 'Doctor not found' });
    }
    
    res.json({ doctor });
  });
});

// Medicine APIs
app.get('/api/medicines/search', (req, res) => {
  const query = req.query.q;
  if (!query || query.trim() === '') {
    return res.json([]);
  }

  const sql = `
    SELECT * FROM medicines
    WHERE generic_name LIKE ? OR brand_names LIKE ?
    ORDER BY
      CASE
        WHEN generic_name LIKE ? THEN 1
        WHEN brand_names LIKE ? THEN 2
        ELSE 3
      END
    LIMIT 20
  `;
  
  const searchTerm = `%${query}%`;
  const exactTerm = `${query}%`;

  db.all(sql, [searchTerm, searchTerm, exactTerm, exactTerm], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const results = rows.map(row => ({
      ...row,
      brand_names: row.brand_names ? row.brand_names.split(',').map(name => name.trim()) : []
    }));
    
    res.json(results);
  });
});

app.get('/api/medicines', (req, res) => {
  const sql = 'SELECT * FROM medicines ORDER BY generic_name';
  
  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const medicines = rows.map(row => ({
      ...row,
      brand_names: row.brand_names ? row.brand_names.split(',').map(name => name.trim()) : []
    }));
    
    res.json(medicines);
  });
});

// Prescription APIs
app.post('/api/prescriptions', requireAuth, (req, res) => {
  const {
    patient_name, patient_age, patient_gender, patient_weight, patient_id,
    diagnosis, chief_complaints, investigations, advice, follow_up,
    medications, template_used
  } = req.body;

  // Basic validation
  if (!patient_name || !patient_age || !patient_gender || !diagnosis) {
    return res.status(400).json({ error: 'Required fields missing' });
  }

  const sql = `
    INSERT INTO prescriptions 
    (doctor_id, patient_name, patient_age, patient_gender, patient_weight, patient_id,
     diagnosis, chief_complaints, investigations, advice, follow_up, medications, template_used)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [
    req.session.doctorId, 
    patient_name, 
    parseInt(patient_age), 
    patient_gender, 
    patient_weight, 
    patient_id,
    diagnosis, 
    chief_complaints, 
    investigations, 
    advice, 
    follow_up,
    JSON.stringify(medications || []), 
    template_used || 'standard'
  ], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    res.json({
      message: 'Prescription created successfully',
      prescriptionId: this.lastID
    });
  });
});

app.get('/api/prescriptions', requireAuth, (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const sql = `
    SELECT p.*, d.name as doctor_name 
    FROM prescriptions p 
    LEFT JOIN doctors d ON p.doctor_id = d.id 
    WHERE p.doctor_id = ? 
    ORDER BY p.created_at DESC
    LIMIT ?
  `;
  
  db.all(sql, [req.session.doctorId, limit], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const prescriptions = rows.map(row => ({
      ...row,
      medications: row.medications ? JSON.parse(row.medications) : []
    }));
    
    res.json({ prescriptions });
  });
});

// Dashboard API
app.get('/api/dashboard/stats', requireAuth, (req, res) => {
  const stats = {};
  const today = new Date().toISOString().slice(0, 10);

  // Today's prescriptions
  db.get(
    'SELECT COUNT(*) as count FROM prescriptions WHERE doctor_id = ? AND DATE(created_at) = ?',
    [req.session.doctorId, today],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      stats.prescriptionsToday = row.count;

      // Total prescriptions
      db.get(
        'SELECT COUNT(*) as count FROM prescriptions WHERE doctor_id = ?',
        [req.session.doctorId],
        (err, row) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          stats.totalPrescriptions = row.count;

          // Total patients
          db.get(
            'SELECT COUNT(DISTINCT patient_id) as count FROM prescriptions WHERE doctor_id = ? AND patient_id IS NOT NULL AND patient_id != ""',
            [req.session.doctorId],
            (err, row) => {
              if (err) {
                return res.status(500).json({ error: err.message });
              }
              stats.totalPatients = row.count;

              // Total medicines
              db.get('SELECT COUNT(*) as count FROM medicines', [], (err, row) => {
                if (err) {
                  return res.status(500).json({ error: err.message });
                }
                stats.totalMedicines = row.count;

                res.json(stats);
              });
            }
          );
        }
      );
    }
  );
});

// Templates APIs
app.get('/api/templates', requireAuth, (req, res) => {
  const sql = `
    SELECT * FROM templates 
    WHERE doctor_id = ? OR is_default = 1 
    ORDER BY is_default, created_at DESC
  `;
  
  db.all(sql, [req.session.doctorId], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const templates = rows.map(row => ({
      ...row,
      template_data: typeof row.template_data === 'string' ? JSON.parse(row.template_data) : row.template_data
    }));
    
    res.json({ templates });
  });
});

app.post('/api/templates', requireAuth, (req, res) => {
  const { name, template_data } = req.body;

  if (!name || !template_data) {
    return res.status(400).json({ error: 'Name and template data are required' });
  }

  db.run(
    'INSERT INTO templates (doctor_id, name, template_data) VALUES (?, ?, ?)',
    [req.session.doctorId, name, JSON.stringify(template_data)],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      res.json({
        message: 'Template saved successfully',
        templateId: this.lastID
      });
    }
  );
});

// Pad Designs APIs
app.get('/api/pad-designs', requireAuth, (req, res) => {
  const sql = 'SELECT * FROM pad_designs WHERE doctor_id = ? ORDER BY created_at DESC';
  
  db.all(sql, [req.session.doctorId], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const designs = rows.map(row => ({
      ...row,
      design_data: typeof row.design_data === 'string' ? JSON.parse(row.design_data) : row.design_data
    }));
    
    res.json({ designs });
  });
});

app.post('/api/pad-designs', requireAuth, (req, res) => {
  const { name, design_data } = req.body;

  if (!name || !design_data) {
    return res.status(400).json({ error: 'Name and design data are required' });
  }

  db.run(
    'INSERT INTO pad_designs (doctor_id, name, design_data) VALUES (?, ?, ?)',
    [req.session.doctorId, name, JSON.stringify(design_data)],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      res.json({
        message: 'Design saved successfully',
        designId: this.lastID
      });
    }
  );
});

// Import medicines from Excel
app.get('/api/import-medicines', (req, res) => {
  res.json({ 
    message: 'Import endpoint ready - Place your Medicine list.xlsx file in the project root and restart the server'
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: 'Connected'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Medical Prescription System running on http://localhost:${PORT}`);
  console.log(`📝 Available Routes:`);
  console.log(`- Login/Register: http://localhost:${PORT}/`);
  console.log(`- Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`- Write Prescription: http://localhost:${PORT}/prescription`);
  console.log(`- Medicines: http://localhost:${PORT}/medicines`);
  console.log(`- Templates: http://localhost:${PORT}/templates`);
  console.log(`- Pad Designer: http://localhost:${PORT}/designer`);
  console.log(`- Health Check: http://localhost:${PORT}/api/health`);
});