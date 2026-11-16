// Authentication & Role Switching
const auth = {
  currentUser: null,

  async init() {
    const token = api.getToken();
    if (!token) {
      this.showLoginView();
      return;
    }

    try {
      const data = await api.get('/api/auth/me');
      this.currentUser = data.user;
      this.applyUserSession(data);
    } catch (err) {
      this.logout();
    }
  },

  async handleLogin(event) {
    if (event) event.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
      const data = await api.post('/api/auth/login', { email, password });
      api.setToken(data.token);
      this.currentUser = data.user;
      app.showToast('Login successful!', 'success');
      this.applyUserSession(data);
    } catch (err) {
      app.showToast(err.message || 'Login failed', 'error');
    }
  },

  async quickLogin(email, password) {
    try {
      const data = await api.post('/api/auth/login', { email, password });
      api.setToken(data.token);
      this.currentUser = data.user;
      app.showToast(`Logged in as ${data.user.name} (${data.user.role})`, 'success');
      this.applyUserSession(data);
    } catch (err) {
      app.showToast(err.message || 'Quick login failed', 'error');
    }
  },

  async switchRole(role) {
    const demoCredentials = {
      admin: { email: 'admin@transport.edu', pass: 'Admin@123' },
      manager: { email: 'manager@transport.edu', pass: 'Manager@123' },
      driver: { email: 'driver@transport.edu', pass: 'Driver@123' },
      student: { email: 'student@transport.edu', pass: 'Student@123' }
    };

    const creds = demoCredentials[role];
    if (creds) {
      await this.quickLogin(creds.email, creds.pass);
    }
  },

  applyUserSession(sessionData) {
    document.getElementById('view-login').style.display = 'none';
    document.getElementById('app-layout').style.display = 'flex';

    const user = this.currentUser;

    // Update Sidebar Profile
    const nameElem = document.getElementById('sidebar-user-name');
    const roleElem = document.getElementById('sidebar-user-role');
    const avatarElem = document.getElementById('sidebar-user-avatar');

    if (nameElem) nameElem.textContent = user.name;
    if (roleElem) roleElem.textContent = user.role.toUpperCase();
    if (avatarElem) avatarElem.textContent = user.name.charAt(0).toUpperCase();

    // Hide all navigation groups
    const groups = ['admin', 'manager', 'driver', 'student'];
    groups.forEach(g => {
      const grp = document.getElementById(`nav-group-${g}`);
      if (grp) grp.style.display = 'none';
      const segBtn = document.getElementById(`seg-${g}`);
      if (segBtn) segBtn.classList.remove('active');
    });

    // Show active navigation group & highlight segmented button
    const activeGroup = document.getElementById(`nav-group-${user.role}`);
    if (activeGroup) activeGroup.style.display = 'flex';
    const activeSeg = document.getElementById(`seg-${user.role}`);
    if (activeSeg) activeSeg.classList.add('active');

    // Hide all view workspaces
    document.getElementById('view-admin').style.display = 'none';
    document.getElementById('view-manager').style.display = 'none';
    document.getElementById('view-driver').style.display = 'none';
    document.getElementById('view-student').style.display = 'none';

    // Route to appropriate view workspace
    if (user.role === 'admin') {
      document.getElementById('view-admin').style.display = 'block';
      app.setBreadcrumbs('Administration', 'User Directory');
      admin.init();
    } else if (user.role === 'manager') {
      document.getElementById('view-manager').style.display = 'block';
      app.setBreadcrumbs('Operations', 'Dashboard');
      manager.init();
    } else if (user.role === 'driver') {
      document.getElementById('view-driver').style.display = 'block';
      app.setBreadcrumbs('Driver Console', 'Active Trip & GPS');
      driver.init();
    } else if (user.role === 'student') {
      document.getElementById('view-student').style.display = 'block';
      app.setBreadcrumbs('Student Commute', 'Live Tracking & ETA');
      student.init();
    }

    // Load initial notifications badge
    app.loadNotifications();
  },

  logout() {
    api.setToken(null);
    this.currentUser = null;
    this.showLoginView();
    app.showToast('You have been signed out.', 'info');
  },

  showLoginView() {
    document.getElementById('view-login').style.display = 'flex';
    document.getElementById('app-layout').style.display = 'none';
  }
};
