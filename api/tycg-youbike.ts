/**
 * /api/tycg-youbike
 *
 * Serverless function to proxy Taoyuan YouBike 2.0 real-time API.
 * Avoids CORS blocking for frontend clients while serving live station data.
 *
 * Source: 桃園市政府資料開放平台 (opendata.tycg.gov.tw)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const maxDuration = 15;

const TYCG_YOUBIKE_URL =
  'https://opendata.tycg.gov.tw/api/dataset/5ca2bfc7-9ace-4719-88ae-4034b9a5a55c/resource/08274d61-edbe-419d-8fcc-7a643831283d/download';

let cachedTycgData: any = null;
let lastTycgFetchTime = 0;
const CACHE_TTL_MS = 60 * 1000;

export async function processTycgRequest(): Promise<{ status: number; body: any }> {
  const now = Date.now();
  if (cachedTycgData && now - lastTycgFetchTime < CACHE_TTL_MS) {
    return { status: 200, body: cachedTycgData };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(TYCG_YOUBIKE_URL, {
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      if (cachedTycgData) return { status: 200, body: cachedTycgData };
      return {
        status: response.status,
        body: { error: `桃園市 API 服務錯誤 (HTTP ${response.status})` },
      };
    }

    const data = await response.json();
    cachedTycgData = data;
    lastTycgFetchTime = now;

    return { status: 200, body: data };
  } catch (err: any) {
    clearTimeout(timer);
    if (cachedTycgData) return { status: 200, body: cachedTycgData };

    const isTimeout = err.name === 'AbortError';
    console.error(`[tycg-youbike] Fetch error:`, err);
    return {
      status: 504,
      body: {
        error: isTimeout
          ? '連線至桃園市政府 YouBike API 逾時 (12s)'
          : `無法連接桃園市 YouBike API: ${err.message}`,
      },
    };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const result = await processTycgRequest();

  // Enable CORS and Cache (15s browser, 30s CDN s-maxage)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=30, stale-while-revalidate=60');
  res.setHeader('Content-Type', 'application/json');
  return res.status(result.status).json(result.body);
}
