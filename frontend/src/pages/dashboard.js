import { getStudents, getHistory, getWhatsAppStatus, getWhatsAppQR, submitBulkAttendance, getAttendanceReport } from '../api.js';
import { showToast } from '../components/toast.js';
import { renderPageSpinner, setButtonLoading } from '../components/spinner.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const initials = (name) =>
  name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const statusBadge = (status) => {
  if (!status) return `<span class="status-badge pending">🕐 Pending</span>`;
  if (status === 'present') return `<span class="status-badge present">✅ Present</span>`;
  return `<span class="status-badge absent">❌ Absent</span>`;
};

const navbarHTML = (teacher, waStatus) => {
  const waClass = waStatus?.isReady ? 'connected' : waStatus?.hasClient ? 'pending' : 'disconnected';
  const waLabel = waStatus?.isReady ? 'WA Connected' : waStatus?.hasClient ? 'WA Scan QR' : 'WA Offline';
  const avt     = initials(teacher.name);

  return `
    <nav class="navbar">
      <div class="navbar-brand">
        <span class="brand-icon">🏫</span>
        <span class="brand-name">EduTrack</span>
      </div>
      <div class="navbar-right">
        <div class="wa-badge ${waClass}" id="wa-status-badge" title="${waStatus?.statusMessage || ''}">
          <span class="wa-dot"></span>
          <span>${waLabel}</span>
        </div>
        ${teacher.role === 'superadmin' ? '<button class="btn-admin-panel" id="admin-panel-btn">🛡️ Admin Panel</button>' : ''}
        <button class="btn-manage-students" id="manage-students-btn">👨‍🎓 Manage Students</button>
        <div class="teacher-pill">
          <div class="teacher-avatar">${avt}</div>
          <div class="teacher-info">
            <div class="teacher-name">${teacher.name}</div>
            <div class="teacher-role">${teacher.role === 'superadmin' ? '🛡️ Super Admin' : 'Staff'}</div>
          </div>
        </div>
        <button class="btn-logout" id="logout-btn">Logout</button>
      </div>
    </nav>
  `;
};

// ─── Class Filter ─────────────────────────────────────────────────────────────
const classFilterHTML = (grades, selectedGrade) => {
  const options = grades.map(g => {
    const selected = g === selectedGrade ? 'selected' : '';
    return `<option value="${g}" ${selected}>${g}</option>`;
  }).join('');

  return `
    <div class="class-filter-bar">
      <div class="filter-label">
        <span class="filter-icon">📚</span>
        <span>Select Class:</span>
      </div>
      <select id="class-filter" class="class-filter-select">
        <option value="">— Choose a class —</option>
        ${options}
      </select>
      <div class="filter-summary" id="filter-summary"></div>
    </div>
  `;
};

// ─── Bulk Attendance Row per Student ──────────────────────────────────────────
const bulkStudentRow = (student, index) => {
  const avt = initials(student.name);
  const isMarked = !!student.today_status;
  const defaultStatus = student.today_status || 'present'; // Default to present
  const waSentIcon = student.today_whatsapp_sent ? '📱✅' : '';

  return `
    <div class="bulk-student-row" data-student-id="${student.id}" data-index="${index}" style="animation-delay:${index * 0.03}s">
      <div class="bulk-student-info">
        <div class="bulk-avatar">${avt}</div>
        <div class="bulk-name-wrap">
          <span class="bulk-name">${student.name}</span>
          <span class="bulk-phone">📱 +${student.parent_whatsapp}</span>
        </div>
      </div>
      <div class="bulk-status-toggle" data-student-id="${student.id}">
        <button type="button" class="bulk-toggle present ${defaultStatus === 'present' ? 'active' : ''}" data-val="present">
          ✅ Present
        </button>
        <button type="button" class="bulk-toggle absent ${defaultStatus === 'absent' ? 'active' : ''}" data-val="absent">
          ❌ Absent
        </button>
      </div>
      <div class="bulk-row-status">
        ${isMarked ? `<span class="bulk-already-marked">Updated</span>` : ''}
        <span class="bulk-wa-icon">${waSentIcon}</span>
      </div>
    </div>
  `;
};

