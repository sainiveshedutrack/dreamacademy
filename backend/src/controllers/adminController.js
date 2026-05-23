const bcrypt = require('bcryptjs');
const { db } = require('../db/database');

// GET /api/admin/teachers — list all teachers
const getAllTeachers = (req, res) => {
  const teachers = db.prepare(
    'SELECT id, name, email, role, created_at FROM teachers ORDER BY id ASC'
  ).all();
  res.json({ teachers });
};

// POST /api/admin/teachers — create a new teacher/staff
const createTeacher = (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }
  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'Email is required.' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const cleanEmail = email.toLowerCase().trim();
  const existing = db.prepare('SELECT id FROM teachers WHERE email = ?').get(cleanEmail);
  if (existing) {
    return res.status(409).json({ error: `Email "${cleanEmail}" is already in use.` });
  }

  const hash = bcrypt.hashSync(password, 10);
  const teacherRole = role === 'superadmin' ? 'superadmin' : 'staff';

  const result = db.prepare(
    'INSERT INTO teachers (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
  ).run(name.trim(), cleanEmail, hash, teacherRole);

  const newTeacher = db.prepare('SELECT id, name, email, role, created_at FROM teachers WHERE id = ?').get(result.lastInsertRowid);

  console.log(`🛡️ Admin created teacher: ${name.trim()} (${cleanEmail}) role=${teacherRole}`);

  res.status(201).json({
    success: true,
    message: `Teacher "${name.trim()}" created successfully!`,
    teacher: newTeacher,
  });
};

// PUT /api/admin/teachers/:id — update teacher
const updateTeacher = (req, res) => {
  const { id } = req.params;
  const { name, email, password, role } = req.body;

  const teacher = db.prepare('SELECT * FROM teachers WHERE id = ?').get(parseInt(id));
  if (!teacher) {
    return res.status(404).json({ error: 'Teacher not found.' });
  }

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }
  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const cleanEmail = email.toLowerCase().trim();

  // Check duplicate email (exclude current teacher)
  const duplicate = db.prepare('SELECT id FROM teachers WHERE email = ? AND id != ?').get(cleanEmail, parseInt(id));
  if (duplicate) {
    return res.status(409).json({ error: `Email "${cleanEmail}" is already in use by another teacher.` });
  }

  const teacherRole = role === 'superadmin' ? 'superadmin' : 'staff';

  // Build update query
  if (password && password.length >= 6) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare(
      'UPDATE teachers SET name = ?, email = ?, password_hash = ?, role = ? WHERE id = ?'
    ).run(name.trim(), cleanEmail, hash, teacherRole, parseInt(id));
  } else {
    db.prepare(
      'UPDATE teachers SET name = ?, email = ?, role = ? WHERE id = ?'
    ).run(name.trim(), cleanEmail, teacherRole, parseInt(id));
  }

  const updated = db.prepare('SELECT id, name, email, role, created_at FROM teachers WHERE id = ?').get(parseInt(id));

  console.log(`🛡️ Admin updated teacher #${id}: ${name.trim()} (${cleanEmail}) role=${teacherRole}`);

  res.json({
    success: true,
    message: `Teacher "${name.trim()}" updated successfully!`,
    teacher: updated,
  });
};

// DELETE /api/admin/teachers/:id — delete teacher
const deleteTeacher = (req, res) => {
  const { id } = req.params;
  const targetId = parseInt(id);

  // Cannot delete yourself
  if (targetId === req.teacher.id) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }

  const teacher = db.prepare('SELECT * FROM teachers WHERE id = ?').get(targetId);
  if (!teacher) {
    return res.status(404).json({ error: 'Teacher not found.' });
  }

  // Cannot delete last superadmin
  if (teacher.role === 'superadmin') {
    const superadminCount = db.prepare("SELECT COUNT(*) as count FROM teachers WHERE role = 'superadmin'").get();
    if (superadminCount.count <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last Super Admin.' });
    }
  }

  // Delete teacher
  db.prepare('DELETE FROM teachers WHERE id = ?').run(targetId);

  console.log(`🛡️ Admin deleted teacher: ${teacher.name} (#${id})`);

  res.json({
    success: true,
    message: `Teacher "${teacher.name}" deleted successfully.`,
  });
};

module.exports = { getAllTeachers, createTeacher, updateTeacher, deleteTeacher };
