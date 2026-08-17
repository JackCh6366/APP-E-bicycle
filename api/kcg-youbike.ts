import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';

export const maxDuration = 30;

const KCG_API_URLS = [
  'https://api.kcg.gov.tw/api/service/Get/b4dd9c40-9027-4125-8666-06bef1756092',
  'https://openapi.kcg.gov.tw/Api/Service/Get/b4dd9c40-9027-4125-8666-06bef1756092',
];

function readSnapshotFile(): any | null {
  try {
    const snapshotPath = path.join(process.cwd(), 'public', 'kcg-youbike-snapshot.json');
    if (fs.existsSync(snapshotPath)) {
      const content = fs.readFileSync(snapshotPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('無法讀取靜態快照檔案:', err);
  }
  return null;
}

/**
 * Fetch mode: called by GitHub Actions (via this Vercel endpoint in hkg1 region)
 * to bypass GitHub's IP block from KCG API. Returns raw station array.
 */
async function fetchFromKcgApi(): Promise<{ status: number; body: any }> {
  let lastError: any = null;

  for (const url of KCG_API_URLS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/json, text/plain, */*',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const rawData = await response.json();
      let stations: any[] = [];

      if (Array.isArray(rawData)) {
        stations = rawData;
      } else if (rawData && typeof rawData === 'object') {
        if (Array.isArray(rawData.data?.data?.retVal)) stations = rawData.data.data.retVal;
        else if (Array.isArray(rawData.data?.retVal)) stations = rawData.data.retVal;
        else if (Array.isArray(rawData.retVal)) stations = rawData.retVal;
        else if (Array.isArray(rawData.data)) stations = rawData.data;
      }

      if (stations.length === 0) {
        throw new Error('API 回傳空資料');
      }

      return { status: 200, body: { stations, fetchedAt: new Date().toISOString() } };
    } catch (err) {
      console.error(`連線至 ${url} 失敗:`, err);
      lastError = err;
    }
  }

  return {
    status: 504,
    body: { error: `無法從 KCG API 取得資料: ${lastError?.message ?? '未知錯誤'}` },
  };
}

export async function processKcgRequest(): Promise<{ status: number; body: any }> {
  // Always prefer static snapshot file for Kaohsiung on Vercel to guarantee 100% availability
  const snapshot = readSnapshotFile();
  if (snapshot) {
    return {
      status: 200,
      body: snapshot,
    };
  }

  return {
    status: 504,
    body: { error: '高雄市 YouBike 靜態快照尚未建置，且原始伺服器回應逾時' },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: '僅接受 GET 請求。' });
  }

  // Special mode: GitHub Actions calls this to fetch fresh data via Vercel's hkg1 region
  if (req.query.mode === 'fetch') {
    const result = await fetchFromKcgApi();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(result.status).json(result.body);
  }

  const result = await processKcgRequest();
  res.setHeader('Content-Type', 'application/json');
  return res.status(result.status).json(result.body);
}
