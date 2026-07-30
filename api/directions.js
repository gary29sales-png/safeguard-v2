// api/directions.js - OSRM routing, no API key needed
function decodePolyline(encoded) {
  const pts = [];
  let i = 0, lat = 0, lng = 0;
  while (i < encoded.length) {
    let s = 0, r = 0, b;
    do { b = encoded.charCodeAt(i++) - 63; r |= (b & 0x1f) << s; s += 5; } while (b >= 0x20);
    lat += (r & 1) ? ~(r >> 1) : (r >> 1);
    s = 0; r = 0;
    do { b = encoded.charCodeAt(i++) - 63; r |= (b & 0x1f) << s; s += 5; } while (b >= 0x20);
    lng += (r & 1) ? ~(r >> 1) : (r >> 1);
    pts.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return pts;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const { origin, destination } = req.body;
    if (!origin || !destination) return res.status(400).json({ error: 'Origin and destination required.' });

    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=polyline`;
    const r = await fetch(url, { headers: { 'User-Agent': 'SafeGuard/1.0' } });

    if (!r.ok) return res.status(502).json({ error: 'Routing service unavailable.' });

    const data = await r.json();
    if (!data.routes || !data.routes.length) return res.status(404).json({ error: 'No route found between those locations.' });

    const route = data.routes[0];
    return res.status(200).json({
      points: decodePolyline(route.geometry),
      distance_km: Math.round(route.distance / 1000),
      duration_min: Math.round(route.duration / 60)
    });
  } catch (err) {
    return res.status(500).json({ error: 'Routing failed: ' + err.message });
  }
}