// ─── History Table ────────────────────────────────────────────────────────────
const historyTableHTML = (records) => {
  if (!records.length) {
    return `
      <div class="table-wrap">
        <table><tbody>
          <tr class="empty-row"><td colspan="7">📭 No attendance records yet. Start marking attendance above!</td></tr>
        </tbody></table>
      </div>
    `;
  }

  const rows = records.map((r) => `
    <tr>
      <td>${formatDate(r.date)}</td>
      <td><strong>${r.student_name}</strong></td>
      <td>${r.student_grade}</td>
      <td>${statusBadge(r.status)}</td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.class_taken}">${r.class_taken}</td>
      <td style="font-size:.8rem" title="${r.whatsapp_error ? r.whatsapp_error.replace(/"/g, '&quot;') : ''}">${r.whatsapp_sent ? '📱 Sent' : '⚠️ Not sent'}</td>
      <td style="font-size:.8rem;color:var(--text-2)">${r.teacher_name || '—'}</td>
    </tr>
  `).join('');

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Student</th>
            <th>Grade</th>
            <th>Status</th>
            <th>Class Taken</th>
            <th>WhatsApp</th>
            <th>Marked By</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
};

// ─── State ────────────────────────────────────────────────────────────────────
let currentGradeFilter = '';

// ─── Main render ──────────────────────────────────────────────────────────────
export const renderDashboard = async (navigate) => {
  const app     = document.getElementById('app');
  const teacher = JSON.parse(localStorage.getItem('teacher') || '{}');

  // Loading state
  app.innerHTML = `
    <div class="app-layout">
      ${navbarHTML(teacher, null)}
      <div class="main-content">${renderPageSpinner()}</div>
    </div>
  `;

  // Wire logout immediately
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('teacher');
    showToast('Logged out successfully.', 'info');
    navigate('login');
  });

  // Fetch data in parallel
  let students = [];
  let grades   = [];
  let history  = [];
  let waStatus = null;

  try {
    const gradeParam = currentGradeFilter || undefined;
    [{ students, grades }, { records: history }, waStatus] = await Promise.all([
      getStudents(gradeParam),
      getHistory(),
      getWhatsAppStatus().catch(() => null),
    ]);
  } catch (err) {
    if (err.message.includes('401') || err.message.toLowerCase().includes('token')) {
      localStorage.removeItem('token');
      navigate('login');
      return;
    }
    showToast('Failed to load data: ' + err.message, 'error');
  }

  // Show WhatsApp warning if not ready
  if (waStatus && !waStatus.isReady) {
    showToast('⚠️ WhatsApp is not connected. Scan the QR code in the server terminal.', 'warning', 8000);
  }

  // Count stats
  const markedCount  = students.filter(s => s.today_status).length;
  const pendingCount = students.length - markedCount;
  const hasClassSelected = !!currentGradeFilter;

  // Build the bulk attendance section (only shown when a class is selected)
  const bulkSection = hasClassSelected && students.length > 0 ? `
    <div class="bulk-attendance-section">
      <div class="bulk-header">
        <div class="bulk-header-left">
          <h3>📋 Mark Attendance — ${currentGradeFilter}</h3>
          <p>${students.length} students · Enter subject & homework, then mark each student</p>
        </div>
        <div class="bulk-quick-actions">
          <button type="button" class="bulk-action-btn mark-all-present" id="mark-all-present">
            ✅ All Present
          </button>
          <button type="button" class="bulk-action-btn mark-all-absent" id="mark-all-absent">
            ❌ All Absent
          </button>
        </div>
      </div>

      <div class="bulk-form-fields">
        <div class="grid-2">
          <div class="form-group">
            <label for="bulk-class-taken">📚 Subject / Class Taken Today</label>
            <input
              id="bulk-class-taken"
              type="text"
              placeholder="e.g. Chapter 5 – Photosynthesis"
              maxlength="200"
              required
            />
          </div>
          <div class="form-group">
            <label for="bulk-homework">📝 Homework to Submit</label>
            <input
              id="bulk-homework"
              type="text"
              placeholder="e.g. Exercise 5.2, Q 1–10"
              maxlength="300"
              required
            />
          </div>
        </div>
      </div>

      <div class="bulk-students-list" id="bulk-students-list">
        ${students.map((s, i) => bulkStudentRow(s, i)).join('')}
      </div>

      <div class="bulk-submit-bar">
        <div class="bulk-submit-summary" id="bulk-submit-summary">
          <span class="summary-present">✅ <strong id="present-count">${students.length}</strong> Present</span>
          <span class="summary-absent">❌ <strong id="absent-count">0</strong> Absent</span>
        </div>
        <button class="btn-submit bulk-submit-btn" id="bulk-submit-btn" type="button">
          📤 Submit All & Send WhatsApp
        </button>
      </div>

      <div id="bulk-result" style="display:none;"></div>
    </div>
  ` : '';

  const noClassMessage = !hasClassSelected ? `
    <div class="select-class-prompt">
      <div class="prompt-icon">👆</div>
      <h3>Select a Class to Begin</h3>
      <p>Choose a class from the dropdown above to mark attendance for all students at once.</p>
    </div>
  ` : '';

  const noStudentsMessage = hasClassSelected && students.length === 0 ? `
    <div class="select-class-prompt">
      <div class="prompt-icon">📭</div>
      <h3>No Students Found</h3>
      <p>There are no students in <strong>${currentGradeFilter}</strong>.</p>
    </div>
  ` : '';

  // Render full dashboard
  app.innerHTML = `
    <div class="app-layout">
      ${navbarHTML(teacher, waStatus)}
      <div class="main-content">

        <div class="page-header">
          <div>
            <h2>Class Attendance</h2>
            <p>Select a class, mark attendance for all students, and send WhatsApp notifications in one click</p>
          </div>
          <div class="header-badges">
            ${hasClassSelected ? `
              <span class="student-count-badge">👨‍🎓 ${students.length} Student${students.length !== 1 ? 's' : ''}</span>
              <span class="student-count-badge marked">✅ ${markedCount} Marked</span>
              <span class="student-count-badge pending-badge">🕐 ${pendingCount} Pending</span>
            ` : ''}
          </div>
        </div>

        ${classFilterHTML(grades, currentGradeFilter)}

        ${noClassMessage}
        ${noStudentsMessage}
        ${bulkSection}

        <div class="section-title" style="margin-top:40px;">
          <span class="section-icon">📋</span>
          Recent Attendance History
        </div>
        ${historyTableHTML(history)}

        <div class="section-title" style="margin-top:40px;">
          <span class="section-icon">📥</span>
          Download Attendance Report
        </div>
        <div class="download-attendance-section">
          <div class="download-controls">
            <div class="download-quick-btns">
              <button class="download-quick-btn" id="dl-this-week" type="button">📅 This Week</button>
              <button class="download-quick-btn" id="dl-this-month" type="button">📅 This Month</button>
            </div>
            <div class="download-date-range">
              <div class="form-group">
                <label for="dl-from">From Date</label>
                <input id="dl-from" type="date" />
              </div>
              <div class="form-group">
                <label for="dl-to">To Date</label>
                <input id="dl-to" type="date" />
              </div>
              <div class="form-group">
                <label for="dl-grade">Class / Grade</label>
                <select id="dl-grade">
                  <option value="">All Classes</option>
                  ${grades.map(g => `<option value="${g}">${g}</option>`).join('')}
                </select>
              </div>
            </div>
            <button class="btn-download-pdf" id="download-pdf-btn" type="button">
              📄 Download PDF
            </button>
          </div>
          <div id="download-status" class="download-status" style="display:none;"></div>
        </div>

      </div>
    </div>
  `;

  // ─── Wire events ────────────────────────────────────────────────────────────

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('teacher');
    showToast('Logged out successfully.', 'info');
    navigate('login');
  });

  // Manage Students
  document.getElementById('manage-students-btn')?.addEventListener('click', () => {
    navigate('students');
  });

  // Admin Panel (super admin only)
  document.getElementById('admin-panel-btn')?.addEventListener('click', () => {
    navigate('admin');
  });

  // Class filter dropdown
  document.getElementById('class-filter')?.addEventListener('change', (e) => {
    currentGradeFilter = e.target.value;
    renderDashboard(navigate); // re-render with new filter
  });

  // WA badge click → open QR modal
  document.getElementById('wa-status-badge')?.addEventListener('click', () => {
    openWhatsAppQRModal(navigate);
  });

  // ─── Bulk attendance wiring (only if class selected) ───────────────────────
  if (hasClassSelected && students.length > 0) {

    // Track statuses: default all to present
    const statuses = {};
    students.forEach(s => {
      statuses[s.id] = s.today_status || 'present';
    });

    const updateCounts = () => {
      const presentCount = Object.values(statuses).filter(s => s === 'present').length;
      const absentCount  = Object.values(statuses).filter(s => s === 'absent').length;
      const el1 = document.getElementById('present-count');
      const el2 = document.getElementById('absent-count');
      if (el1) el1.textContent = presentCount;
      if (el2) el2.textContent = absentCount;
    };

    // Per-student toggle click
    document.getElementById('bulk-students-list')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.bulk-toggle');
      if (!btn) return;
      const row = btn.closest('.bulk-status-toggle');
      const studentId = row.dataset.studentId;
      const val = btn.dataset.val;

      statuses[studentId] = val;

      // Update active state for this row
      row.querySelectorAll('.bulk-toggle').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      updateCounts();
    });

    // Mark all present
    document.getElementById('mark-all-present')?.addEventListener('click', () => {
      Object.keys(statuses).forEach(id => statuses[id] = 'present');
      document.querySelectorAll('.bulk-toggle.present').forEach(b => b.classList.add('active'));
      document.querySelectorAll('.bulk-toggle.absent').forEach(b => b.classList.remove('active'));
      updateCounts();
      showToast('All students marked as Present ✅', 'success', 2000);
    });

    // Mark all absent
    document.getElementById('mark-all-absent')?.addEventListener('click', () => {
      Object.keys(statuses).forEach(id => statuses[id] = 'absent');
      document.querySelectorAll('.bulk-toggle.absent').forEach(b => b.classList.add('active'));
      document.querySelectorAll('.bulk-toggle.present').forEach(b => b.classList.remove('active'));
      updateCounts();
      showToast('All students marked as Absent ❌', 'info', 2000);
    });

    // Submit bulk
    document.getElementById('bulk-submit-btn')?.addEventListener('click', async () => {
      const classTaken = document.getElementById('bulk-class-taken')?.value.trim();
      const homework   = document.getElementById('bulk-homework')?.value.trim();

      if (!classTaken || classTaken.length < 2) {
        showToast('Please enter the subject / class taken today.', 'warning');
        document.getElementById('bulk-class-taken')?.focus();
        return;
      }
      if (!homework || homework.length < 2) {
        showToast('Please enter homework details.', 'warning');
        document.getElementById('bulk-homework')?.focus();
        return;
      }

      const records = Object.entries(statuses).map(([student_id, status]) => ({
        student_id: parseInt(student_id),
        status,
      }));

      const submitBtn = document.getElementById('bulk-submit-btn');
      const restore   = setButtonLoading(submitBtn, 'Submitting & Sending WhatsApp...');
      const resultBox = document.getElementById('bulk-result');
      resultBox.style.display = 'none';

      try {
        const result = await submitBulkAttendance({
          records,
          class_taken: classTaken,
          homework,
        });

        const isFullSuccess = result.whatsapp_failed === 0;
        const resultClass   = isFullSuccess ? 'success' : 'warning';

        // Build per-student result rows
        const detailRows = result.results.map(r => `
          <div class="bulk-result-row ${r.whatsapp_sent ? 'sent' : 'failed'}">
            <span class="bulk-result-name">${r.student_name}</span>
            <span class="bulk-result-status">${r.status === 'present' ? '✅' : '❌'}</span>
            <span class="bulk-result-wa">${r.whatsapp_sent ? '📱 Sent' : '⚠️ Failed'}</span>
          </div>
        `).join('');

        resultBox.innerHTML = `
          <div class="submit-result ${resultClass}">
            <span class="result-icon">${isFullSuccess ? '🎉' : '⚠️'}</span>
            <div class="result-msg">
              <strong>${result.feedback}</strong>
              <div class="bulk-result-details">${detailRows}</div>
            </div>
          </div>
        `;
        resultBox.style.display = 'block';
        resultBox.scrollIntoView({ behavior: 'smooth', block: 'center' });

        showToast(result.feedback, isFullSuccess ? 'success' : 'warning', 6000);

        // Refresh dashboard after 5 seconds
        setTimeout(() => renderDashboard(navigate), 5000);
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
        resultBox.innerHTML = `
          <div class="submit-result error">
            <span class="result-icon">❌</span>
            <div class="result-msg">
              <strong>Submission failed</strong>
              <span>${err.message}</span>
            </div>
          </div>
        `;
        resultBox.style.display = 'block';
      } finally {
        restore();
      }
    });
  }

  // ─── Download Attendance wiring ─────────────────────────────────────────────
  const setDateRange = (from, to) => {
    const fromEl = document.getElementById('dl-from');
    const toEl = document.getElementById('dl-to');
    if (fromEl) fromEl.value = from;
    if (toEl) toEl.value = to;
  };

  document.getElementById('dl-this-week')?.addEventListener('click', () => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const monday = new Date(today);
    monday.setDate(diff);
    setDateRange(monday.toISOString().split('T')[0], today.toISOString().split('T')[0]);
    showToast('Date range set to this week', 'info', 2000);
  });

  document.getElementById('dl-this-month')?.addEventListener('click', () => {
    const today = new Date();
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    setDateRange(first.toISOString().split('T')[0], today.toISOString().split('T')[0]);
    showToast('Date range set to this month', 'info', 2000);
  });

  document.getElementById('download-pdf-btn')?.addEventListener('click', async () => {
    const from = document.getElementById('dl-from')?.value;
    const to = document.getElementById('dl-to')?.value;
    const grade = document.getElementById('dl-grade')?.value || '';
    const statusEl = document.getElementById('download-status');

    if (!from || !to) {
      showToast('Please select both From and To dates.', 'warning');
      return;
    }
    if (from > to) {
      showToast('From date must be before To date.', 'warning');
      return;
    }

    const btn = document.getElementById('download-pdf-btn');
    const origText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-sm"></span> Generating PDF...';
    btn.disabled = true;
    statusEl.style.display = 'none';

    try {
      const data = await getAttendanceReport(from, to, grade);

      if (!data.report || data.report.length === 0) {
        statusEl.innerHTML = '<span class="download-status-msg warning">⚠️ No attendance records found for the selected date range.</span>';
        statusEl.style.display = 'block';
        showToast('No records found for the selected range.', 'warning');
        return;
      }

      // Dynamically load jsPDF and autoTable from local node_modules
      const { jsPDF } = await import('jspdf');
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = autoTableModule.default ? autoTableModule.default : autoTableModule;

      const doc = new jsPDF('landscape', 'mm', 'a4');

      // Title
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('EduTrack — Attendance Report', 14, 20);

      // Subtitle
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(`Period: ${from} to ${to}`, 14, 28);
      doc.text(`Class: ${data.grade}`, 14, 34);
      doc.text(`Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`, 14, 40);

      // Table
      const tableData = data.report.map(r => [
        r.sno,
        r.student_name,
        r.grade,
        r.working_days,
        r.present_count,
        r.percentage + '%',
      ]);

      autoTable(doc, {
        startY: 48,
        head: [['S.No', 'Student Name', 'Class & Board', 'Working Days', 'Present', 'Percentage']],
        body: tableData,
        theme: 'grid',
        headStyles: {
          fillColor: [122, 108, 255],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 10,
        },
        bodyStyles: {
          fontSize: 9,
        },
        alternateRowStyles: {
          fillColor: [245, 245, 255],
        },
        styles: {
          cellPadding: 4,
          lineColor: [200, 200, 220],
          lineWidth: 0.25,
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 15 },
          3: { halign: 'center' },
          4: { halign: 'center' },
          5: { halign: 'center' },
        },
      });

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.getWidth() - 30, doc.internal.pageSize.getHeight() - 10);
      }

      const filename = `attendance_report_${from}_to_${to}${grade ? '_' + grade.replace(/\s+/g, '_') : ''}.pdf`;
      doc.save(filename);

      statusEl.innerHTML = `<span class="download-status-msg success">✅ PDF downloaded: ${filename} (${data.report.length} students)</span>`;
      statusEl.style.display = 'block';
      showToast(`PDF downloaded with ${data.report.length} student records!`, 'success');
    } catch (err) {
      console.error('PDF generation error:', err);
      statusEl.innerHTML = `<span class="download-status-msg error">❌ Failed: ${err.message}</span>`;
      statusEl.style.display = 'block';
      showToast('Failed to generate PDF: ' + err.message, 'error');
    } finally {
      btn.innerHTML = origText;
      btn.disabled = false;
    }
  });
};

