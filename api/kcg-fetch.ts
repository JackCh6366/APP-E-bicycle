/**
 * /api/kcg-fetch
 *
 * Dedicated endpoint called ONLY by GitHub Actions cron job.
 * Runs in Vercel hkg1 (Hong Kong) region which can reach KCG API.
 * GitHub Actions runners (Azure US East) are blocked by KCG firewall.
 *
 * Returns: { stations: [...], fetchedAt: "ISO string" }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const maxDuration = 30;

const KCG_API_URLS = [
  'https://api.kcg.gov.tw/api/service/Get/b4dd9c40-9027-4125-8666-06bef1756092',
  'https://openapi.kcg.gov.tw/Api/Service/Get/b4dd9c40-9027-4125-8666-06bef1756092',
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let lastError: any = null;

  for (const url of KCG_API_URLS) {
    try {
      console.log(`[kcg-fetch] 嘗試連線: ${url}`);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 22000);

      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/json, text/plain, */*',
          'Accept-Encoding': 'gzip, deflate, br',
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
        throw new Error(`API 回傳空陣列 (keys: ${Object.keys(rawData).join(', ')})`);
      }

      console.log(`[kcg-fetch] 成功取得 ${stations.length} 筆站點資料`);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        stations,
        fetchedAt: new Date().toISOString(),
        source: url,
      });
    } catch (err: any) {
      const msg = err.name === 'AbortError' ? 'ConnectTimeout (22s)' : err.message;
      console.error(`[kcg-fetch] 連線至 ${url} 失敗: ${msg}`);
      lastError = err;
    }
  }

  return res.status(504).json({
    error: `無法從 KCG API 取得資料: ${lastError?.message ?? '未知錯誤'}`,
  });
}
