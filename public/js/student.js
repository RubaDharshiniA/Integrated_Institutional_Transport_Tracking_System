// Student Portal Logic with Interactive Map Tracking
const student = {
  allocation: null,
  activeTrip: null,
  map: null,
  busMarker: null,
  routePolyline: null,
  stopMarkers: [],
  pollTimer: null,

  init() {
    this.loadStudentData();
    this.loadAbsenceHistory();
  },

  showTab(tabName, btnElement) {
    document.getElementById('stu-tab-tracking').style.display = 'none';
    document.getElementById('stu-tab-bus-pass').style.display = 'none';
    document.getElementById('stu-tab-absence').style.display = 'none';
    document.getElementById('stu-tab-safety').style.display = 'none';

    document.querySelectorAll('#nav-group-student .nav-item').forEach(b => b.classList.remove('active'));
    if (btnElement) {
      btnElement.classList.add('active');
    } else {
      const match = document.querySelector(`#nav-group-student button[onclick*="'${tabName}'"]`);
      if (match) match.classList.add('active');
    }

    const tabTitles = {
      'tracking': 'Live Bus Tracking & ETA',
      'bus-pass': 'Official Digital Bus Pass',
      'absence': 'Notify Driver of Absence',
      'safety': 'Emergency Safety SOS'
    };
    app.setBreadcrumbs('Student Commute', tabTitles[tabName] || 'Tracking');

    if (tabName === 'tracking') {
      document.getElementById('stu-tab-tracking').style.display = 'block';
      if (this.map) {
        setTimeout(() => this.map.invalidateSize(), 200);
      }
    } else if (tabName === 'bus-pass') {
      document.getElementById('stu-tab-bus-pass').style.display = 'block';
    } else if (tabName === 'absence') {
      document.getElementById('stu-tab-absence').style.display = 'block';
      this.loadAbsenceHistory();
    } else if (tabName === 'safety') {
      document.getElementById('stu-tab-safety').style.display = 'block';
    }
  },

  async loadStudentData() {
    try {
      const data = await api.get('/api/allocations/my');
      if (!data.allocated) {
        document.getElementById('stu-eta-countdown').textContent = 'No Active Bus Allocation';
        document.getElementById('stu-stop-info').textContent = 'Please contact the Institutional Transport Desk for seat allocation.';
        document.getElementById('stu-trip-live-badge').textContent = 'UNALLOCATED';
        document.getElementById('stu-trip-live-badge').className = 'badge badge-warning';
        return;
      }

      this.allocation = data.allocation;
      this.activeTrip = data.active_trip;

      // Populate route details card
      document.getElementById('stu-route-name').textContent = `${this.allocation.route_name} (${this.allocation.route_code})`;
      document.getElementById('stu-pickup-stop').textContent = this.allocation.pickup_stop_name;
      document.getElementById('stu-pickup-time').textContent = this.allocation.morning_pickup_time || '07:30 AM';
      document.getElementById('stu-drop-stop').textContent = this.allocation.drop_stop_name || 'Main Campus';

      document.getElementById('stu-bus-num').textContent = this.allocation.bus_number;
      document.getElementById('stu-bus-model').textContent = this.allocation.vehicle_model || 'Institutional Coach';
      document.getElementById('stu-bus-plate').textContent = this.allocation.registration_plate;
      document.getElementById('stu-driver-name').textContent = this.activeTrip?.driver_name || 'Assigned Lead Driver';
      document.getElementById('stu-driver-phone').textContent = this.activeTrip?.driver_phone || '+1-555-TRANS';

      // Populate Digital Bus Pass Card
      document.getElementById('pass-student-name').textContent = this.allocation.student_name;
      document.getElementById('pass-student-roll').textContent = this.allocation.roll_or_emp_id || 'STU-2026';
      document.getElementById('pass-bus-num').textContent = this.allocation.bus_number;
      document.getElementById('pass-seat-num').textContent = this.allocation.seat_number || 'Reserved';
      document.getElementById('pass-pickup-stop').textContent = this.allocation.pickup_stop_name;
      document.getElementById('pass-code').textContent = this.allocation.pass_number || 'PASS-PENDING';
      document.getElementById('pass-valid-date').textContent = this.allocation.valid_until || '2026-12-31';

      const passStatusElem = document.getElementById('pass-card-status');
      if (passStatusElem) {
        passStatusElem.textContent = (this.allocation.pass_status || 'ACTIVE').toUpperCase();
      }

      // Initialize Map
      this.initStudentMap();

      // Start Tracking Poll if trip is active
      if (this.activeTrip) {
        document.getElementById('stu-trip-live-badge').textContent = 'BUS IS EN ROUTE';
        document.getElementById('stu-trip-live-badge').className = 'badge badge-success';
        this.fetchLiveTracking();
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.pollTimer = setInterval(() => this.fetchLiveTracking(), 6000);
      } else {
        document.getElementById('stu-trip-live-badge').textContent = 'TRIP SCHEDULED';
        document.getElementById('stu-trip-live-badge').className = 'badge badge-primary';
        document.getElementById('stu-eta-countdown').textContent = `Scheduled: ${this.allocation.morning_pickup_time || '07:30 AM'}`;
        document.getElementById('stu-stop-info').textContent = `Assigned Stop: ${this.allocation.pickup_stop_name}`;
      }
    } catch (err) {
      console.error(err);
    }
  },

  initStudentMap() {
    if (this.map) return; // already initialized

    const mapContainer = document.getElementById('leaflet-map');
    if (!mapContainer || typeof L === 'undefined') return;

    const defaultLat = this.allocation?.pickup_lat || 12.9750;
    const defaultLng = this.allocation?.pickup_lng || 77.6250;

    this.map = L.map('leaflet-map').setView([defaultLat, defaultLng], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);

    // Add designated student pickup stop pin
    if (this.allocation?.pickup_lat && this.allocation?.pickup_lng) {
      const studentStopIcon = L.divIcon({
        className: 'custom-student-icon',
        html: `<div style="background:#16a34a; color:white; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 4px rgba(0,0,0,0.3); font-size:14px;">🚏</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      L.marker([this.allocation.pickup_lat, this.allocation.pickup_lng], { icon: studentStopIcon })
        .addTo(this.map)
        .bindPopup(`<b>Your Pickup Stop</b><br>${this.allocation.pickup_stop_name}<br>Pickup Time: ${this.allocation.morning_pickup_time}`)
        .openPopup();
    }
  },

  async fetchLiveTracking() {
    if (!this.activeTrip || !this.map) return;

    try {
      const data = await api.get(`/api/tracking/trips/${this.activeTrip.id}/live`);
      const loc = data.latest_location;
      const stops = data.stops || [];

      // Update ETA to student's stop
      const studentStop = stops.find(s => s.id === this.allocation.pickup_stop_id);
      if (studentStop) {
        document.getElementById('stu-eta-countdown').textContent = studentStop.eta_display;
        document.getElementById('stu-stop-info').textContent = `Distance to ${studentStop.stop_name}: ${studentStop.distance_km} km`;
      }

      if (loc && loc.latitude && loc.longitude) {
        const busLatLng = [loc.latitude, loc.longitude];

        const busIcon = L.divIcon({
          className: 'custom-bus-icon',
          html: `<div style="background:#1e3a8a; color:white; width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:3px solid #60a5fa; box-shadow:0 3px 6px rgba(0,0,0,0.4); font-size:18px;">🚌</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17]
        });

        if (!this.busMarker) {
          this.busMarker = L.marker(busLatLng, { icon: busIcon }).addTo(this.map);
        } else {
          this.busMarker.setLatLng(busLatLng);
        }

        this.busMarker.bindPopup(`
          <b>${this.allocation.bus_number} (Live)</b><br>
          Speed: ${loc.speed_kmh} km/h<br>
          Next: ${loc.next_stop_name || 'En route'}<br>
          Updated: ${new Date(loc.timestamp).toLocaleTimeString()}
        `);

        // Draw polyline connecting stops
        if (!this.routePolyline && stops.length > 1) {
          const coords = stops.map(s => [s.latitude, s.longitude]);
          this.routePolyline = L.polyline(coords, { color: '#2563eb', weight: 4, opacity: 0.7 }).addTo(this.map);
          this.map.fitBounds(this.routePolyline.getBounds(), { padding: [40, 40] });
        }
      }
    } catch (err) {
      console.error(err);
    }
  },

  async submitAbsence(e) {
    e.preventDefault();
    const absence_date = document.getElementById('absence-date').value;
    const trip_type = document.getElementById('absence-trip-type').value;
    const reason = document.getElementById('absence-reason').value;

    if (!absence_date) {
      app.showToast('Please select absence date.', 'error');
      return;
    }

    try {
      await api.post('/api/attendance/absence', {
        absence_date,
        trip_type,
        reason
      });
      app.showToast('Absence recorded! Your driver manifest has been updated.', 'success');
      document.getElementById('absence-reason').value = '';
      this.loadAbsenceHistory();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  async loadAbsenceHistory() {
    try {
      const data = await api.get('/api/attendance/my-absences');
      const tbody = document.getElementById('stu-absence-history-body');
      if (!tbody) return;

      if (!data.absences || !data.absences.length) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No absence requests submitted.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.absences.map(a => `
        <tr>
          <td><strong>${a.absence_date}</strong></td>
          <td><span class="badge badge-primary">${a.trip_type.replace('_', ' ')}</span></td>
          <td>${a.reason || 'Personal'}</td>
          <td><span class="badge badge-success">${a.status.toUpperCase()}</span></td>
        </tr>
      `).join('');
    } catch (err) {
      console.error(err);
    }
  },

  async triggerEmergencySos() {
    const desc = document.getElementById('stu-emergency-desc')?.value || 'Student requested urgent assistance onboard transport.';
    if (!confirm('Are you sure you want to trigger this Emergency SOS alert to the Transport Dispatch Center?')) return;

    try {
      await api.post('/api/incidents', {
        trip_id: this.activeTrip?.id || null,
        incident_type: 'sos',
        severity: 'critical',
        description: `[STUDENT EMERGENCY SOS]: ${desc}`
      });
      app.showToast('EMERGENCY SOS ALERT BROADCAST TO DISPATCH & DRIVER!', 'error');
      document.getElementById('stu-emergency-desc').value = '';
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  }
};

