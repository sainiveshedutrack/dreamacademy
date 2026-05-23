import { getAdmins, createAdmin, updateAdmin, deleteAdmin } from '../api.js';
import { showToast } from '../components/toast.js';
import { renderPageSpinner, setButtonLoading } from '../components/spinner.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const initials = (name) =>
  name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

const escapeHTML = (str) => {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ─── State ───────────────────────────────────────────────────────────────────
let allAdmins = [];
let searchQuery = '';
let editingAdmin = null;

const filteredAdmins = () => {
  if (!searchQuery) return allAdmins;
  const q = searchQuery.toLowerCase();
  return allAdmins.filter(a =>
    a.name.toLowerCase().includes(q) ||
    a.email.toLowerCase().includes(q) ||
    (a.role && a.role.toLowerCase().includes(q))
  );
};

// ─── Admin Row HTML ──────────────────────────────────────────────────────────
const adminRowHTML = (admin, index, currentTeacherId) => {
  const avt = initials(admin.name);
  const roleBadge = admin.role === 'superadmin'
    ? '<span class="admin-role-badge superadmin">🛡️ Super Admin</span>'
    : '<span class="admin-role-badge staff">👨‍🏫 Staff</span>';
  const isSelf = admin.id === currentTeacherId;

  return `
    <tr class="student-mgmt-row" style="animation-delay:${index * 0.03}s">
      <td>
        <div class="sm-student-cell">
          <div class="sm-avatar">${avt}</div>
          <div class="sm-name-wrap">
            <span class="sm-name">${escapeHTML(admin.name)}${isSelf ? ' <span style="font-size:.7rem;color:var(--accent-light)">(You)</span>' : ''}</span>
            <span class="sm-id">#${admin.id}</span>
          </div>
        </div>
      </td>
      <td><span style="color:var(--text-2);font-size:.88rem">${escapeHTML(admin.email)}</span></td>
      <td>${roleBadge}</td>
      <td><span style="font-size:.82rem;color:var(--text-3)">${formatDate(admin.created_at)}</span></td>
      <td>
        <div class="sm-actions">
          <button class="sm-btn-edit" data-id="${admin.id}" title="Edit Admin">
            ✏️ Edit
          </button>
          ${!isSelf ? `
            <button class="sm-btn-delete" data-id="${admin.id}" title="Delete Admin">
              🗑️ Delete
            </button>
          ` : ''}
        </div>
      </td>
    </tr>
  `;
};

// ─── Modal HTML ──────────────────────────────────────────────────────────────
const adminFormModalHTML = (admin = null) => {
  const isEdit = !!admin;
  const title = isEdit ? `Edit Admin — ${escapeHTML(admin?.name)}` : 'Add New Admin';
  const btnLabel = isEdit ? '💾 Save Changes' : '➕ Add Admin';

  return `
    <div class="sm-modal-overlay" id="admin-modal-overlay">
      <div class="sm-modal">
        <div class="sm-modal-header">
          <h3>${title}</h3>
          <button class="sm-modal-close" id="modal-close-btn">&times;</button>
        </div>
        <form id="admin-form" novalidate>
          <div class="sm-modal-body">
            <div class="grid-2">
              <div class="form-group">
                <label for="af-name">👤 Full Name *</label>
                <input id="af-name" type="text" placeholder="e.g. John Doe"
                  value="${escapeHTML(admin?.name)}" maxlength="100" required />
              </div>
              <div class="form-group">
                <label for="af-email">✉️ Email *</label>
                <input id="af-email" type="email" placeholder="e.g. john@dream.com"
                  value="${escapeHTML(admin?.email)}" maxlength="100" required />
              </div>
            </div>
            <div class="grid-2">
              <div class="form-group">
                <label for="af-password">🔒 Password ${isEdit ? '(leave blank to keep)' : '*'}</label>
                <input id="af-password" type="password" placeholder="${isEdit ? 'Leave blank to keep current' : 'Min 6 characters'}"
                  minlength="6" maxlength="50" ${isEdit ? '' : 'required'} />
              </div>
              <div class="form-group">
                <label for="af-role">🛡️ Role *</label>
                <select id="af-role" required>
                  <option value="staff" ${admin?.role !== 'superadmin' ? 'selected' : ''}>Staff</option>
                  <option value="superadmin" ${admin?.role === 'superadmin' ? 'selected' : ''}>Super Admin</option>
                </select>
              </div>
            </div>
          </div>
          <div class="sm-modal-footer">
            <button type="button" class="sm-btn-cancel" id="modal-cancel-btn">Cancel</button>
            <button type="submit" class="sm-btn-submit" id="modal-submit-btn">${btnLabel}</button>
          </div>
        </form>
      </div>
    </div>
  `;
};

// ─── Delete Confirmation Modal ───────────────────────────────────────────────
const deleteConfirmHTML = (admin) => `
  <div class="sm-modal-overlay" id="delete-modal-overlay">
    <div class="sm-modal sm-modal-sm">
      <div class="sm-modal-header sm-modal-header-danger">
        <h3>⚠️ Delete Admin</h3>
        <button class="sm-modal-close" id="delete-modal-close">&times;</button>
      </div>
      <div class="sm-modal-body">
        <p class="sm-delete-msg">
          Are you sure you want to delete <strong>${escapeHTML(admin.name)}</strong>?
        </p>
        <div class="sm-delete-warning">
          <span>⚠️</span>
          <span>This will permanently remove this admin account. This action cannot be undone.</span>
        </div>
      </div>
      <div class="sm-modal-footer">
        <button type="button" class="sm-btn-cancel" id="delete-cancel-btn">Cancel</button>
        <button type="button" class="sm-btn-danger" id="delete-confirm-btn">🗑️ Delete Forever</button>
      </div>
    </div>
  </div>
`;

// ─── Main Render ──────────────────────────────────────────────────────────────
export const renderAdminPanel = async (navigate) => {
  const app     = document.getElementById('app');
  const teacher = JSON.parse(localStorage.getItem('teacher') || '{}');

  // Only super admin can access
  if (teacher.role !== 'superadmin') {
    showToast('Access denied. Super Admin privileges required.', 'error');
    navigate('dashboard');
    return;
  }

  const avt = initials(teacher.name || 'T');

  // Loading state
  app.innerHTML = `
    <div class="app-layout">
      <nav class="navbar">
        <div class="navbar-brand">
          <span class="brand-icon">🏫</span>
          <span class="brand-name">EduTrack</span>
        </div>
        <div class="navbar-right">
          <button class="btn-logout" id="nav-back-btn">← Dashboard</button>
        </div>
      </nav>
      <div class="main-content">${renderPageSpinner()}</div>
    </div>
  `;
  document.getElementById('nav-back-btn')?.addEventListener('click', () => navigate('dashboard'));

  // Fetch admins
  try {
    const data = await getAdmins();
    allAdmins = data.teachers || [];
  } catch (err) {
    if (err.message.includes('401') || err.message.includes('403') || err.message.toLowerCase().includes('token')) {
      showToast('Access denied or session expired.', 'error');
      navigate('dashboard');
      return;
    }
    showToast('Failed to load admins: ' + err.message, 'error');
    allAdmins = [];
  }

  renderAdminPage(navigate, teacher);
};

// ─── Render the full page ────────────────────────────────────────────────────
const renderAdminPage = (navigate, teacher) => {
  const app = document.getElementById('app');
  const avt = initials(teacher.name || 'T');
  const admins = filteredAdmins();

  const tableRows = admins.length > 0
    ? admins.map((a, i) => adminRowHTML(a, i, teacher.id)).join('')
    : `<tr class="empty-row"><td colspan="5">📭 No admins found.</td></tr>`;

  app.innerHTML = `
    <div class="app-layout">
      <nav class="navbar">
        <div class="navbar-brand">
          <span class="brand-icon">🏫</span>
          <span class="brand-name">EduTrack</span>
        </div>
        <div class="navbar-right">
          <div class="teacher-pill">
            <div class="teacher-avatar">${avt}</div>
            <div class="teacher-info">
              <div class="teacher-name">${teacher.name}</div>
              <div class="teacher-role">🛡️ Super Admin</div>
            </div>
          </div>
          <button class="btn-logout" id="nav-back-btn">← Dashboard</button>
        </div>
      </nav>

      <div class="main-content sm-page">

        <div class="page-header">
          <div>
            <h2>🛡️ Admin Panel</h2>
            <p>Manage staff accounts — add, edit, or remove admins</p>
          </div>
          <div class="header-badges">
            <span class="student-count-badge">🛡️ ${allAdmins.length} Admin${allAdmins.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <div class="sm-toolbar">
          <div class="sm-search-wrap">
            <span class="sm-search-icon">🔍</span>
            <input id="sm-search" type="text" placeholder="Search by name, email, role..."
              value="${escapeHTML(searchQuery)}" />
          </div>
          <button class="sm-btn-add" id="add-admin-btn">
            <span>➕</span> Add Admin
          </button>
        </div>

        <div class="sm-table-wrap">
          <table class="sm-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="admins-tbody">
              ${tableRows}
            </tbody>
          </table>
        </div>

        <div class="sm-back-row">
          <button class="back-btn" id="back-to-dashboard">← Back to Dashboard</button>
        </div>

      </div>
    </div>

    <div id="modal-container"></div>
  `;

  // ─── Wire events ──────────────────────────────────────────────────────────

  // Back buttons
  document.getElementById('nav-back-btn')?.addEventListener('click', () => navigate('dashboard'));
  document.getElementById('back-to-dashboard')?.addEventListener('click', () => navigate('dashboard'));

  // Search
  document.getElementById('sm-search')?.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderAdminPage(navigate, teacher);
    const input = document.getElementById('sm-search');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });

  // Add admin
  document.getElementById('add-admin-btn')?.addEventListener('click', () => {
    editingAdmin = null;
    openAdminModal(navigate, teacher);
  });

  // Edit & Delete buttons (event delegation on tbody)
  document.getElementById('admins-tbody')?.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.sm-btn-edit');
    const deleteBtn = e.target.closest('.sm-btn-delete');

    if (editBtn) {
      const id = parseInt(editBtn.dataset.id);
      const admin = allAdmins.find(a => a.id === id);
      if (admin) {
        editingAdmin = admin;
        openAdminModal(navigate, teacher);
      }
    }

    if (deleteBtn) {
      const id = parseInt(deleteBtn.dataset.id);
      const admin = allAdmins.find(a => a.id === id);
      if (admin) {
        openDeleteConfirm(navigate, teacher, admin);
      }
    }
  });
};

