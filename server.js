const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Database connection
const db = new sqlite3.Database('prescweb_main.db', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the prescweb_main.db database.');
});

// API routes
// Serve main dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
// Medicine Search API
app.get('/api/medicines/search', (req, res) => {
  const query = req.query.q;
  const sql = `
    SELECT * FROM medicines
    WHERE generic_name LIKE ? OR brand_names LIKE ?
    ORDER BY
      CASE
        WHEN brand_names LIKE ? THEN 1
        WHEN brand_names LIKE ? THEN 2
        WHEN generic_name LIKE ? THEN 3
        ELSE 4
      END
    LIMIT 20
  `;
  const exactMatch = query;
  const startsWith = `${query}%`;
  const contains = `%${query}%`;

  db.all(sql, [contains, contains, exactMatch, startsWith, contains], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    // The brand_names are stored as a string, so we need to parse them
    const results = rows.map(row => ({
      ...row,
      brand_names: row.brand_names.split(',').map(name => name.trim())
    }));
    res.json(results);
  });
});

// Get medicine details by generic name
app.get('/api/medicines/details/:generic_name', (req, res) => {
  const generic_name = req.params.generic_name;
  const sql = 'SELECT * FROM medicines WHERE generic_name = ?';

  db.all(sql, [generic_name], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    if (rows.length === 0) {
      res.status(404).json({ message: 'Medicine not found' });
      return;
    }

    const brand_names = [...new Set(rows.flatMap(row => row.brand_names.split(',').map(name => name.trim())))];

    const forms_and_strengths_map = new Map();
    rows.forEach(row => {
      const dosage_form = row.dosage_form;
      const strengths_for_form = row.strength.split(',').map(s => s.trim());

      if (!forms_and_strengths_map.has(dosage_form)) {
        forms_and_strengths_map.set(dosage_form, new Set());
      }
      strengths_for_form.forEach(s => forms_and_strengths_map.get(dosage_form).add(s));
    });

    const forms_and_strengths = Array.from(forms_and_strengths_map.entries()).map(([form, strengthsSet]) => ({
      dosage_form: form,
      strengths: Array.from(strengthsSet).sort()
    }));

    const medicineDetails = {
      generic_name: rows[0].generic_name,
      brand_names: brand_names,
      forms_and_strengths: forms_and_strengths,
      indication: rows[0].indication,
      contraindication: rows[0].contraindication,
      side_effects: rows[0].side_effects,
    };

    res.json(medicineDetails);
  });
});

// Prescription API - Create new prescription
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

// Get all prescriptions
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
            medications: data.prescriptionItems.filter(item => !item.isAdvice)
        }
    });
    res.json({
        message: 'Prescriptions retrieved successfully',
        data: prescriptions
    });
  });
});

// Get a single prescription by ID
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

// Dashboard API - Get statistics
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
            // These are just placeholders for now
            stats.pendingReviews = 8;
            stats.medicationsPrescribed = 36;

            res.json(stats);
        });
    });
});


// Templates API - Get all templates
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

// Templates API - Save template
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

// Templates API - Delete template
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
// Add these routes to your server.js after the existing routes

// Serve the prescription pad designer
app.get('/designer', (req, res) => {
  res.sendFile(path.join(__dirname, 'pad.html'));
});

// API to save prescription pad designs
app.post('/api/pad-designs', (req, res) => {
  const { name, designData } = req.body;
  
  const sql = `CREATE TABLE IF NOT EXISTS pad_designs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    design_data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`;
  
  db.run(sql, [], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    // Now insert the design
    const insertSql = 'INSERT INTO pad_designs (name, design_data) VALUES (?, ?)';
    db.run(insertSql, [name, JSON.stringify(designData)], function(err) {
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
});

// API to get all saved pad designs
app.get('/api/pad-designs', (req, res) => {
  const sql = `CREATE TABLE IF NOT EXISTS pad_designs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    design_data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`;
  
  db.run(sql, [], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const selectSql = 'SELECT * FROM pad_designs ORDER BY created_at DESC';
    db.all(selectSql, [], (err, rows) => {
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
});

// API to delete a pad design
app.delete('/api/pad-designs/:id', (req, res) => {
  const id = req.params.id;
  const sql = 'DELETE FROM pad_designs WHERE id = ?';
  db.run(sql, [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: 'Pad design deleted successfully' });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
