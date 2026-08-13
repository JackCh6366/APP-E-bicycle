import type { VercelRequest, VercelResponse } from '@vercel/node';

const KCG_API_URLS = [
  'https://api.kcg.gov.tw/api/service/Get/b4dd9c40-9027-4125-8666-06bef1756092',
  'https://openapi.kcg.gov.tw/Api/Service/Get/b4dd9c40-9027-4125-8666-06bef1756092',
];

export async function processKcgRequest(): Promise<{ status: number; body: any }> {
  let lastError: any = null;

  for (const url of KCG_API_URLS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12-second timeout

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        return {
          status: 200,
          body: data,
        };
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error: any) {
      clearTimeout(timeoutId);
      lastError = error;
    }
  }

  if (lastError?.name === 'AbortError') {
    return {
      status: 504,
      body: { error: '高雄市 YouBike 伺服器回應逾時 (Timeout)' },
    };
  }
  return {
    status: 500,
    body: { error: `高雄市 YouBike 代理端點連線失敗: ${lastError?.message || '無法連線'}` },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: '僅接受 GET 請求。' });
  }

  const result = await processKcgRequest();
  res.setHeader('Content-Type', 'application/json');
  return res.status(result.status).json(result.body);
}