// ─── Open Admin Modal (Create / Edit) ────────────────────────────────────────
const openAdminModal = (navigate, teacher) => {
  const container = document.getElementById('modal-container');
  container.innerHTML = adminFormModalHTML(editingAdmin);

  requestAnimationFrame(() => {
    const overlay = document.getElementById('admin-modal-overlay');
    overlay?.classList.add('visible');
  });

  const closeModal = () => {
    const overlay = document.getElementById('admin-modal-overlay');
    overlay?.classList.remove('visible');
    setTimeout(() => { container.innerHTML = ''; }, 250);
  };

  document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
  document.getElementById('modal-cancel-btn')?.addEventListener('click', closeModal);

  document.getElementById('admin-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'admin-modal-overlay') closeModal();
  });

  const escHandler = (e) => {
    if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); }
  };
  document.addEventListener('keydown', escHandler);

  // Form submit
  document.getElementById('admin-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name     = document.getElementById('af-name').value.trim();
    const email    = document.getElementById('af-email').value.trim();
    const password = document.getElementById('af-password').value;
    const role     = document.getElementById('af-role').value;

    if (!name) { showToast('Name is required.', 'warning'); document.getElementById('af-name').focus(); return; }
    if (!email) { showToast('Email is required.', 'warning'); document.getElementById('af-email').focus(); return; }
    if (!editingAdmin && (!password || password.length < 6)) {
      showToast('Password must be at least 6 characters.', 'warning');
      document.getElementById('af-password').focus();
      return;
    }

    const submitBtn = document.getElementById('modal-submit-btn');
    const restore = setButtonLoading(submitBtn, editingAdmin ? 'Saving...' : 'Adding...');

    try {
      const payload = { name, email, role };
      if (password) payload.password = password;

      if (editingAdmin) {
        const result = await updateAdmin(editingAdmin.id, payload);
        showToast(result.message || 'Admin updated!', 'success');
      } else {
        payload.password = password;
        const result = await createAdmin(payload);
        showToast(result.message || 'Admin added!', 'success');
      }

      closeModal();

      // Refresh data
      const data = await getAdmins();
      allAdmins = data.teachers || [];
      renderAdminPage(navigate, teacher);
    } catch (err) {
      showToast(err.message || 'Operation failed.', 'error');
    } finally {
      restore();
    }
  });

  setTimeout(() => document.getElementById('af-name')?.focus(), 100);
};

