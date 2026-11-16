// Driver Console Logic
const driver = {
  activeTrip: null,
  allTrips: [],
  tripStops: [],
  simInterval: null,
  simIndex: 0,

  init() {
    this.loadMyTrips();
  },

  showTab(tabName, btnElement) {
    document.getElementById('drv-tab-active-trip').style.display = 'none';
    document.getElementById('drv-tab-manifest').style.display = 'none';
    document.getElementById('drv-tab-all-trips').style.display = 'none';

    document.querySelectorAll('#nav-group-driver .nav-item').forEach(b => b.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');

    const tabTitles = {
      'active-trip': 'Active Trip & GPS Console',
      'manifest': 'Passenger Manifest & Absences',
      'all-trips': 'My Assigned Schedule'
    };
    app.setBreadcrumbs('Driver Console', tabTitles[tabName] || 'Active Trip');

    if (tabName === 'active-trip') {
      document.getElementById('drv-tab-active-trip').style.display = 'block';
    } else if (tabName === 'manifest') {
      document.getElementById('drv-tab-manifest').style.display = 'block';
      this.loadManifest();
    } else if (tabName === 'all-trips') {
      document.getElementById('drv-tab-all-trips').style.display = 'block';
      this.loadMyTrips();
    }
  },

  async loadMyTrips() {
    try {
      const data = await api.get('/api/trips/driver/my-trips');
      this.allTrips = data.trips || [];

      // Render My Trips table
      const tbody = document.getElementById('drv-my-trips-table-body');
      if (tbody) {
        if (!this.allTrips.length) {
          tbody.innerHTML = `<tr><td colspan="8" style="text-align: center;">No trips assigned to your profile today.</td></tr>`;
        } else {
          tbody.innerHTML = this.allTrips.map(t => `
            <tr>
              <td><strong>${t.trip_code}</strong></td>
              <td>${t.trip_date}</td>
              <td><span class="badge badge-primary">${t.trip_type.replace('_', ' ')}</span></td>
              <td>${t.route_name}</td>
              <td>${t.bus_number}</td>
              <td>${t.total_passengers} students</td>
              <td>
                <span class="badge ${t.status === 'in_progress' ? 'badge-success' : (t.status === 'completed' ? 'badge-info' : 'badge-warning')}">
                  ${t.status.toUpperCase()}
                </span>
              </td>
              <td>
                <button class="btn btn-sm btn-primary" onclick="driver.selectTrip(${t.id})">Select</button>
              </td>
            </tr>
          `).join('');
        }
      }

      // Automatically pick in_progress trip or first scheduled trip
      const inProg = this.allTrips.find(t => t.status === 'in_progress');
      if (inProg) {
        await this.selectTrip(inProg.id);
      } else if (this.allTrips.length > 0 && !this.activeTrip) {
        await this.selectTrip(this.allTrips[0].id);
      }
    } catch (err) {
      app.showToast('Failed to load assigned trips: ' + err.message, 'error');
    }
  },

  async selectTrip(tripId) {
    const trip = this.allTrips.find(t => t.id === tripId);
    if (!trip) return;
    this.activeTrip = trip;

    document.getElementById('drv-trip-code').textContent = trip.trip_code;
    document.getElementById('drv-route-name').textContent = `${trip.route_name} (${trip.start_location} ➔ ${trip.end_location})`;
    document.getElementById('drv-bus-number').textContent = `${trip.bus_number} (${trip.registration_plate})`;
    document.getElementById('drv-trip-time').textContent = `${trip.trip_date} (${trip.trip_type.replace('_', ' ')})`;

    const badge = document.getElementById('drv-trip-status-badge');
    badge.textContent = trip.status.toUpperCase();
    badge.className = `badge ${trip.status === 'in_progress' ? 'badge-success' : (trip.status === 'completed' ? 'badge-info' : 'badge-warning')}`;

    const btnStart = document.getElementById('btn-driver-start-trip');
    const btnComplete = document.getElementById('btn-driver-complete-trip');

    if (trip.status === 'in_progress') {
      btnStart.disabled = true;
      btnComplete.disabled = false;
    } else if (trip.status === 'scheduled') {
      btnStart.disabled = false;
      btnComplete.disabled = true;
    } else {
      btnStart.disabled = true;
      btnComplete.disabled = true;
    }

    // Load stops for GPS simulation
    try {
      const routeData = await api.get(`/api/routes/${trip.route_id}`);
      this.tripStops = routeData.stops || [];
      const stopSelect = document.getElementById('drv-next-stop-select');
      if (stopSelect) {
        stopSelect.innerHTML = this.tripStops.map(s => `
          <option value="${s.id}" data-lat="${s.latitude}" data-lng="${s.longitude}" data-order="${s.stop_order}">
            Stop #${s.stop_order}: ${s.stop_name} (${s.morning_pickup_time || ''})
          </option>
        `).join('');
      }
    } catch (e) {
      console.error(e);
    }
  },

  async startTrip() {
    if (!this.activeTrip) return;
    try {
      const res = await api.put(`/api/trips/${this.activeTrip.id}/start`, {});
      app.showToast('Trip is now IN PROGRESS! Live tracking enabled.', 'success');
      this.activeTrip.status = 'in_progress';
      this.selectTrip(this.activeTrip.id);
      this.loadManifest();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  async completeTrip() {
    if (!this.activeTrip) return;
    if (!confirm('Are you sure you want to complete this commute trip?')) return;
    try {
      if (this.simInterval) this.toggleAutoSimulation();
      await api.put(`/api/trips/${this.activeTrip.id}/complete`, {});
      app.showToast('Trip successfully completed and closed.', 'info');
      this.activeTrip.status = 'completed';
      this.selectTrip(this.activeTrip.id);
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  onStopSelectChange() {
    // Handled on manual ping
  },

  async sendManualGpsPing() {
    if (!this.activeTrip) {
      app.showToast('No active trip selected.', 'error');
      return;
    }

    const select = document.getElementById('drv-next-stop-select');
    const selectedOption = select?.options[select.selectedIndex];
    const speed = parseFloat(document.getElementById('drv-gps-speed')?.value || 35);

    let lat = 12.9755;
    let lng = 77.6295;
    let stopName = 'Approaching next stop';
    let order = 1;

    if (selectedOption) {
      lat = parseFloat(selectedOption.getAttribute('data-lat'));
      lng = parseFloat(selectedOption.getAttribute('data-lng'));
      stopName = selectedOption.text;
      order = parseInt(selectedOption.getAttribute('data-order'));
    }

    try {
      await api.post(`/api/tracking/trips/${this.activeTrip.id}/location`, {
        latitude: lat,
        longitude: lng,
        speed_kmh: speed,
        heading: 75,
        next_stop_name: stopName,
        current_stop_order: order
      });
      app.showToast(`GPS Telemetry Ping sent (${speed} km/h ➔ ${stopName.slice(0, 25)})`, 'success');
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  toggleAutoSimulation() {
    const btn = document.getElementById('btn-driver-sim-toggle');
    if (this.simInterval) {
      clearInterval(this.simInterval);
      this.simInterval = null;
      btn.textContent = '▶️ Start Auto-Ping';
      btn.className = 'btn btn-secondary';
      app.showToast('GPS simulation stopped.', 'info');
    } else {
      if (!this.activeTrip || this.activeTrip.status !== 'in_progress') {
        app.showToast('Please start the trip before enabling GPS simulation.', 'warning');
        return;
      }
      this.simIndex = 0;
      btn.textContent = '⏹️ Stop Auto-Ping';
      btn.className = 'btn btn-danger';
      app.showToast('Auto GPS simulation active (ping every 5s).', 'success');

      this.simInterval = setInterval(async () => {
        if (!this.tripStops.length) return;
        const currentStop = this.tripStops[this.simIndex % this.tripStops.length];
        this.simIndex++;

        // Select the stop in dropdown
        const select = document.getElementById('drv-next-stop-select');
        if (select) select.value = currentStop.id;

        // Slight jitter to simulate realistic moving bus
        const jitterLat = currentStop.latitude + (Math.random() - 0.5) * 0.002;
        const jitterLng = currentStop.longitude + (Math.random() - 0.5) * 0.002;
        const randomSpeed = Math.floor(30 + Math.random() * 25);

        try {
          await api.post(`/api/tracking/trips/${this.activeTrip.id}/location`, {
            latitude: jitterLat,
            longitude: jitterLng,
            speed_kmh: randomSpeed,
            heading: 80,
            next_stop_name: currentStop.stop_name,
            current_stop_order: currentStop.stop_order
          });
          console.log(`[GPS Auto-Ping] Bus at ${currentStop.stop_name} (${randomSpeed} km/h)`);
        } catch (e) {
          console.error(e);
        }
      }, 5000);
    }
  },

  async loadManifest() {
    if (!this.activeTrip) return;
    try {
      const data = await api.get(`/api/trips/${this.activeTrip.id}/manifest`);
      const tbody = document.getElementById('drv-manifest-table-body');
      if (!tbody) return;

      if (!data.manifest || !data.manifest.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No students allocated to this route.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.manifest.map(m => {
        return `
          <tr style="${m.is_absent ? 'background-color: #fef2f2;' : ''}">
            <td><strong>#${m.pickup_stop_order}: ${m.pickup_stop_name}</strong></td>
            <td>
              <div><strong>${m.student_name}</strong></div>
              <small style="color:var(--text-muted);">${m.student_email}</small>
            </td>
            <td>${m.roll_or_emp_id || '-'} | <small>${m.student_phone || '-'}</small></td>
            <td><span class="badge badge-info">${m.seat_number || '-'}</span></td>
            <td>
              ${m.is_absent ? `
                <span class="badge badge-danger">ABSENT - SKIP STOP</span>
                <div style="font-size:0.75rem; color:var(--danger);">${m.absence_reason || 'Notified'}</div>
              ` : `
                <span class="badge badge-success">EXPECTED</span>
              `}
            </td>
            <td>
              ${m.boarded ? `
                <span class="badge badge-success">✓ BOARDED</span>
              ` : (m.is_absent ? `
                <span style="font-size:0.8rem; color:var(--text-muted);">Absent</span>
              ` : `
                <button class="btn btn-sm btn-primary" onclick="driver.checkInStudent(${m.student_id}, ${m.pickup_stop_id})">
                  Mark Boarded
                </button>
              `)}
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error(err);
    }
  },

  async checkInStudent(studentId, stopId) {
    if (!this.activeTrip) return;
    try {
      await api.post('/api/attendance/check-in', {
        trip_id: this.activeTrip.id,
        student_id: studentId,
        stop_id: stopId,
        type: 'boarded'
      });
      app.showToast('Student boarded marked!', 'success');
      this.loadManifest();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  openReportIncidentModal() {
    if (!this.activeTrip) return;
    const modalHtml = `
      <div class="modal-header">
        <h3 class="card-title">Report Delay or Operational Problem</h3>
        <button class="modal-close" onclick="app.closeModal()">&times;</button>
      </div>
      <form onsubmit="driver.submitIncident(event)">
        <div class="form-group">
          <label>Issue Category</label>
          <select id="m-drv-inc-type" class="form-control" required>
            <option value="traffic_delay">Traffic Jam / Roadwork Delay</option>
            <option value="breakdown">Mechanical Breakdown / Puncture</option>
            <option value="bad_weather">Adverse Weather / Flash Flood</option>
            <option value="medical_emergency">Medical Emergency on Board</option>
            <option value="sos">Emergency SOS / Immediate Assistance</option>
          </select>
        </div>
        <div class="form-group">
          <label>Severity</label>
          <select id="m-drv-inc-sev" class="form-control" required>
            <option value="medium">Medium Delay (10-20 mins)</option>
            <option value="high">Major Delay (30+ mins)</option>
            <option value="critical">Critical / Vehicle Stalled</option>
            <option value="low">Minor Notice</option>
          </select>
        </div>
        <div class="form-group">
          <label>Description & Landmark</label>
          <textarea id="m-drv-inc-desc" class="form-control" rows="3" required placeholder="Specify location, reason, estimated delay time..."></textarea>
        </div>
        <button type="submit" class="btn btn-warning" style="width: 100%;">Broadcast Alert to Operations</button>
      </form>
    `;
    app.openModal(modalHtml);
  },

  async submitIncident(e) {
    e.preventDefault();
    const payload = {
      trip_id: this.activeTrip ? this.activeTrip.id : null,
      incident_type: document.getElementById('m-drv-inc-type').value,
      severity: document.getElementById('m-drv-inc-sev').value,
      description: document.getElementById('m-drv-inc-desc').value
    };

    try {
      await api.post('/api/incidents', payload);
      app.showToast('Delay reported to operations desk.', 'info');
      app.closeModal();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  }
};

