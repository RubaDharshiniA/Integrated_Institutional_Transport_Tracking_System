const db = require('../db');

// Helper to compute distance between two GPS coords (Haversine formula in KM)
function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function updateTripLocation(req, res, next) {
  try {
    const { tripId } = req.params;
    const { latitude, longitude, speed_kmh, heading, next_stop_name, current_stop_order } = req.body;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Latitude and longitude are required.' });
    }

    const tripRes = await db.query(`SELECT id, status FROM trips WHERE id = $1`, [tripId]);
    if (tripRes.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found.' });
    }

    const insertRes = await db.query(
      `INSERT INTO trip_locations (trip_id, latitude, longitude, speed_kmh, heading, next_stop_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tripId, parseFloat(latitude), parseFloat(longitude), parseFloat(speed_kmh || 0), parseFloat(heading || 0), next_stop_name || null]
    );

    if (current_stop_order !== undefined) {
      await db.query(`UPDATE trips SET current_stop_order = $1 WHERE id = $2`, [current_stop_order, tripId]);
    }

    res.json({ message: 'Location updated successfully', location: insertRes.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function getTripLiveTracking(req, res, next) {
  try {
    const { tripId } = req.params;

    const tripRes = await db.query(
      `SELECT t.*,
              r.route_name, r.route_code, r.start_location, r.end_location,
              v.bus_number, v.registration_plate, v.capacity as vehicle_capacity,
              u.name as driver_name, u.phone as driver_phone
       FROM trips t
       JOIN routes r ON t.route_id = r.id
       JOIN vehicles v ON t.vehicle_id = v.id
       JOIN drivers d ON t.driver_id = d.id
       JOIN users u ON d.user_id = u.id
       WHERE t.id = $1`,
      [tripId]
    );

    if (tripRes.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found.' });
    }
    const trip = tripRes.rows[0];

    // Fetch ordered stops
    const stopsRes = await db.query(
      `SELECT * FROM route_stops WHERE route_id = $1 ORDER BY stop_order ASC`,
      [trip.route_id]
    );
    const stops = stopsRes.rows;

    // Fetch latest location
    const locRes = await db.query(
      `SELECT * FROM trip_locations WHERE trip_id = $1 ORDER BY id DESC LIMIT 1`,
      [tripId]
    );
    const latestLocation = locRes.rows[0] || null;

    // Calculate dynamic ETAs to each stop based on current bus position
    const currentLat = latestLocation ? latestLocation.latitude : (stops[0]?.latitude || 12.9716);
    const currentLng = latestLocation ? latestLocation.longitude : (stops[0]?.longitude || 77.5946);
    const currentSpeed = latestLocation && latestLocation.speed_kmh > 5 ? latestLocation.speed_kmh : 30.0; // default 30 km/h in urban

    const stopsWithEta = stops.map(stop => {
      const distKm = getDistanceKm(currentLat, currentLng, stop.latitude, stop.longitude);
      const travelMins = Math.round((distKm / currentSpeed) * 60);

      let etaText = `${travelMins} mins`;
      if (travelMins <= 1) {
        etaText = 'Arriving now';
      } else if (trip.status === 'completed') {
        etaText = 'Completed';
      } else if (trip.status === 'scheduled') {
        etaText = stop.morning_pickup_time || 'Scheduled';
      }

      return {
        ...stop,
        distance_km: Math.round(distKm * 10) / 10,
        eta_minutes: travelMins,
        eta_display: etaText
      };
    });

    res.json({
      trip,
      latest_location: latestLocation,
      stops: stopsWithEta,
      active: trip.status === 'in_progress'
    });
  } catch (err) {
    next(err);
  }
}

async function getAllActiveTracking(req, res, next) {
  try {
    const sql = `
      SELECT t.id as trip_id, t.trip_code, t.status as trip_status,
             r.id as route_id, r.route_name, r.route_code,
             v.bus_number, v.registration_plate,
             u.name as driver_name, u.phone as driver_phone,
             tl.latitude, tl.longitude, tl.speed_kmh, tl.heading, tl.next_stop_name, tl.timestamp as last_seen
      FROM trips t
      JOIN routes r ON t.route_id = r.id
      JOIN vehicles v ON t.vehicle_id = v.id
      JOIN drivers d ON t.driver_id = d.id
      JOIN users u ON d.user_id = u.id
      JOIN (
        SELECT trip_id, latitude, longitude, speed_kmh, heading, next_stop_name, timestamp
        FROM trip_locations
        WHERE id IN (SELECT MAX(id) FROM trip_locations GROUP BY trip_id)
      ) tl ON tl.trip_id = t.id
      WHERE t.status = 'in_progress'
    `;

    const result = await db.query(sql);
    res.json({ active_buses: result.rows, count: result.rows.length });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  updateTripLocation,
  getTripLiveTracking,
  getAllActiveTracking
};
