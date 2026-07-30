// api/geocode.js
// Secure server-side proxy for Google Geocoding API
// The API key is stored as a Vercel environment variable — never exposed to the browser

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

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error('GOOGLE_MAPS_API_KEY not set');
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    const query = encodeURIComponent(address + ', South Africa');
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${apiKey}&region=za&language=en`;

    const r = await fetch(url);
    const data = await r.json();

    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      return res.status(404).json({ error: 'Address not found. Try including the suburb and city name.' });
    }

    const result = data.results[0];
    return res.status(200).json({
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      label: result.formatted_address
    });

  } catch (err) {
    console.error('Geocode error:', err);
    return res.status(500).json({ error: 'Geocoding failed. Please try again.' });
  }
}
