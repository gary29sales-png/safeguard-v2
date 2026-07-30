// api/geocode.js - Nominatim geocoding, no API key needed
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
    const body = req.body;
    const address = body && body.address;
    if (!address) return res.status(400).json({ error: 'Address is required.' });

    const q = encodeURIComponent(address + ', South Africa');
    const url = 'https://nominatim.openstreetmap.org/search?q=' + q + '&format=json&limit=1&countrycodes=za';

    const r = await fetch(url, {
      headers: { 'User-Agent': 'SafeGuard/1.0', 'Accept-Language': 'en' }
    });

    if (!r.ok) return res.status(502).json({ error: 'Geocoding service unavailable.' });

    const data = await r.json();
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Address not found. Try "Sandton, Johannesburg".' });
    }

    return res.status(200).json({
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      label: data[0].display_name.split(',').slice(0,3).join(',').trim()
    });
  } catch (err) {
    return res.status(500).json({ error: 'Geocoding failed: ' + err.message });
  }
}
