// api/geocode.js
// Uses Nominatim (OpenStreetMap) - free, no API key required
// Reliable for South African addresses

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { address } = req.body;
    if (!address || typeof address !== 'string' || address.length > 200) {
      return res.status(400).json({ error: 'Invalid address.' });
    }

    const query = encodeURIComponent(address + ', South Africa');
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=za`;

    const r = await fetch(url, {
      headers: {
        'User-Agent': 'SafeGuard-RouteRisk/1.0 (traficc.co.za)',
        'Accept-Language': 'en'
      }
    });

    const data = await r.json();

    if (!data || data.length === 0) {
      return res.status(404).json({ 
        error: 'Address not found. Try adding the city name, e.g. "Sandton, Johannesburg".' 
      });
    }

    const result = data[0];
    return res.status(200).json({
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      label: result.display_name.split(',').slice(0, 3).join(',').trim()
    });

  } catch (err) {
    console.error('Geocode error:', err);
    return res.status(500).json({ error: 'Geocoding failed. Please try again.' });
  }
}