// ─── Open Delete Confirmation ─────────────────────────────────────────────────
const openDeleteConfirm = (navigate, teacher, admin) => {
  const container = document.getElementById('modal-container');
  container.innerHTML = deleteConfirmHTML(admin);

  requestAnimationFrame(() => {
    const overlay = document.getElementById('delete-modal-overlay');
    overlay?.classList.add('visible');
  });

  const closeModal = () => {
    const overlay = document.getElementById('delete-modal-overlay');
    overlay?.classList.remove('visible');
    setTimeout(() => { container.innerHTML = ''; }, 250);
  };

  document.getElementById('delete-modal-close')?.addEventListener('click', closeModal);
  document.getElementById('delete-cancel-btn')?.addEventListener('click', closeModal);

  document.getElementById('delete-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'delete-modal-overlay') closeModal();
  });

  document.getElementById('delete-confirm-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('delete-confirm-btn');
    const restore = setButtonLoading(btn, 'Deleting...');

    try {
      const result = await deleteAdmin(admin.id);
      showToast(result.message || 'Admin deleted!', 'success');
      closeModal();

      const data = await getAdmins();
      allAdmins = data.teachers || [];
      renderAdminPage(navigate, teacher);
    } catch (err) {
      showToast(err.message || 'Delete failed.', 'error');
    } finally {
      restore();
    }
  });
};
