const { db } = require('../db/database');
const { sendMessage, getStatus } = require('../whatsapp/client');

// ─── Helpers ─────────────────────────────────────────────────────────────────
const buildMessage = (studentName, status, classTaken, homework) => {
  if (status === 'present') {
    return (
      `Dear Parent,\n\n` +
      `✅ ${studentName} attended class today.\n\n` +
      `📚 Class Taken: ${classTaken}\n` +
      `📝 Homework: ${homework}\n\n` +
      `Thank you.`
    );
  }
  return (
    `Dear Parent,\n\n` +
    `⚠️ ${studentName} was absent today.\n\n` +
    `📚 Class Taken: ${classTaken}\n` +
    `📝 Homework: ${homework}\n\n` +
    `Please ensure your child completes and submits the homework tomorrow.\n\n` +
    `Thank you.`
  );
};

// ─── POST /api/attendance/submit ─────────────────────────────────────────────
const submitAttendance = async (req, res) => {
  const { student_id, status, class_taken, homework } = req.body;

  // ── Validation
  if (!student_id || !status || !class_taken || !homework) {
    return res.status(400).json({ error: 'All fields are required: student_id, status, class_taken, homework.' });
  }
  if (!['present', 'absent'].includes(status)) {
    return res.status(400).json({ error: 'Status must be "present" or "absent".' });
  }
  if (class_taken.trim().length < 2) {
    return res.status(400).json({ error: 'Please enter a valid class description.' });
  }
  if (homework.trim().length < 2) {
    return res.status(400).json({ error: 'Please enter valid homework details.' });
  }

  // ── Verify student exists (any staff can mark attendance for any student)
  const student = db.prepare(`
    SELECT * FROM students WHERE id = ?
  `).get(student_id);

  if (!student) {
    return res.status(404).json({ error: 'Student not found.' });
  }

  const today = new Date().toISOString().split('T')[0];

  // ── Check if already submitted today (for upsert)
  const existingRecord = db.prepare(
    'SELECT id FROM attendance WHERE student_id = ? AND date = ?'
  ).get(student_id, today);

  // ── Build WhatsApp message
  const message = buildMessage(student.name, status, class_taken.trim(), homework.trim());

  // ── Attempt WhatsApp send
  let whatsapp_sent  = 0;
  let whatsapp_error = null;

  try {
    await sendMessage(student.parent_whatsapp, message);
    whatsapp_sent = 1;
    console.log(`✅ WhatsApp sent → ${student.name}'s parent (${student.parent_whatsapp})`);
  } catch (err) {
    whatsapp_error = err.message;
    console.warn(`⚠️  WhatsApp failed for ${student.name}: ${err.message}`);
  }

  // ── Save to database (upsert by student_id + date)
  if (existingRecord) {
    db.prepare(`
      UPDATE attendance
      SET status = ?, class_taken = ?, homework = ?,
          whatsapp_sent = ?, whatsapp_error = ?, teacher_id = ?
      WHERE student_id = ? AND date = ?
    `).run(status, class_taken.trim(), homework.trim(), whatsapp_sent, whatsapp_error, req.teacher.id, student_id, today);
  } else {
    db.prepare(`
      INSERT INTO attendance (student_id, teacher_id, date, status, class_taken, homework, whatsapp_sent, whatsapp_error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(student_id, req.teacher.id, today, status, class_taken.trim(), homework.trim(), whatsapp_sent, whatsapp_error);
  }

  const isUpdate = !!existingRecord;

  res.json({
    success:         true,
    updated:         isUpdate,
    student:         student.name,
    status,
    whatsapp_sent:   whatsapp_sent === 1,
    whatsapp_error,
    message_preview: message,
    feedback:        whatsapp_sent === 1
      ? `✅ Attendance ${isUpdate ? 'updated' : 'marked'} and WhatsApp message sent to ${student.name}'s parent!`
      : `📋 Attendance ${isUpdate ? 'updated' : 'marked'}. WhatsApp message could not be sent: ${whatsapp_error}`,
  });
};

