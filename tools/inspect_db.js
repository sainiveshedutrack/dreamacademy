const path = require('path');
(async () => {
  try {
    const { initDatabase, db } = require('../backend/src/db/database');
    await initDatabase();
    const teachers = db.prepare('SELECT id, name, email FROM teachers').all();
    console.log('Teachers:', teachers);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
