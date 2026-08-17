/**
 * /api/test-tycg
 *
 * Test endpoint for Taoyuan City YouBike 2.0 API.
 * Endpoint URL: https://opendata.tycg.gov.tw/api/dataset/5ca2bfc7-9ace-4719-88ae-4034b9a5a55c/resource/08274d61-edbe-419d-8fcc-7a643831283d/download
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const maxDuration = 15;

const TYCG_API_URL =
  'https://opendata.tycg.gov.tw/api/dataset/5ca2bfc7-9ace-4719-88ae-4034b9a5a55c/resource/08274d61-edbe-419d-8fcc-7a643831283d/download';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startMs = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(TYCG_API_URL, {
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    const elapsedMs = Date.now() - startMs;

    if (!response.ok) {
      return res.status(200).json({
        status: 'FAIL',
        httpStatus: response.status,
        elapsedMs,
        error: `HTTP ${response.status} ${response.statusText}`,
      });
    }

    const json = await response.json();
    const records = Array.isArray(json?.retVal) ? json.retVal : [];

    return res.status(200).json({
      status: 'OK',
      elapsedMs,
      totalRecords: records.length,
      updatedAt: json.updated_at,
      sample: records.slice(0, 3).map((r: any) => ({
        sno: r.sno,
        sna: r.sna,
        sarea: r.sarea,
        sbi: r.sbi,
        bemp: r.bemp,
        tot: r.tot,
        act: r.act,
        lat: r.lat,
        lng: r.lng,
      })),
    });
  } catch (err: any) {
    const elapsedMs = Date.now() - startMs;
    const isTimeout = err.name === 'AbortError';
    return res.status(200).json({
      status: 'FAIL',
      elapsedMs,
      error: isTimeout ? 'ConnectTimeout (10s)' : String(err.message ?? err),
    });
  }
}
