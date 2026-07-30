// api/ask.js
// Vercel Serverless Function — keeps the Anthropic API key secure on the server.
// The browser calls this endpoint; this function calls Anthropic and returns the answer.
//
// SECURITY: includes in-memory rate limiting per IP to prevent cost-abuse ("denial of wallet").
// NOTE: in-memory rate limiting resets whenever a serverless instance cold-starts, and does not
// share state across multiple concurrent instances. For a small/medium traffic public tool this
// provides meaningful protection against scripted abuse. For stronger guarantees at scale, this
// should be backed by a shared store (e.g. Vercel KV / Upstash Redis) — see note at bottom of file.

// Simple in-memory rate limit store: { ip: [timestamps] }
const rateLimitStore = new Map();

const RATE_LIMIT_WINDOW_MS = 60 * 1000;   // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 5;        // max 5 questions per IP per minute
const DAILY_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const DAILY_LIMIT_MAX_REQUESTS = 40;      // max 40 questions per IP per day

function getClientIp(req) {
  // Vercel populates x-forwarded-for with the real client IP first in the list
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const record = rateLimitStore.get(ip) || [];

  // Drop timestamps older than the daily window (keeps memory bounded)
  const recent = record.filter(ts => now - ts < DAILY_LIMIT_WINDOW_MS);

  const lastMinute = recent.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
  if (lastMinute.length >= RATE_LIMIT_MAX_REQUESTS) {
    return { limited: true, reason: 'Too many requests. Please wait a minute and try again.' };
  }

  if (recent.length >= DAILY_LIMIT_MAX_REQUESTS) {
    return { limited: true, reason: 'Daily question limit reached. Please contact Traficc directly on 0861 872 3422.' };
  }

  recent.push(now);
  rateLimitStore.set(ip, recent);
  return { limited: false };
}

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS — restrict to known origins rather than wildcard, reduces abuse surface
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // ── RATE LIMITING ──
    const ip = getClientIp(req);
    const rateCheck = isRateLimited(ip);
    if (rateCheck.limited) {
      console.warn('Rate limit hit for IP:', ip);
      return res.status(429).json({ error: rateCheck.reason });
    }

    const { question, policyText } = req.body;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'A question is required.' });
    }

    // Cap question length to prevent abuse / runaway token costs
    if (question.length > 500) {
      return res.status(400).json({ error: 'Question is too long. Please keep it under 500 characters.' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY environment variable is not set');
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    const systemPrompt = `You are a helpful assistant answering questions about the Traficc SafeGuard vehicle insurance policy, strictly based on the policy document provided below. Answer in plain, friendly, easy-to-understand language suitable for a member of the public — avoid insurance jargon where possible, and keep answers concise (2-5 sentences typically).

If the question is not related to the SafeGuard policy or cannot be answered from the document, politely say so and suggest contacting Traficc directly on 0861 872 3422.

At the end of your answer, on a new line, write "SOURCE: " followed by a short label of which section of the policy your answer is based on (e.g. "SOURCE: Section 7.2 Smash and Grab" or "SOURCE: Section 3 Eligible Vehicles" or "SOURCE: Value Added Benefits — Death Benefit").

POLICY DOCUMENT:
${policyText || ''}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        system: systemPrompt,
        messages: [
          { role: 'user', content: question }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', response.status, errText);
      return res.status(502).json({ error: 'Failed to get an answer. Please try again.' });
    }

    const data = await response.json();
    const textBlock = data.content?.find(c => c.type === 'text');
    const fullText = textBlock ? textBlock.text : '';

    let answer = fullText;
    let source = '';
    const sourceMatch = fullText.match(/SOURCE:\s*(.+)$/s);
    if (sourceMatch) {
      source = sourceMatch[1].trim();
      answer = fullText.replace(/SOURCE:\s*.+$/s, '').trim();
    }

    return res.status(200).json({ answer, source });

  } catch (err) {
    console.error('Ask handler error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

// ── NOTE FOR FUTURE HARDENING ──
// The in-memory rate limiter above resets on cold start and isn't shared across concurrent
// Vercel function instances. For a small/medium-traffic customer tool, this still meaningfully
// blocks scripted abuse, since most abuse scripts hit consistently and will get throttled within
// the same warm instance. For guaranteed protection at higher scale or under sustained attack,
// the recommended upgrade is:
//   1. Vercel KV (Redis) — store request counts there instead of in-memory, shared across all
//      instances. Free tier is available and setup takes ~15 minutes via the Vercel dashboard.
//   2. Vercel's built-in Web Application Firewall / Attack Challenge Mode (available on Pro plans)
//      can also rate-limit and block automated traffic at the edge, before it reaches this function.
//   3. Setting a hard monthly spend cap directly in the Anthropic Console (Settings → Billing)
//      is the final safety net — if every other layer fails, this guarantees the bill cannot
//      exceed a fixed ceiling.
