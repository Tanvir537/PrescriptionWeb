const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const xlsx = require('xlsx');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Database connection
const db = new sqlite3.Database('prescweb_main.db', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the prescweb_main.db database.');
});

// Initialize all tables
const initializeDatabase = () => {
  // Medicines table
  const medicinesSql = `CREATE TABLE IF NOT EXISTS medicines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    generic_name TEXT NOT NULL,
    brand_names TEXT,
    dosage_form TEXT,
    strength TEXT,
    indication TEXT,
    contraindication TEXT,
    side_effects TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`;
  
  // Prescriptions table
  const prescriptionsSql = `CREATE TABLE IF NOT EXISTS prescriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id TEXT,
    prescription_data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`;
  
  // Templates table
  const templatesSql = `CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    template_data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`;
  
  // Pad designs table
  const padDesignsSql = `CREATE TABLE IF NOT EXISTS pad_designs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    design_data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`;

  db.run(medicinesSql);
  db.run(prescriptionsSql);
  db.run(templatesSql);
  db.run(padDesignsSql);
  
  console.log('All database tables initialized');
};

initializeDatabase();

// Import medicines from Excel
app.get('/api/import-medicines', (req, res) => {
  try {
    const workbook = xlsx.readFile('medicines.xlsx');
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const medicines = xlsx.utils.sheet_to_json(worksheet);

    const sql = `INSERT OR IGNORE INTO medicines 
                 (generic_name, brand_names, dosage_form, strength, indication, contraindication, side_effects) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;

    medicines.forEach(medicine => {
      db.run(sql, [
        medicine.generic_name,
        medicine.brand_names,
        medicine.dosage_form,
        medicine.strength,
        medicine.indication,
        medicine.contraindication,
        medicine.side_effects
      ]);
    });

    res.json({ message: `Imported ${medicines.length} medicines successfully` });
  } catch (error) {
    res.status(500).json({ error: 'Error importing medicines: ' + error.message });
  }
});

// Serve HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/prescription', (req, res) => {
  res.sendFile(path.join(__dirname, 'prescription.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
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

// Medicine Search API
app.get('/api/medicines/search', (req, res) => {
  const query = req.query.q;
  if (!query) {
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
  const exactTerm = query;

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

// Get medicine details by ID
app.get('/api/medicines/:id', (req, res) => {
  const id = req.params.id;
  const sql = 'SELECT * FROM medicines WHERE id = ?';
  
  db.get(sql, [id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!row) {
      res.status(404).json({ message: 'Medicine not found' });
      return;
    }
    
    const medicineDetails = {
      ...row,
      brand_names: row.brand_names ? row.brand_names.split(',').map(name => name.trim()) : []
    };
    
    res.json(medicineDetails);
  });
});

// Get all medicines
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
app.post('/api/prescriptions', (req, res) => {
  const { patientDetails, chiefComplaints, drugHistory, investigation, diagnosis, advice, followup, prescriptionItems } = req.body;
  const prescription_data = JSON.stringify(req.body);
  const patient_id = patientDetails.regNo;

  const sql = 'INSERT INTO prescriptions (patient_id, prescription_data) VALUES (?, ?)';
  db.run(sql, [patient_id, prescription_data], function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({
      message: 'Prescription created successfully',
      prescription: {
        id: this.lastID,
        ...req.body
      }
    });
  });
});

app.get('/api/prescriptions', (req, res) => {
  const sql = 'SELECT * FROM prescriptions ORDER BY created_at DESC';
  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    const prescriptions = rows.map(row => {
        const data = JSON.parse(row.prescription_data);
        return {
            id: row.id,
            prescriptionNo: `PR${row.id}`,
            patientName: data.patientDetails.name,
            date: new Date(row.created_at).toLocaleDateString('en-GB'),
            diagnosis: data.diagnosis,
            medications: data.prescriptionItems ? data.prescriptionItems.filter(item => !item.isAdvice) : []
        }
    });
    res.json({
        message: 'Prescriptions retrieved successfully',
        data: prescriptions
    });
  });
});

app.get('/api/prescriptions/:id', (req, res) => {
  const id = req.params.id;
  const sql = 'SELECT * FROM prescriptions WHERE id = ?';
  db.get(sql, [id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ message: 'Prescription not found' });
      return;
    }
    res.json({
      message: 'Prescription retrieved successfully',
      data: JSON.parse(row.prescription_data)
    });
  });
});

// Dashboard API
app.get('/api/dashboard/stats', (req, res) => {
    const stats = {};
    const today = new Date().toISOString().slice(0, 10);

    db.get('SELECT COUNT(*) as count FROM prescriptions WHERE DATE(created_at) = ?', [today], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        stats.prescriptionsToday = row.count;

        db.get('SELECT COUNT(DISTINCT patient_id) as count FROM prescriptions', [], (err, row) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            stats.totalPatients = row.count;
            
            db.get('SELECT COUNT(*) as count FROM medicines', [], (err, row) => {
              if (err) {
                  res.status(500).json({ error: err.message });
                  return;
              }
              stats.totalMedicines = row.count;
              stats.pendingReviews = 0;

              res.json(stats);
            });
        });
    });
});

// Templates API
app.get('/api/templates', (req, res) => {
  const sql = 'SELECT id, name, template_data FROM templates';
  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows.map(row => ({id: row.id, name: row.name, templateData: JSON.parse(row.template_data)})));
  });
});

app.post('/api/templates', (req, res) => {
  const { name, templateData } = req.body;
  const template_data = JSON.stringify(templateData);

  const sql = 'INSERT INTO templates (name, template_data) VALUES (?, ?)';
  db.run(sql, [name, template_data], function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({
      message: 'Template saved successfully',
      template: {
        id: this.lastID,
        name,
        templateData
      }
    });
  });
});

app.delete('/api/templates/:id', (req, res) => {
    const id = req.params.id;
    const sql = 'DELETE FROM templates WHERE id = ?';
    db.run(sql, id, function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (this.changes === 0) {
            res.status(404).json({ message: `Template with id ${id} not found` });
            return;
        }
        res.json({ message: `Template with id ${id} deleted` });
    });
});

// Pad Designs API
app.post('/api/pad-designs', (req, res) => {
  const { name, designData } = req.body;
  
  const sql = 'INSERT INTO pad_designs (name, design_data) VALUES (?, ?)';
  db.run(sql, [name, JSON.stringify(designData)], function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({
      message: 'Pad design saved successfully',
      id: this.lastID
    });
  });
});

app.get('/api/pad-designs', (req, res) => {
  const sql = 'SELECT * FROM pad_designs ORDER BY created_at DESC';
  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows.map(row => ({
      id: row.id,
      name: row.name,
      designData: JSON.parse(row.design_data),
      createdAt: row.created_at
    })));
  });
});

app.delete('/api/pad-designs/:id', (req, res) => {
  const id = req.params.id;
  const sql = 'DELETE FROM pad_designs WHERE id = ?';
  db.run(sql, [id], function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ message: 'Pad design not found' });
      return;
    }
    res.json({ message: 'Pad design deleted successfully' });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Medical Prescription System running on http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/`);
  console.log(`📝 Write Prescription: http://localhost:${PORT}/prescription`);
  console.log(`💊 Medicines: http://localhost:${PORT}/medicines`);
  console.log(`📋 Templates: http://localhost:${PORT}/templates`);
  console.log(`🎨 Pad Designer: http://localhost:${PORT}/designer`);
  console.log(`📥 Import Medicines: http://localhost:${PORT}/api/import-medicines`);
});