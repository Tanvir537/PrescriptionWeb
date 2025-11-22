const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const csv = require('csv-parser');

async function migrate() {
  const mainDb = new sqlite3.Database('prescweb_main.db');
  const oldDb = new sqlite3.Database('backend/prescription_app.db');

  // Wrap database operations in Promises
  const run = (db, sql, params) => new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });

  const each = (db, sql) => new Promise((resolve, reject) => {
    const rows = [];
    db.each(sql, (err, row) => {
      if (err) {
        reject(err);
      } else {
        rows.push(row);
      }
    }, (err, count) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });

  try {
    // Create new tables
    await run(mainDb, `
      CREATE TABLE IF NOT EXISTS medicines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        generic_name TEXT,
        brand_names TEXT,
        strength TEXT,
        dosage_form TEXT,
        manufacturer TEXT,
        packageMark TEXT,
        indication TEXT,
        contraindication TEXT,
        side_effects TEXT
      )
    `);

    await run(mainDb, `
      CREATE TABLE IF NOT EXISTS prescriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id TEXT,
        prescription_data TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(mainDb, `
      CREATE TABLE IF NOT EXISTS templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        template_data TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migrate medicines from CSV
    const medicineMigration = new Promise((resolve, reject) => {
      fs.createReadStream('backend/medicine_database.csv')
        .pipe(csv())
        .on('data', async (row) => {
          try {
            await run(
              mainDb,
              `INSERT INTO medicines (generic_name, brand_names, strength, dosage_form, manufacturer, packageMark, indication, contraindication, side_effects)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [row.generic_name, row.brand_names, row.strength, row.dosage_form, row.manufacturer, row.packageMark, row.indication, row.contraindication, row.side_effects]
            );
          } catch (err) {
            console.error(err.message);
          }
        })
        .on('end', () => {
          console.log('Medicine migration finished.');
          resolve();
        })
        .on('error', (err) => {
          reject(err);
        });
    });
    await medicineMigration;

    // Migrate prescriptions from old DB
    const prescriptions = await each(oldDb, 'SELECT * FROM prescriptions');
    for (const row of prescriptions) {
      await run(
        mainDb,
        'INSERT INTO prescriptions (patient_id, prescription_data, created_at) VALUES (?, ?, ?)',
        [row.patient_id, row.prescription_data, row.created_at]
      );
    }
    console.log(`Migrated ${prescriptions.length} prescriptions.`);

    // Migrate templates from old DB
    const templates = await each(oldDb, 'SELECT * FROM templates');
    for (const row of templates) {
      await run(
        mainDb,
        'INSERT INTO templates (name, template_data, created_at) VALUES (?, ?, ?)',
        [row.name, row.template_data, row.created_at]
      );
    }
    console.log(`Migrated ${templates.length} templates.`);

  } catch (err) {
    console.error(err.message);
  } finally {
    mainDb.close();
    oldDb.close();
  }
}

migrate();