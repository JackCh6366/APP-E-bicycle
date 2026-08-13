import type { VercelRequest, VercelResponse } from '@vercel/node';

const KCG_API_URL = 'https://openapi.kcg.gov.tw/Api/Service/Get/b4dd9c40-9027-4125-8666-06bef1756092';

export async function processKcgRequest(): Promise<{ status: number; body: any }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000); // 7-second timeout

  try {
    const response = await fetch(KCG_API_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        status: response.status >= 500 ? 502 : response.status,
        body: { error: `高雄市 YouBike 伺服器回應異常 (HTTP ${response.status})` },
      };
    }

    const data = await response.json();
    return {
      status: 200,
      body: data,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      return {
        status: 504,
        body: { error: '高雄市 YouBike 伺服器回應逾時 (Timeout)' },
      };
    }
    return {
      status: 500,
      body: { error: `高雄市 YouBike 代理端點連線失敗: ${error.message || '無法連線'}` },
    };
  }
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
