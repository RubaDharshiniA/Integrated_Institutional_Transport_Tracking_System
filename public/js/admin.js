// Administrator Portal Logic
const admin = {
  init() {
    this.loadUsers();
    this.loadAuditLogs();
    this.loadSystemInfo();
  },

  showTab(tabName, btnElement) {
    document.getElementById('admin-tab-users').style.display = 'none';
    document.getElementById('admin-tab-audit').style.display = 'none';
    document.getElementById('admin-tab-system').style.display = 'none';

    document.querySelectorAll('#nav-group-admin .nav-item').forEach(b => b.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');

    if (tabName === 'users') {
      document.getElementById('admin-tab-users').style.display = 'block';
      app.setBreadcrumbs('Administration', 'User Directory');
      this.loadUsers();
    } else if (tabName === 'audit') {
      document.getElementById('admin-tab-audit').style.display = 'block';
      app.setBreadcrumbs('Administration', 'Security & Audit Logs');
      this.loadAuditLogs();
    } else if (tabName === 'system') {
      document.getElementById('admin-tab-system').style.display = 'block';
      app.setBreadcrumbs('Administration', 'System Health');
      this.loadSystemInfo();
    }
  },

  async loadUsers() {
    const search = document.getElementById('admin-user-search')?.value || '';
    const role = document.getElementById('admin-user-role-filter')?.value || '';

    try {
      let url = `/api/users?`;
      if (search) url += `search=${encodeURIComponent(search)}&`;
      if (role) url += `role=${encodeURIComponent(role)}&`;

      const data = await api.get(url);
      const tbody = document.getElementById('admin-users-table-body');

      if (!data.users || data.users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">No users found matching query.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.users.map(u => `
        <tr>
          <td><strong>#${u.id}</strong></td>
          <td>${u.name}</td>
          <td>${u.email}</td>
          <td><span class="role-pill ${u.role}">${u.role.toUpperCase()}</span></td>
          <td>${u.department || u.roll_or_emp_id || '-'}</td>
          <td>${u.phone || '-'}</td>
          <td>
            <span class="badge ${u.status === 'active' ? 'badge-success' : 'badge-danger'}">
              ${u.status}
            </span>
          </td>
          <td>
            <button class="btn btn-sm btn-secondary" onclick="admin.openEditUserModal(${u.id}, '${escape(u.name)}', '${u.role}', '${escape(u.department || '')}', '${escape(u.phone || '')}', '${u.status}')">Edit</button>
            ${u.status === 'active' && u.id !== auth.currentUser.id ? `
              <button class="btn btn-sm btn-danger" onclick="admin.deactivateUser(${u.id})">Deactivate</button>
            ` : ''}
          </td>
        </tr>
      `).join('');
    } catch (err) {
      app.showToast('Failed to load users: ' + err.message, 'error');
    }
  },

  openAddUserModal() {
    const modalHtml = `
      <div class="modal-header">
        <h3 class="card-title">Add New Institutional User</h3>
        <button class="modal-close" onclick="app.closeModal()">&times;</button>
      </div>
      <form onsubmit="admin.saveNewUser(event)">
        <div class="form-group">
          <label>Full Name</label>
          <input type="text" id="m-user-name" class="form-control" required placeholder="e.g. John Smith">
        </div>
        <div class="form-group">
          <label>Email Address</label>
          <input type="email" id="m-user-email" class="form-control" required placeholder="name@transport.edu">
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" id="m-user-pass" class="form-control" required placeholder="Minimum 6 characters">
        </div>
        <div class="form-group">
          <label>Role</label>
          <select id="m-user-role" class="form-control" required onchange="admin.toggleRoleExtraFields(this.value)">
            <option value="student">Student</option>
            <option value="driver">Driver</option>
            <option value="manager">Transport Manager</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
        <div class="form-group">
          <label>Phone Number</label>
          <input type="text" id="m-user-phone" class="form-control" placeholder="+1-555-0199">
        </div>
        <div class="form-group">
          <label>Department / Major</label>
          <input type="text" id="m-user-dept" class="form-control" placeholder="e.g. Computer Science">
        </div>
        <div class="form-group">
          <label>Roll Number / Employee ID</label>
          <input type="text" id="m-user-empid" class="form-control" placeholder="STU-2026-009 or EMP-101">
        </div>
        <div id="m-driver-extra" style="display: none; background: #f8fafc; padding: 0.75rem; border-radius: var(--radius-sm); border: 1px dashed var(--border); margin-bottom: 1rem;">
          <div class="form-group">
            <label>Driver License Number</label>
            <input type="text" id="m-driver-license" class="form-control" placeholder="DL-KA-2026-12345">
          </div>
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%;">Create Account</button>
      </form>
    `;
    app.openModal(modalHtml);
  },

  toggleRoleExtraFields(role) {
    const box = document.getElementById('m-driver-extra');
    if (box) box.style.display = role === 'driver' ? 'block' : 'none';
  },

  async saveNewUser(e) {
    e.preventDefault();
    const payload = {
      name: document.getElementById('m-user-name').value,
      email: document.getElementById('m-user-email').value,
      password: document.getElementById('m-user-pass').value,
      role: document.getElementById('m-user-role').value,
      phone: document.getElementById('m-user-phone').value,
      department: document.getElementById('m-user-dept').value,
      roll_or_emp_id: document.getElementById('m-user-empid').value
    };

    if (payload.role === 'driver') {
      payload.license_number = document.getElementById('m-driver-license')?.value;
    }

    try {
      await api.post('/api/users', payload);
      app.showToast('User created successfully!', 'success');
      app.closeModal();
      this.loadUsers();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  openEditUserModal(id, nameEsc, role, deptEsc, phoneEsc, status) {
    const name = unescape(nameEsc);
    const dept = unescape(deptEsc);
    const phone = unescape(phoneEsc);

    const modalHtml = `
      <div class="modal-header">
        <h3 class="card-title">Edit User #${id}</h3>
        <button class="modal-close" onclick="app.closeModal()">&times;</button>
      </div>
      <form onsubmit="admin.saveEditUser(event, ${id})">
        <div class="form-group">
          <label>Full Name</label>
          <input type="text" id="m-edit-name" class="form-control" value="${name}" required>
        </div>
        <div class="form-group">
          <label>Role</label>
          <select id="m-edit-role" class="form-control">
            <option value="student" ${role === 'student' ? 'selected' : ''}>Student</option>
            <option value="driver" ${role === 'driver' ? 'selected' : ''}>Driver</option>
            <option value="manager" ${role === 'manager' ? 'selected' : ''}>Transport Manager</option>
            <option value="admin" ${role === 'admin' ? 'selected' : ''}>Administrator</option>
          </select>
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="m-edit-status" class="form-control">
            <option value="active" ${status === 'active' ? 'selected' : ''}>Active</option>
            <option value="inactive" ${status === 'inactive' ? 'selected' : ''}>Inactive</option>
            <option value="suspended" ${status === 'suspended' ? 'selected' : ''}>Suspended</option>
          </select>
        </div>
        <div class="form-group">
          <label>Phone</label>
          <input type="text" id="m-edit-phone" class="form-control" value="${phone}">
        </div>
        <div class="form-group">
          <label>Department</label>
          <input type="text" id="m-edit-dept" class="form-control" value="${dept}">
        </div>
        <div class="form-group">
          <label>Reset Password (Optional)</label>
          <input type="password" id="m-edit-pass" class="form-control" placeholder="Leave blank to keep current">
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%;">Save Changes</button>
      </form>
    `;
    app.openModal(modalHtml);
  },

  async saveEditUser(e, id) {
    e.preventDefault();
    const payload = {
      name: document.getElementById('m-edit-name').value,
      role: document.getElementById('m-edit-role').value,
      status: document.getElementById('m-edit-status').value,
      phone: document.getElementById('m-edit-phone').value,
      department: document.getElementById('m-edit-dept').value
    };

    const pass = document.getElementById('m-edit-pass').value;
    if (pass && pass.trim()) {
      payload.password = pass.trim();
    }

    try {
      await api.put(`/api/users/${id}`, payload);
      app.showToast('User updated successfully!', 'success');
      app.closeModal();
      this.loadUsers();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  async deactivateUser(id) {
    if (!confirm(`Are you sure you want to deactivate user account #${id}?`)) return;
    try {
      await api.delete(`/api/users/${id}`);
      app.showToast('User deactivated successfully.', 'info');
      this.loadUsers();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  async loadAuditLogs() {
    try {
      const data = await api.get('/api/reports/audit?limit=50');
      const tbody = document.getElementById('admin-audit-table-body');
      if (!data.audit_logs || data.audit_logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center;">No audit entries found.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.audit_logs.map(log => `
        <tr>
          <td><small>${new Date(log.timestamp).toLocaleString()}</small></td>
          <td><strong>${log.user_name || 'System'}</strong> <small style="opacity:0.7;">(${log.user_role || 'sys'})</small></td>
          <td><span class="badge badge-primary">${log.action}</span></td>
          <td>${log.entity_type} #${log.entity_id || ''}</td>
          <td><small>${log.details || ''}</small></td>
          <td><code>${log.ip_address || '127.0.0.1'}</code></td>
        </tr>
      `).join('');
    } catch (err) {
      console.error(err);
    }
  },

  async loadSystemInfo() {
    try {
      const health = await api.get('/api/health');
      const badge = document.getElementById('admin-db-type');
      if (badge) badge.textContent = health.db_type.toUpperCase();
      const timeElem = document.getElementById('admin-system-time');
      if (timeElem) timeElem.textContent = new Date().toLocaleString();
    } catch (err) {
      console.error(err);
    }
  },

  async reseedDatabase() {
    if (!confirm('This will refresh the sample fleet, routes, trips, and demo accounts. Continue?')) return;
    try {
      app.showToast('Resetting seed database...', 'info');
      // Call test endpoint or refresh
      location.reload();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  }
};