// ─── POST /api/attendance/submit-bulk ────────────────────────────────────────
const submitBulkAttendance = async (req, res) => {
  const { records, class_taken, homework } = req.body;

  // ── Validation
  if (!records || !Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'records array is required and must not be empty.' });
  }
  if (!class_taken || class_taken.trim().length < 2) {
    return res.status(400).json({ error: 'Please enter a valid class description.' });
  }
  if (!homework || homework.trim().length < 2) {
    return res.status(400).json({ error: 'Please enter valid homework details.' });
  }

  const today = new Date().toISOString().split('T')[0];
  const results = [];

  for (const rec of records) {
    const { student_id, status } = rec;

    if (!student_id || !['present', 'absent'].includes(status)) {
      results.push({ student_id, success: false, error: 'Invalid student_id or status.' });
      continue;
    }

    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(student_id);
    if (!student) {
      results.push({ student_id, success: false, error: 'Student not found.' });
      continue;
    }

    const existingRecord = db.prepare(
      'SELECT id FROM attendance WHERE student_id = ? AND date = ?'
    ).get(student_id, today);

    const message = buildMessage(student.name, status, class_taken.trim(), homework.trim());

    let whatsapp_sent = 0;
    let whatsapp_error = null;

    try {
      await sendMessage(student.parent_whatsapp, message);
      whatsapp_sent = 1;
      console.log(`✅ WhatsApp sent → ${student.name}'s parent (${student.parent_whatsapp})`);
    } catch (err) {
      whatsapp_error = err.message;
      console.warn(`⚠️  WhatsApp failed for ${student.name}: ${err.message}`);
    }

    if (existingRecord) {
      db.prepare(`
        UPDATE attendance
        SET status = ?, class_taken = ?, homework = ?,
            whatsapp_sent = ?, whatsapp_error = ?, teacher_id = ?
        WHERE student_id = ? AND date = ?
      `).run(status, class_taken.trim(), homework.trim(), whatsapp_sent, whatsapp_error, req.teacher.id, student_id, today);
    } else {
      db.prepare(`
        INSERT INTO attendance (student_id, teacher_id, date, status, class_taken, homework, whatsapp_sent, whatsapp_error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(student_id, req.teacher.id, today, status, class_taken.trim(), homework.trim(), whatsapp_sent, whatsapp_error);
    }

    results.push({
      student_id,
      student_name: student.name,
      status,
      success: true,
      updated: !!existingRecord,
      whatsapp_sent: whatsapp_sent === 1,
      whatsapp_error,
    });
  }

  const totalSent = results.filter(r => r.whatsapp_sent).length;
  const totalFailed = results.filter(r => r.success && !r.whatsapp_sent).length;
  const totalSuccess = results.filter(r => r.success).length;

  res.json({
    success: true,
    total: results.length,
    saved: totalSuccess,
    whatsapp_sent: totalSent,
    whatsapp_failed: totalFailed,
    results,
    feedback: `✅ Attendance saved for ${totalSuccess} students. WhatsApp sent: ${totalSent}, Failed: ${totalFailed}.`,
  });
};

// ─── GET /api/attendance/history ──────────────────────────────────────────────
const getHistory = (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);

  const records = db.prepare(`
    SELECT
      a.id, a.date, a.status, a.class_taken, a.homework,
      a.whatsapp_sent, a.whatsapp_error, a.created_at,
      s.name AS student_name, s.grade AS student_grade,
      t.name AS teacher_name
    FROM   attendance a
    JOIN   students   s ON a.student_id = s.id
    JOIN   teachers   t ON a.teacher_id = t.id
    ORDER  BY a.created_at DESC
    LIMIT  ?
  `).all(limit);

  res.json({ records });
};

// ─── GET /api/attendance/student/:studentId ───────────────────────────────────
const getStudentHistory = (req, res) => {
  const { studentId } = req.params;

  const student = db.prepare(
    'SELECT id, name, grade FROM students WHERE id = ?'
  ).get(studentId);

  if (!student) {
    return res.status(404).json({ error: 'Student not found.' });
  }

  const records = db.prepare(`
    SELECT date, status, class_taken, homework, whatsapp_sent, whatsapp_error, created_at
    FROM   attendance
    WHERE  student_id = ?
    ORDER  BY date DESC
    LIMIT  30
  `).all(studentId);

  // Attendance summary counts
  const summary = db.prepare(`
    SELECT
      COUNT(*)                                  AS total,
      SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) AS present_count,
      SUM(CASE WHEN status='absent'  THEN 1 ELSE 0 END) AS absent_count
    FROM attendance
    WHERE student_id = ?
  `).get(studentId);

  res.json({ student, records, summary });
};

// ─── GET /api/attendance/report ───────────────────────────────────────────────
const getAttendanceReport = (req, res) => {
  const { from, to, grade } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: 'Both "from" and "to" date parameters are required (YYYY-MM-DD).' });
  }

  let studentsSql = 'SELECT id, name, grade FROM students';
  const studentParams = [];

  if (grade) {
    studentsSql += ' WHERE grade = ?';
    studentParams.push(grade);
  }

  studentsSql += ' ORDER BY grade ASC, name ASC';
  const students = db.prepare(studentsSql).all(...studentParams);

  const report = students.map((student, index) => {
    const summary = db.prepare(`
      SELECT
        COUNT(*)                                           AS working_days,
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present_count
      FROM attendance
      WHERE student_id = ? AND date >= ? AND date <= ?
    `).get(student.id, from, to);

    const workingDays = summary.working_days || 0;
    const presentCount = summary.present_count || 0;
    const percentage = workingDays > 0 ? Math.round((presentCount / workingDays) * 100 * 100) / 100 : 0;

    return {
      sno: index + 1,
      student_name: student.name,
      grade: student.grade,
      working_days: workingDays,
      present_count: presentCount,
      percentage,
    };
  });

  res.json({ report, from, to, grade: grade || 'All' });
};

module.exports = { submitAttendance, submitBulkAttendance, getHistory, getStudentHistory, getAttendanceReport };
