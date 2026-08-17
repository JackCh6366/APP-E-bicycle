/**
 * /api/test-tycg
 *
 * TEMPORARY test endpoint — verifies that Taoyuan (TYCG) YouBike API
 * is reachable from Vercel without IP blocks or CORS issues.
 *
 * API Source: https://data.tycg.gov.tw/api/v1/rest/datastore/
 *             a1b4714b-3b75-4ff8-a8f2-cc377e4eaa0f?format=json
 *
 * Returns a diagnostic JSON with timing, sample count, and first 3 records.
 * DELETE this file after testing is complete.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const maxDuration = 15;

const TYCG_API_URL =
  'https://data.tycg.gov.tw/api/v1/rest/datastore/a1b4714b-3b75-4ff8-a8f2-cc377e4eaa0f?format=json';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startMs = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(TYCG_API_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'vercel-test/1.0',
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

    // TYCG API structure: { success: true, result: { records: [...] } }
    const records: any[] = json?.result?.records ?? [];

    return res.status(200).json({
      status: 'OK',
      elapsedMs,
      totalRecords: records.length,
      sampleFields: records.length > 0 ? Object.keys(records[0]) : [],
      sample: records.slice(0, 3).map((r) => ({
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
