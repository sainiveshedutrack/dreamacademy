/**
 * Database Seeder — Run with: npm run seed
 */

const bcrypt = require('bcryptjs');

const isFresh = process.argv.includes('--fresh');

(async () => {
  const { db, initDatabase } = require('./database');

  await initDatabase();

  console.log('\n🌱 Starting database seed...\n');

  // CLEAR OLD DATA
  if (isFresh) {
    db.exec('DELETE FROM attendance');
    db.exec('DELETE FROM students');
    db.exec('DELETE FROM teachers');

    console.log('🗑️ Cleared existing data.\n');
  }

  // =========================
  // TEACHERS
  // =========================

  const TEACHERS = [
    {
      name: 'Tamil',
      email: 'tamil@dream.com',
      password: 'teacher123',
      role: 'staff'
    },
    {
      name: 'Abiram',
      email: 'abiram@dream.com',
      password: 'teacher123',
      role: 'staff'
    },
    {
      name: 'Harris',
      email: 'harris@dream.com',
      password: 'teacher123',
      role: 'staff'
    },
    {
      name: 'Sandeep',
      email: 'sandeep@dream.com',
      password: 'teacher123',
      role: 'staff'
    },
    {
      name: 'Srikanth',
      email: 'srikanth@dream.com',
      password: 'teacher123',
      role: 'superadmin'
    },
    {
      name: 'Dharshini',
      email: 'dharshini@dream.com',
      password: 'teacher123',
      role: 'staff'
    }
  ];

  const teacherIds = [];

  for (const teacher of TEACHERS) {
    const email = teacher.email.toLowerCase().trim();

    const existing = db
      .prepare('SELECT id FROM teachers WHERE email = ?')
      .get(email);

    if (existing) {
      teacherIds.push(existing.id);

      console.log(`⏭️ Teacher exists: ${teacher.name}`);
      continue;
    }

    const hashedPassword = bcrypt.hashSync(teacher.password, 10);

    const result = db
      .prepare(`
        INSERT INTO teachers
        (name, email, password_hash, role)
        VALUES (?, ?, ?, ?)
      `)
      .run(
        teacher.name,
        email,
        hashedPassword,
        teacher.role
      );

    teacherIds.push(result.lastInsertRowid);

    console.log(`👩‍🏫 Added teacher: ${teacher.name}`);
  }

  const defaultTeacherId = teacherIds[0];

  // =========================
  // STUDENTS
  // =========================

  const STUDENTS = [
    { name: 'Athiyan', grade: '6 ICSE', phone: '919940717874' },
    { name: 'N Sri Kavin', grade: '7 CBSE', phone: '919901399699' },
    { name: 'R Hariharan', grade: '8 TN', phone: '919677708019' },
    { name: 'S Jai Vishak', grade: '8 CBSE', phone: '919943388115' },
    { name: 'Akshita', grade: '9 ICSE', phone: '919944303015' },

    { name: 'P S Lekha Sree', grade: '10 TN', phone: '919003693696' },
    { name: 'KS Kiruthuk Varbhan', grade: '10 IGCSE', phone: '919698407000' },
    { name: 'SM Vaseegaran', grade: '10 IGCSE', phone: '919952596292' },
    { name: 'Harshith', grade: '10 IGCSE', phone: '917538890749' },
    { name: 'P.Mukundan', grade: '10 ICSE', phone: '919159399702' },
    { name: 'G.S Ashvath', grade: '10 CBSE', phone: '919894746670' },
    { name: 'S Albert Richard Singh', grade: '10 CBSE', phone: '919600854007' },
    { name: 'S Anirudh', grade: '10 CBSE', phone: '919840627077' },

    { name: 'V Anshika Kajal', grade: '12 TN', phone: '919894707388' },
    { name: 'P Saravanan', grade: '12 ISC', phone: '919159399702' },
    { name: 'P Aswin', grade: '12 ISC', phone: '919894461392' },
    { name: 'V Ilakya', grade: '12 ISC', phone: '919442892384' },
    { name: 'Kavin', grade: '12 IB', phone: '917538890749' },
    { name: 'S Kamesh', grade: '12 CBSE', phone: '917868999066' },
    { name: 'N Pranav Sriram', grade: '12 CBSE', phone: '919944157697' },
    { name: 'D Nithessh', grade: '12 CBSE', phone: '919361729505' },
    { name: 'CS Sooriya Balaji', grade: '12 CBSE', phone: '919791768670' },
    { name: 'K Sai Nivesh', grade: '12 CBSE', phone: '919698681000' }
  ];

  for (const student of STUDENTS) {
    const existing = db
      .prepare(
        'SELECT id FROM students WHERE name = ? AND grade = ?'
      )
      .get(student.name, student.grade);

    if (existing) {
      console.log(`⏭️ Student exists: ${student.name}`);
      continue;
    }

    db.prepare(`
      INSERT INTO students
      (name, grade, parent_whatsapp, teacher_id)
      VALUES (?, ?, ?, ?)
    `).run(
      student.name,
      student.grade,
      student.phone,
      defaultTeacherId
    );

    console.log(`👦 Added student: ${student.name}`);
  }

  console.log('\n✅ Database seeding completed!\n');

  process.exit(0);

})().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});