// ─── WhatsApp QR Modal ────────────────────────────────────────────────────────
let qrRefreshInterval = null;

const openWhatsAppQRModal = async () => {
  // Remove any existing modal
  document.getElementById('wa-qr-overlay')?.remove();
  if (qrRefreshInterval) clearInterval(qrRefreshInterval);

  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'wa-qr-overlay';
  overlay.className = 'wa-qr-overlay';
  overlay.innerHTML = `
    <div class="wa-qr-modal">
      <div class="wa-qr-header">
        <div class="wa-qr-header-left">
          <span class="wa-qr-header-icon">📱</span>
          <h3>Link WhatsApp</h3>
        </div>
        <button class="wa-qr-close" id="wa-qr-close-btn">✕</button>
      </div>
      <div class="wa-qr-body" id="wa-qr-body">
        <div class="wa-qr-initializing">
          <div class="loader-ring"></div>
          <p class="wa-qr-status-msg">Loading QR code...</p>
        </div>
      </div>
      <div class="wa-qr-footer">
        <div class="wa-qr-refresh-indicator">
          <span class="refresh-dot"></span>
          <span>Auto-refreshes every 5s</span>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => overlay.classList.add('visible'));
  });

  // Close handlers
  const closeModal = () => {
    if (qrRefreshInterval) { clearInterval(qrRefreshInterval); qrRefreshInterval = null; }
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 300);
  };

  document.getElementById('wa-qr-close-btn').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  // Fetch and render QR
  const renderQRContent = async () => {
    const body = document.getElementById('wa-qr-body');
    if (!body) return;

    try {
      const data = await getWhatsAppQR();

      if (data.status === 'connected') {
        body.innerHTML = `
          <div style="font-size:3rem; margin-bottom:8px;">✅</div>
          <p class="wa-qr-status-msg connected">${data.message}</p>
        `;
        if (qrRefreshInterval) { clearInterval(qrRefreshInterval); qrRefreshInterval = null; }
        showToast('WhatsApp is connected! ✅', 'success');
        setTimeout(closeModal, 2000);
        return;
      }

      if (data.status === 'qr_ready' && data.qr) {
        body.innerHTML = `
          <div class="wa-qr-image-wrap">
            <img src="${data.qr}" alt="WhatsApp QR Code" />
          </div>
          <p class="wa-qr-status-msg">${data.message}</p>
          <ul class="wa-qr-steps">
            <li><span class="step-num">1</span> Open WhatsApp on your phone</li>
            <li><span class="step-num">2</span> Tap <strong>Settings → Linked Devices</strong></li>
            <li><span class="step-num">3</span> Tap <strong>Link a Device</strong></li>
            <li><span class="step-num">4</span> Point your camera at this QR code</li>
          </ul>
        `;
      } else {
        body.innerHTML = `
          <div class="wa-qr-initializing">
            <div class="loader-ring"></div>
            <p class="wa-qr-status-msg">${data.message}</p>
          </div>
        `;
      }
    } catch (err) {
      body.innerHTML = `
        <div style="font-size:2rem; margin-bottom:8px;">⚠️</div>
        <p class="wa-qr-status-msg error">Failed to load QR code. Is the server running?</p>
      `;
    }
  };

  // Initial fetch
  await renderQRContent();

  // Auto-refresh every 5 seconds
  qrRefreshInterval = setInterval(renderQRContent, 5000);
};
