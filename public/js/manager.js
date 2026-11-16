// Transport Manager Portal Logic
const manager = {
  activeTab: 'overview',
  cachedVehicles: [],
  cachedRoutes: [],
  cachedDrivers: [],

  init() {
    this.loadDashboardStats();
    this.loadActiveTrips();
    this.loadIncidents();
  },

  showTab(tabName, btnElement) {
    this.activeTab = tabName;
    const tabs = ['overview', 'fleet', 'routes', 'trips', 'allocations', 'incidents'];
    tabs.forEach(t => {
      const el = document.getElementById(`mgr-tab-${t}`);
      if (el) el.style.display = 'none';
    });

    document.querySelectorAll('#nav-group-manager .nav-item').forEach(b => b.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');

    const target = document.getElementById(`mgr-tab-${tabName}`);
    if (target) target.style.display = 'block';

    const tabTitles = {
      overview: 'Operations Dashboard',
      fleet: 'Fleet Vehicles & Maintenance',
      routes: 'Routes & Sequenced Stops',
      trips: 'Trip Dispatch & Schedules',
      allocations: 'Student Pass Allocations',
      incidents: 'Incident & Delay Alerts'
    };

    app.setBreadcrumbs('Operations', tabTitles[tabName] || 'Dashboard');

    if (tabName === 'overview') {
      this.loadDashboardStats();
      this.loadActiveTrips();
    } else if (tabName === 'fleet') {
      this.loadFleet();
    } else if (tabName === 'routes') {
      this.loadRoutes();
    } else if (tabName === 'trips') {
      this.loadTrips();
    } else if (tabName === 'allocations') {
      this.loadAllocations();
    } else if (tabName === 'incidents') {
      this.loadIncidents();
    }
  },

  async exportCsv(type) {
    try {
      const token = api.getToken();
      const res = await fetch(`/api/reports/export/${type}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error('Failed to export CSV');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `iitts-${type}-report.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      app.showToast(`${type.toUpperCase()} report exported successfully.`, 'success');
    } catch (err) {
      app.showToast('CSV export failed: ' + err.message, 'error');
    }
  },

  async loadDashboardStats() {
    try {
      const data = await api.get('/api/reports/dashboard');
      document.getElementById('stat-active-buses').textContent = data.vehicles?.active_vehicles || 0;
      document.getElementById('stat-trips-today').textContent = data.trips_today?.total_trips_today || 0;
      document.getElementById('stat-students-allocated').textContent = data.allocations?.total_students_allocated || 0;
      document.getElementById('stat-fleet-occupancy').textContent = (data.allocations?.fleet_occupancy_percentage || 0) + '%';
    } catch (err) {
      console.error(err);
    }
  },

  async loadActiveTrips() {
    try {
      const data = await api.get('/api/trips/active');
      const tbody = document.getElementById('mgr-active-trips-table');
      if (!tbody) return;

      if (!data.active_trips || data.active_trips.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No trips currently in progress.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.active_trips.map(t => `
        <tr>
          <td><strong>${t.trip_code}</strong></td>
          <td>${t.route_name}</td>
          <td><span class="badge badge-primary">${t.bus_number}</span></td>
          <td>${t.driver_name}</td>
          <td>${t.next_stop_name || 'Approaching stop'}</td>
          <td><span class="badge badge-success">IN PROGRESS</span></td>
        </tr>
      `).join('');
    } catch (err) {
      console.error(err);
    }
  },

  async loadFleet() {
    try {
      const data = await api.get('/api/fleet/vehicles');
      this.cachedVehicles = data.vehicles || [];
      const tbody = document.getElementById('mgr-fleet-table-body');

      if (!this.cachedVehicles.length) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align: center;">No vehicles registered.</td></tr>`;
        return;
      }

      tbody.innerHTML = this.cachedVehicles.map(v => {
        const occ = parseInt(v.allocated_students_count || 0);
        const cap = parseInt(v.capacity);
        const isFull = occ >= cap;

        return `
          <tr>
            <td><strong>${v.bus_number}</strong></td>
            <td><code>${v.registration_plate}</code></td>
            <td>${v.model}</td>
            <td>${v.fuel_type || 'Diesel'}</td>
            <td><strong>${cap}</strong> seats</td>
            <td>
              <span class="badge ${isFull ? 'badge-danger' : 'badge-info'}">
                ${occ} / ${cap} seats
              </span>
            </td>
            <td>${v.driver_name || '<span style="color:var(--text-muted);">Unassigned</span>'}</td>
            <td>
              <span class="badge ${v.status === 'active' ? 'badge-success' : (v.status === 'maintenance' ? 'badge-warning' : 'badge-danger')}">
                ${v.status.replace('_', ' ')}
              </span>
            </td>
            <td>
              <button class="btn btn-sm btn-secondary" onclick="manager.openMaintenanceModal(${v.id}, '${v.bus_number}')">Service</button>
              <button class="btn btn-sm btn-secondary" onclick="manager.openEditVehicleModal(${v.id})">Edit</button>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      app.showToast('Failed to load fleet: ' + err.message, 'error');
    }
  },

  openAddVehicleModal() {
    const modalHtml = `
      <div class="modal-header">
        <h3 class="card-title">Add Vehicle to Institutional Fleet</h3>
        <button class="modal-close" onclick="app.closeModal()">&times;</button>
      </div>
      <form onsubmit="manager.saveNewVehicle(event)">
        <div class="form-group">
          <label>Bus Number / Fleet ID</label>
          <input type="text" id="m-veh-busnum" class="form-control" required placeholder="e.g. BUS-105">
        </div>
        <div class="form-group">
          <label>Registration Plate Number</label>
          <input type="text" id="m-veh-plate" class="form-control" required placeholder="e.g. KA-01-MN-5500">
        </div>
        <div class="form-group">
          <label>Seating Capacity</label>
          <input type="number" id="m-veh-capacity" class="form-control" required min="1" max="100" value="35">
        </div>
        <div class="form-group">
          <label>Model & Make</label>
          <input type="text" id="m-veh-model" class="form-control" required placeholder="e.g. Tata Starbus Ultra 35-Seater">
        </div>
        <div class="form-group">
          <label>Fuel Type</label>
          <select id="m-veh-fuel" class="form-control">
            <option value="Diesel">Diesel</option>
            <option value="CNG">CNG</option>
            <option value="Electric">Electric</option>
          </select>
        </div>
        <div class="form-group">
          <label>Fitness Certificate Expiry</label>
          <input type="date" id="m-veh-fitness" class="form-control">
        </div>
        <div class="form-group">
          <label>Insurance Expiry</label>
          <input type="date" id="m-veh-insurance" class="form-control">
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%;">Add to Fleet</button>
      </form>
    `;
    app.openModal(modalHtml);
  },

  async saveNewVehicle(e) {
    e.preventDefault();
    const payload = {
      bus_number: document.getElementById('m-veh-busnum').value,
      registration_plate: document.getElementById('m-veh-plate').value,
      capacity: parseInt(document.getElementById('m-veh-capacity').value),
      model: document.getElementById('m-veh-model').value,
      fuel_type: document.getElementById('m-veh-fuel').value,
      fitness_expiry: document.getElementById('m-veh-fitness').value || null,
      insurance_expiry: document.getElementById('m-veh-insurance').value || null
    };

    try {
      await api.post('/api/fleet/vehicles', payload);
      app.showToast('Vehicle added successfully!', 'success');
      app.closeModal();
      this.loadFleet();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  openEditVehicleModal(id) {
    const v = this.cachedVehicles.find(x => x.id === id);
    if (!v) return;

    const modalHtml = `
      <div class="modal-header">
        <h3 class="card-title">Edit Vehicle ${v.bus_number}</h3>
        <button class="modal-close" onclick="app.closeModal()">&times;</button>
      </div>
      <form onsubmit="manager.saveEditVehicle(event, ${id})">
        <div class="form-group">
          <label>Status</label>
          <select id="m-edit-veh-status" class="form-control">
            <option value="active" ${v.status === 'active' ? 'selected' : ''}>Active (Available)</option>
            <option value="maintenance" ${v.status === 'maintenance' ? 'selected' : ''}>Under Maintenance</option>
            <option value="out_of_service" ${v.status === 'out_of_service' ? 'selected' : ''}>Out of Service</option>
          </select>
        </div>
        <div class="form-group">
          <label>Seating Capacity</label>
          <input type="number" id="m-edit-veh-cap" class="form-control" value="${v.capacity}" min="1" required>
        </div>
        <div class="form-group">
          <label>Model & Make</label>
          <input type="text" id="m-edit-veh-model" class="form-control" value="${v.model}" required>
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%;">Save Changes</button>
      </form>
    `;
    app.openModal(modalHtml);
  },

  async saveEditVehicle(e, id) {
    e.preventDefault();
    const payload = {
      status: document.getElementById('m-edit-veh-status').value,
      capacity: parseInt(document.getElementById('m-edit-veh-cap').value),
      model: document.getElementById('m-edit-veh-model').value
    };

    try {
      await api.put(`/api/fleet/vehicles/${id}`, payload);
      app.showToast('Vehicle updated successfully!', 'success');
      app.closeModal();
      this.loadFleet();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  openMaintenanceModal(vehicleId, busNumber) {
    const today = new Date().toISOString().split('T')[0];
    const modalHtml = `
      <div class="modal-header">
        <h3 class="card-title">Log Service for ${busNumber}</h3>
        <button class="modal-close" onclick="app.closeModal()">&times;</button>
      </div>
      <form onsubmit="manager.saveMaintenanceLog(event, ${vehicleId})">
        <div class="form-group">
          <label>Service Date</label>
          <input type="date" id="m-maint-date" class="form-control" value="${today}" required>
        </div>
        <div class="form-group">
          <label>Service Type</label>
          <select id="m-maint-type" class="form-control" required>
            <option value="routine_service">Routine 10,000 KM Service</option>
            <option value="brake_inspection">Brake Pads & Hydraulics Inspection</option>
            <option value="tire_replacement">Tire Rotation & Replacement</option>
            <option value="engine_repair">Engine & Transmission Maintenance</option>
            <option value="electrical_fix">Electrical & Battery Diagnostics</option>
          </select>
        </div>
        <div class="form-group">
          <label>Cost ($)</label>
          <input type="number" id="m-maint-cost" class="form-control" value="250.00" step="0.01">
        </div>
        <div class="form-group">
          <label>Performed By (Workshop / Vendor)</label>
          <input type="text" id="m-maint-vendor" class="form-control" value="Campus Fleet Services" required>
        </div>
        <div class="form-group">
          <label>Notes & Replaced Parts</label>
          <textarea id="m-maint-desc" class="form-control" rows="2" placeholder="Filters changed, fluids topped up..."></textarea>
        </div>
        <div class="form-group" style="display: flex; align-items: center; gap: 0.5rem;">
          <input type="checkbox" id="m-maint-set-status" checked>
          <label for="m-maint-set-status" style="margin-bottom:0; font-size: 0.85rem;">
            Set vehicle status to 'Under Maintenance' until released
          </label>
        </div>
        <button type="submit" class="btn btn-warning" style="width: 100%;">Record Maintenance</button>
      </form>
    `;
    app.openModal(modalHtml);
  },

  async saveMaintenanceLog(e, vehicleId) {
    e.preventDefault();
    const payload = {
      vehicle_id: vehicleId,
      service_date: document.getElementById('m-maint-date').value,
      service_type: document.getElementById('m-maint-type').value,
      cost: parseFloat(document.getElementById('m-maint-cost').value || 0),
      performed_by: document.getElementById('m-maint-vendor').value,
      description: document.getElementById('m-maint-desc').value,
      set_in_maintenance: document.getElementById('m-maint-set-status').checked
    };

    try {
      await api.post('/api/fleet/maintenance', payload);
      app.showToast('Maintenance record saved successfully.', 'success');
      app.closeModal();
      this.loadFleet();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  async loadRoutes() {
    try {
      const data = await api.get('/api/routes');
      this.cachedRoutes = data.routes || [];
      const tbody = document.getElementById('mgr-routes-table-body');

      if (!this.cachedRoutes.length) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center;">No routes defined.</td></tr>`;
        return;
      }

      tbody.innerHTML = this.cachedRoutes.map(r => `
        <tr>
          <td><span class="badge badge-primary">${r.route_code}</span></td>
          <td><strong>${r.route_name}</strong></td>
          <td>${r.start_location} ➔ ${r.end_location}</td>
          <td>${r.total_distance_km} km (${r.estimated_duration_mins}m)</td>
          <td><strong>${r.stops_count}</strong> stops</td>
          <td>${r.bus_number || '-'}</td>
          <td>${r.default_driver_name || '-'}</td>
          <td>
            <button class="btn btn-sm btn-secondary" onclick="manager.viewRouteStops(${r.id})">Stops</button>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      app.showToast('Failed to load routes: ' + err.message, 'error');
    }
  },

  openAddRouteModal() {
    const modalHtml = `
      <div class="modal-header">
        <h3 class="card-title">Create New Route Corridor</h3>
        <button class="modal-close" onclick="app.closeModal()">&times;</button>
      </div>
      <form onsubmit="manager.saveNewRoute(event)">
        <div class="form-group">
          <label>Route Code</label>
          <input type="text" id="m-rt-code" class="form-control" required placeholder="e.g. RT-03">
        </div>
        <div class="form-group">
          <label>Route Full Name</label>
          <input type="text" id="m-rt-name" class="form-control" required placeholder="e.g. Route 3: West Suburbs - Medical Campus">
        </div>
        <div class="form-group">
          <label>Start Terminal / Location</label>
          <input type="text" id="m-rt-start" class="form-control" required placeholder="e.g. West Gate Metro">
        </div>
        <div class="form-group">
          <label>End Terminal / Location</label>
          <input type="text" id="m-rt-end" class="form-control" required placeholder="e.g. Engineering Block 4">
        </div>
        <div class="form-group">
          <label>Estimated Distance (KM)</label>
          <input type="number" id="m-rt-dist" class="form-control" value="15.0" step="0.1">
        </div>
        <div class="form-group">
          <label>Estimated Commute Time (Minutes)</label>
          <input type="number" id="m-rt-mins" class="form-control" value="40">
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%;">Create Route</button>
      </form>
    `;
    app.openModal(modalHtml);
  },

  async saveNewRoute(e) {
    e.preventDefault();
    const payload = {
      route_code: document.getElementById('m-rt-code').value,
      route_name: document.getElementById('m-rt-name').value,
      start_location: document.getElementById('m-rt-start').value,
      end_location: document.getElementById('m-rt-end').value,
      total_distance_km: parseFloat(document.getElementById('m-rt-dist').value || 0),
      estimated_duration_mins: parseInt(document.getElementById('m-rt-mins').value || 45)
    };

    try {
      await api.post('/api/routes', payload);
      app.showToast('Route created successfully!', 'success');
      app.closeModal();
      this.loadRoutes();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  async viewRouteStops(routeId) {
    try {
      const data = await api.get(`/api/routes/${routeId}`);
      const r = data.route;
      const stops = data.stops || [];

      let stopsListHtml = stops.map(s => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid var(--border);">
          <div>
            <strong>#${s.stop_order}: ${s.stop_name}</strong>
            <div style="font-size: 0.75rem; color: var(--text-muted);">
              Pickup: ${s.morning_pickup_time || '-'} | Drop: ${s.evening_drop_time || '-'} (Lat: ${s.latitude}, Lng: ${s.longitude})
            </div>
          </div>
          <button class="btn btn-sm btn-danger" onclick="manager.deleteStop(${s.id}, ${routeId})">Remove</button>
        </div>
      `).join('');

      if (!stops.length) stopsListHtml = '<p style="color:var(--text-muted);">No stops configured yet.</p>';

      const modalHtml = `
        <div class="modal-header">
          <h3 class="card-title">Stops for ${r.route_name}</h3>
          <button class="modal-close" onclick="app.closeModal()">&times;</button>
        </div>
        <div style="margin-bottom: 1.25rem;">
          ${stopsListHtml}
        </div>
        <div style="border-top: 1px solid var(--border); padding-top: 1rem;">
          <h4 style="font-size: 0.95rem; margin-bottom: 0.75rem;">+ Add Sequenced Stop</h4>
          <form onsubmit="manager.saveNewStop(event, ${routeId})">
            <div class="form-group">
              <label>Stop Name</label>
              <input type="text" id="m-stop-name" class="form-control" required placeholder="e.g. Indiranagar Metro Gate 2">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
              <div class="form-group">
                <label>Latitude</label>
                <input type="number" id="m-stop-lat" class="form-control" step="0.000001" value="12.975000" required>
              </div>
              <div class="form-group">
                <label>Longitude</label>
                <input type="number" id="m-stop-lng" class="form-control" step="0.000001" value="77.625000" required>
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
              <div class="form-group">
                <label>Morning Pickup Time</label>
                <input type="text" id="m-stop-pickup" class="form-control" placeholder="07:45 AM">
              </div>
              <div class="form-group">
                <label>Evening Drop Time</label>
                <input type="text" id="m-stop-drop" class="form-control" placeholder="05:15 PM">
              </div>
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%;">Add Stop</button>
          </form>
        </div>
      `;
      app.openModal(modalHtml);
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  async saveNewStop(e, routeId) {
    e.preventDefault();
    const payload = {
      stop_name: document.getElementById('m-stop-name').value,
      latitude: parseFloat(document.getElementById('m-stop-lat').value),
      longitude: parseFloat(document.getElementById('m-stop-lng').value),
      morning_pickup_time: document.getElementById('m-stop-pickup').value,
      evening_drop_time: document.getElementById('m-stop-drop').value
    };

    try {
      await api.post(`/api/routes/${routeId}/stops`, payload);
      app.showToast('Stop added successfully!', 'success');
      this.viewRouteStops(routeId);
      this.loadRoutes();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  async deleteStop(stopId, routeId) {
    if (!confirm('Remove this stop from route?')) return;
    try {
      await api.delete(`/api/routes/stops/${stopId}`);
      app.showToast('Stop removed.', 'info');
      this.viewRouteStops(routeId);
      this.loadRoutes();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  async loadTrips() {
    try {
      const data = await api.get('/api/trips');
      const tbody = document.getElementById('mgr-trips-table-body');
      if (!data.trips || !data.trips.length) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align: center;">No trips scheduled.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.trips.map(t => {
        let statusBadge = 'badge-primary';
        if (t.status === 'in_progress') statusBadge = 'badge-success';
        if (t.status === 'completed') statusBadge = 'badge-info';
        if (t.status === 'delayed' || t.status === 'cancelled') statusBadge = 'badge-danger';

        return `
          <tr>
            <td><strong>${t.trip_code}</strong></td>
            <td>${t.trip_date}</td>
            <td><span class="badge badge-primary">${t.trip_type.replace('_', ' ')}</span></td>
            <td>${t.route_name}</td>
            <td>${t.bus_number}</td>
            <td>${t.driver_name}</td>
            <td>${t.passengers_boarded_count} / ${t.total_allocated_passengers}</td>
            <td><span class="badge ${statusBadge}">${t.status.toUpperCase()}</span></td>
            <td>
              ${t.status === 'scheduled' ? `
                <button class="btn btn-sm btn-danger" onclick="manager.cancelTrip(${t.id})">Cancel</button>
              ` : '-'}
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      app.showToast('Failed to load trips: ' + err.message, 'error');
    }
  },

  async openDispatchTripModal() {
    await this.loadFleet();
    await this.loadRoutes();
    const driversData = await api.get('/api/drivers');
    this.cachedDrivers = driversData.drivers || [];

    const today = new Date().toISOString().split('T')[0];

    const modalHtml = `
      <div class="modal-header">
        <h3 class="card-title">Schedule / Dispatch Commute Trip</h3>
        <button class="modal-close" onclick="app.closeModal()">&times;</button>
      </div>
      <form onsubmit="manager.saveNewTrip(event)">
        <div class="form-group">
          <label>Trip Date</label>
          <input type="date" id="m-trip-date" class="form-control" value="${today}" required>
        </div>
        <div class="form-group">
          <label>Commute Shift Type</label>
          <select id="m-trip-type" class="form-control" required>
            <option value="morning_pickup">Morning Pickup (To Campus)</option>
            <option value="evening_drop">Evening Drop (From Campus)</option>
            <option value="special">Special Event / Off-Campus Shuttle</option>
          </select>
        </div>
        <div class="form-group">
          <label>Assigned Route</label>
          <select id="m-trip-route" class="form-control" required>
            ${this.cachedRoutes.map(r => `<option value="${r.id}">${r.route_name} (${r.route_code})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Vehicle (Active & Available only)</label>
          <select id="m-trip-veh" class="form-control" required>
            ${this.cachedVehicles.filter(v => v.status === 'active').map(v => `<option value="${v.id}">${v.bus_number} (${v.model} - ${v.capacity} seats)</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Assigned Driver</label>
          <select id="m-trip-driver" class="form-control" required>
            ${this.cachedDrivers.map(d => `<option value="${d.id}">${d.name} (License: ${d.license_number})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Operational Notes</label>
          <input type="text" id="m-trip-notes" class="form-control" placeholder="e.g. Expected heavy morning commute">
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%;">Schedule Trip</button>
      </form>
    `;
    app.openModal(modalHtml);
  },

  async saveNewTrip(e) {
    e.preventDefault();
    const payload = {
      trip_date: document.getElementById('m-trip-date').value,
      trip_type: document.getElementById('m-trip-type').value,
      route_id: parseInt(document.getElementById('m-trip-route').value),
      vehicle_id: parseInt(document.getElementById('m-trip-veh').value),
      driver_id: parseInt(document.getElementById('m-trip-driver').value),
      notes: document.getElementById('m-trip-notes').value
    };

    try {
      await api.post('/api/trips', payload);
      app.showToast('Trip scheduled successfully!', 'success');
      app.closeModal();
      this.loadTrips();
      this.loadDashboardStats();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  async cancelTrip(id) {
    const reason = prompt('Please enter cancellation reason:');
    if (!reason) return;
    try {
      await api.put(`/api/trips/${id}/cancel`, { reason });
      app.showToast('Trip cancelled.', 'info');
      this.loadTrips();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  async loadAllocations() {
    try {
      const data = await api.get('/api/allocations');
      const tbody = document.getElementById('mgr-allocations-table-body');
      if (!data.allocations || !data.allocations.length) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align: center;">No student allocations found.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.allocations.map(a => `
        <tr>
          <td><strong>${a.student_name}</strong></td>
          <td>${a.roll_or_emp_id || '-'}</td>
          <td>${a.route_name}</td>
          <td><span class="badge badge-primary">${a.bus_number}</span></td>
          <td>${a.pickup_stop_name}</td>
          <td><strong>${a.seat_number || '-'}</strong></td>
          <td><code>${a.pass_number || 'PENDING'}</code></td>
          <td>
            <span class="badge ${a.allocation_status === 'approved' ? 'badge-success' : 'badge-warning'}">
              ${a.allocation_status.toUpperCase()}
            </span>
          </td>
          <td>
            ${a.allocation_status === 'approved' ? `
              <button class="btn btn-sm btn-danger" onclick="manager.updateAllocStatus(${a.id}, 'cancelled')">Cancel</button>
            ` : `
              <button class="btn btn-sm btn-success" onclick="manager.updateAllocStatus(${a.id}, 'approved')">Approve</button>
            `}
          </td>
        </tr>
      `).join('');
    } catch (err) {
      app.showToast('Failed to load allocations: ' + err.message, 'error');
    }
  },

  async openAllocateStudentModal() {
    await this.loadFleet();
    await this.loadRoutes();

    // Fetch students
    const usersData = await api.get('/api/users?role=student');
    const students = usersData.users || [];

    const modalHtml = `
      <div class="modal-header">
        <h3 class="card-title">Allocate Student to Bus & Route</h3>
        <button class="modal-close" onclick="app.closeModal()">&times;</button>
      </div>
      <form onsubmit="manager.saveAllocation(event)">
        <div class="form-group">
          <label>Select Student</label>
          <select id="m-alloc-student" class="form-control" required>
            ${students.map(s => `<option value="${s.id}">${s.name} (${s.email} - ${s.roll_or_emp_id || 'Student'})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Select Route</label>
          <select id="m-alloc-route" class="form-control" required onchange="manager.onRouteSelectForAlloc(this.value)">
            ${this.cachedRoutes.map(r => `<option value="${r.id}">${r.route_name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Designated Pickup Stop</label>
          <select id="m-alloc-pickup-stop" class="form-control" required>
            <option value="">Loading stops...</option>
          </select>
        </div>
        <div class="form-group">
          <label>Assigned Vehicle (With Live Seating Capacity Counter)</label>
          <select id="m-alloc-veh" class="form-control" required>
            ${this.cachedVehicles.map(v => {
              const occ = parseInt(v.allocated_students_count || 0);
              const cap = parseInt(v.capacity);
              const isFull = occ >= cap;
              return `<option value="${v.id}" ${isFull ? 'disabled' : ''}>
                ${v.bus_number} (${v.model}) - [Occupancy: ${occ}/${cap} seats] ${isFull ? '(CAPACITY FULL)' : ''}
              </option>`;
            }).join('')}
          </select>
          <small style="color: var(--text-muted);">Capacity enforcement strictly prevents overbooking seats.</small>
        </div>
        <div class="form-group">
          <label>Seat Number (Optional)</label>
          <input type="text" id="m-alloc-seat" class="form-control" placeholder="Auto-assigned if left blank">
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%;">Allocate & Generate Bus Pass</button>
      </form>
    `;
    app.openModal(modalHtml);

    if (this.cachedRoutes.length > 0) {
      this.onRouteSelectForAlloc(this.cachedRoutes[0].id);
    }
  },

  async onRouteSelectForAlloc(routeId) {
    try {
      const data = await api.get(`/api/routes/${routeId}`);
      const select = document.getElementById('m-alloc-pickup-stop');
      if (!select) return;
      select.innerHTML = (data.stops || []).map(s => `
        <option value="${s.id}">#${s.stop_order} - ${s.stop_name} (${s.morning_pickup_time || 'Pickup'})</option>
      `).join('');
    } catch (err) {
      console.error(err);
    }
  },

  async saveAllocation(e) {
    e.preventDefault();
    const payload = {
      student_id: parseInt(document.getElementById('m-alloc-student').value),
      route_id: parseInt(document.getElementById('m-alloc-route').value),
      pickup_stop_id: parseInt(document.getElementById('m-alloc-pickup-stop').value),
      vehicle_id: parseInt(document.getElementById('m-alloc-veh').value),
      seat_number: document.getElementById('m-alloc-seat').value || undefined
    };

    try {
      const res = await api.post('/api/allocations', payload);
      app.showToast(`Allocated successfully! Pass: ${res.bus_pass?.pass_number}`, 'success');
      app.closeModal();
      this.loadAllocations();
      this.loadDashboardStats();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  async updateAllocStatus(id, status) {
    try {
      await api.put(`/api/allocations/${id}/status`, { status });
      app.showToast(`Allocation status updated to ${status}.`, 'info');
      this.loadAllocations();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  async loadIncidents() {
    try {
      const data = await api.get('/api/incidents');
      const tbody = document.getElementById('mgr-incidents-table-body');
      const recentTbody = document.getElementById('mgr-recent-incidents-table');

      if (!data.incidents || !data.incidents.length) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align: center;">No recorded incidents.</td></tr>`;
        if (recentTbody) recentTbody.innerHTML = `<tr><td colspan="4" style="text-align: center;">No open alerts.</td></tr>`;
        return;
      }

      if (tbody) {
        tbody.innerHTML = data.incidents.map(i => `
          <tr>
            <td><strong>#${i.id}</strong></td>
            <td><span class="badge badge-warning">${i.incident_type.replace('_', ' ')}</span></td>
            <td><span class="badge ${i.severity === 'critical' ? 'badge-danger' : (i.severity === 'high' ? 'badge-warning' : 'badge-info')}">${i.severity.toUpperCase()}</span></td>
            <td>${i.reporter_name} (${i.reporter_role})</td>
            <td>${i.bus_number ? `${i.bus_number} (${i.trip_code || ''})` : '-'}</td>
            <td>${i.description}</td>
            <td><span class="badge ${i.status === 'open' ? 'badge-danger' : 'badge-success'}">${i.status.toUpperCase()}</span></td>
            <td>
              ${i.status === 'open' ? `
                <button class="btn btn-sm btn-success" onclick="manager.openResolveIncidentModal(${i.id})">Resolve</button>
              ` : `<small style="color:var(--text-muted);">${i.resolution_notes || 'Resolved'}</small>`}
            </td>
          </tr>
        `).join('');
      }

      if (recentTbody) {
        recentTbody.innerHTML = data.incidents.slice(0, 5).map(i => `
          <tr>
            <td><span class="badge badge-warning">${i.incident_type}</span></td>
            <td><span class="badge ${i.severity === 'critical' ? 'badge-danger' : 'badge-info'}">${i.severity}</span></td>
            <td>${i.description}</td>
            <td><span class="badge ${i.status === 'open' ? 'badge-danger' : 'badge-success'}">${i.status}</span></td>
          </tr>
        `).join('');
      }
    } catch (err) {
      console.error(err);
    }
  },

  openResolveIncidentModal(id) {
    const modalHtml = `
      <div class="modal-header">
        <h3 class="card-title">Resolve Incident #${id}</h3>
        <button class="modal-close" onclick="app.closeModal()">&times;</button>
      </div>
      <form onsubmit="manager.saveResolveIncident(event, ${id})">
        <div class="form-group">
          <label>Resolution Action & Notes</label>
          <textarea id="m-inc-notes" class="form-control" rows="3" required placeholder="Describe actions taken (e.g. Replacement shuttle dispatched, traffic cleared, mechanical inspection completed)..."></textarea>
        </div>
        <button type="submit" class="btn btn-success" style="width: 100%;">Mark as Resolved</button>
      </form>
    `;
    app.openModal(modalHtml);
  },

  async saveResolveIncident(e, id) {
    e.preventDefault();
    const resolution_notes = document.getElementById('m-inc-notes').value;
    try {
      await api.put(`/api/incidents/${id}/resolve`, { resolution_notes });
      app.showToast('Incident marked as resolved.', 'success');
      app.closeModal();
      this.loadIncidents();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  }
};

