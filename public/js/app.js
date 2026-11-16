// Main Application Coordinator & UI Utilities
const app = {
  notificationsOpen: false,

  init() {
    // Set default date for absence date input
    const dateInput = document.getElementById('absence-date');
    if (dateInput) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }

    // Close notifications dropdown when clicking outside
    document.addEventListener('click', (e) => {
      const wrapper = document.querySelector('.notification-btn-wrapper');
      if (wrapper && !wrapper.contains(e.target)) {
        this.closeNotifications();
      }
    });

    // Initialize Auth session
    auth.init();
  },

  showHome() {
    if (auth.currentUser) {
      auth.applyUserSession();
    } else {
      auth.showLoginView();
    }
  },

  toggleSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    if (sidebar) {
      sidebar.classList.toggle('mobile-open');
    }
  },

  setBreadcrumbs(section, current) {
    const sElem = document.getElementById('breadcrumb-section');
    const cElem = document.getElementById('breadcrumb-current');
    if (sElem) sElem.textContent = section;
    if (cElem) cElem.textContent = current;
  },

  toggleNotifications() {
    if (this.notificationsOpen) {
      this.closeNotifications();
    } else {
      this.openNotifications();
    }
  },

  openNotifications() {
    const dropdown = document.getElementById('notifications-dropdown');
    if (dropdown) {
      dropdown.style.display = 'flex';
      this.notificationsOpen = true;
      this.loadNotifications();
    }
  },

  closeNotifications() {
    const dropdown = document.getElementById('notifications-dropdown');
    if (dropdown) {
      dropdown.style.display = 'none';
      this.notificationsOpen = false;
    }
  },

  async loadNotifications() {
    try {
      const data = await api.get('/api/notifications');
      const list = document.getElementById('dropdown-notif-list');
      const badge = document.getElementById('topbar-notif-count');

      if (!list) return;

      const unreadCount = data.unread_count || 0;
      if (badge) {
        if (unreadCount > 0) {
          badge.textContent = unreadCount;
          badge.style.display = 'flex';
        } else {
          badge.style.display = 'none';
        }
      }

      if (!data.notifications || !data.notifications.length) {
        list.innerHTML = `<div style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No notifications right now.</div>`;
        return;
      }

      list.innerHTML = data.notifications.map(n => `
        <div class="dropdown-item ${!n.is_read ? 'unread' : ''}" onclick="app.markNotificationRead(${n.id})">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <span class="dropdown-item-title">${n.title}</span>
            <span class="badge ${n.priority === 'critical' || n.priority === 'high' ? 'badge-danger' : 'badge-primary'}">${n.priority.toUpperCase()}</span>
          </div>
          <div class="dropdown-item-desc">${n.message}</div>
          <div class="dropdown-item-time">${new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      `).join('');
    } catch (err) {
      console.error(err);
    }
  },

  async markNotificationRead(id) {
    try {
      await api.patch(`/api/notifications/${id}/read`);
      this.loadNotifications();
    } catch (e) {
      console.error(e);
    }
  },

  openModal(contentHtml) {
    const container = document.getElementById('modal-container');
    container.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target === this) app.closeModal()">
        <div class="modal-content">
          ${contentHtml}
        </div>
      </div>
    `;
    container.style.display = 'flex';
  },

  closeModal() {
    const container = document.getElementById('modal-container');
    container.style.display = 'none';
    container.innerHTML = '';
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
};

// Bootstrap when DOM ready
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
