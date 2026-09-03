import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not set in environment.' });
  }

  const startTime = Date.now();
  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Hello, this is a test from Vercel function.' }] }],
      }),
    });

    const durationMs = Date.now() - startTime;
    const rawBodyText = await response.text();

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      vercelRegion: process.env.VERCEL_REGION || 'unknown',
      durationMs,
      geminiHttpStatus: response.status,
      geminiHttpResponseText: rawBodyText,
    });
  } catch (err: any) {
    return res.status(500).json({
      error: err.message || 'Internal Error',
      durationMs: Date.now() - startTime,
    });
  }
}
