// api/directions.js
// Uses OSRM (OpenStreetMap routing) - free, no API key required

function decodePolyline(encoded) {
  const points = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, byte;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { origin, destination } = req.body;
    if (!origin || !destination) {
      return res.status(400).json({ error: 'Origin and destination required.' });
    }

    // OSRM public API - free routing, no key needed
    const url = `https://router.project-osrm.org/route/v1/driving/` +
      `${origin.lng},${origin.lat};${destination.lng},${destination.lat}` +
      `?overview=full&geometries=polyline`;

    const r = await fetch(url, {
      headers: { 'User-Agent': 'SafeGuard-RouteRisk/1.0' }
    });

    const data = await r.json();

    if (!data.routes || data.routes.length === 0) {
      return res.status(404).json({ error: 'Could not calculate a route between those locations.' });
    }

    const route = data.routes[0];
    const points = decodePolyline(route.geometry);
    const distance_km = Math.round(route.distance / 1000);
    const duration_min = Math.round(route.duration / 60);

    return res.status(200).json({ points, distance_km, duration_min });

  } catch (err) {
    console.error('Directions error:', err);
    return res.status(500).json({ error: 'Route calculation failed. Please try again.' });
  }
}
