// api/directions.js
// Secure server-side proxy for Google Directions API
// Returns a decoded polyline as an array of {lat, lng} waypoints

// Decode Google's encoded polyline format
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
      return res.status(400).json({ error: 'Origin and destination are required.' });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error('GOOGLE_MAPS_API_KEY not set');
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    const url = `https://maps.googleapis.com/maps/api/directions/json?` +
      `origin=${origin.lat},${origin.lng}` +
      `&destination=${destination.lat},${destination.lng}` +
      `&mode=driving&region=za&key=${apiKey}`;

    const r = await fetch(url);
    const data = await r.json();

    if (data.status !== 'OK' || !data.routes || data.routes.length === 0) {
      return res.status(404).json({ error: 'Could not calculate a route between those locations.' });
    }

    const route = data.routes[0];
    const points = decodePolyline(route.overview_polyline.points);
    const distance = route.legs.reduce((sum, leg) => sum + leg.distance.value, 0);
    const duration = route.legs.reduce((sum, leg) => sum + leg.duration.value, 0);

    return res.status(200).json({
      points,
      distance_km: Math.round(distance / 1000),
      duration_min: Math.round(duration / 60)
    });

  } catch (err) {
    console.error('Directions error:', err);
    return res.status(500).json({ error: 'Route calculation failed. Please try again.' });
  }
}
