import type { VercelRequest, VercelResponse } from '@vercel/node';

const SERVICE_WHITELIST: Record<string, { provider: 'gemini' | 'nvidia'; model: string; name: string }> = {
  gemini: {
    provider: 'gemini',
    model: 'gemini-3.5-flash-lite',
    name: 'Google Gemini',
  },
  nvidia: {
    provider: 'nvidia',
    model: 'meta/llama-3.2-11b-vision-instruct',
    name: 'Llama 即時模式',
  },
  meta: {
    provider: 'nvidia',
    model: 'meta/llama-3.2-11b-vision-instruct',
    name: 'Meta Llama',
  },
};

// In-memory rate limiting map (IP -> timestamps array)
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 15; // 15 requests per minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) || [];

  // Filter timestamps within the 1-minute window
  const validTimestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (validTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    rateLimitMap.set(ip, validTimestamps);
    return false;
  }

  validTimestamps.push(now);
  rateLimitMap.set(ip, validTimestamps);

  // Periodic cleanup if map grows
  if (rateLimitMap.size > 5000) {
    for (const [k, v] of rateLimitMap.entries()) {
      if (v.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) {
        rateLimitMap.delete(k);
      }
    }
  }

  return true;
}

function isQuotaError(errorText: string): boolean {
  const lower = errorText.toLowerCase();
  return (
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests')
  );
}

export async function processAnalyzeRequest(
  service: string,
  prompt: string,
  ip: string
): Promise<{ status: number; body: { reply?: string; error?: string } }> {
  // 1. Rate Limiting Check
  if (!checkRateLimit(ip)) {
    return {
      status: 429,
      body: { error: '請求過於頻繁，請稍後再試（速率限制：每分鐘最多 15 次）。' },
    };
  }

  // 2. Security Whitelist Check for service parameter
  const serviceConfig = SERVICE_WHITELIST[service];
  if (!serviceConfig) {
    return {
      status: 400,
      body: { error: '不合法的 AI 服務選擇。僅支援 "gemini"、"nvidia" 與 "meta"。' },
    };
  }

  // 3. Input Validation and Length Limit Check
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return {
      status: 400,
      body: { error: '請輸入有效的查詢內容。' },
    };
  }

  if (prompt.length > 12000) {
    return {
      status: 400,
      body: { error: `查詢內容超出長度限制（當前 ${prompt.length} 字，上限 12000 字）。` },
    };
  }

  // 4. Upstream API Call with AbortController Timeout (35 seconds)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000);

  try {
    if (serviceConfig.provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (!apiKey) {
        return {
          status: 500,
          body: { error: '伺服器端未設定 GEMINI_API_KEY 環境變數。' },
        };
      }

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${serviceConfig.model}:generateContent?key=${apiKey}`;
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error(`[Google Gemini API Error] HTTP ${response.status}:`, errorText);

        let upstreamMsg = errorText;
        try {
          const parsed = JSON.parse(errorText);
          upstreamMsg = parsed?.error?.message || errorText;
        } catch (_) {}

        if (isQuotaError(errorText) || response.status === 429) {
          return {
            status: 429,
            body: { error: 'AI 服務目前使用量過大，請稍後再試。' },
          };
        }

        return {
          status: response.status >= 500 ? 502 : 400,
          body: { error: `Google Gemini 服務回應錯誤 (${response.status}): ${upstreamMsg}` },
        };
      }

      const data = await response.json();
      const candidate = data?.candidates?.[0];
      const replyText = candidate?.content?.parts?.[0]?.text;

      if (!replyText) {
        const finishReason = candidate?.finishReason || 'UNKNOWN';
        console.error('[Google Gemini API Warning] Empty reply text returned:', JSON.stringify(data));
        return {
          status: 500,
          body: { error: `Google Gemini 未能產生有效回應 (未取得內文，原因: ${finishReason})。` },
        };
      }

      return {
        status: 200,
        body: { reply: replyText },
      };
    } else if (serviceConfig.provider === 'nvidia') {
      const apiKey = process.env.NVIDIA_API_KEY;
      if (!apiKey) {
        return {
          status: 500,
          body: { error: '伺服器端未設定 NVIDIA_API_KEY 環境變數。' },
        };
      }

      const nvidiaUrl = 'https://integrate.api.nvidia.com/v1/chat/completions';
      const response = await fetch(nvidiaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: serviceConfig.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 1024,
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error(`[${serviceConfig.name} API Error] HTTP ${response.status}:`, errorText);

        let upstreamMsg = errorText;
        try {
          const parsed = JSON.parse(errorText);
          upstreamMsg = parsed?.error?.message || parsed?.detail || errorText;
        } catch (_) {}

        if (isQuotaError(errorText) || response.status === 429) {
          return {
            status: 429,
            body: { error: 'AI 服務目前使用量過大，請稍後再試。' },
          };
        }

        return {
          status: response.status >= 500 ? 502 : 400,
          body: { error: `${serviceConfig.name} 服務回應錯誤 (${response.status}): ${upstreamMsg}` },
        };
      }

      const data = await response.json();
      const replyText = data?.choices?.[0]?.message?.content;

      if (!replyText) {
        console.error(`[${serviceConfig.name} API Warning] Empty reply text returned:`, JSON.stringify(data));
        return {
          status: 500,
          body: { error: `${serviceConfig.name} 未能產生有效回應。` },
        };
      }

      return {
        status: 200,
        body: { reply: replyText },
      };
    }

    return {
      status: 400,
      body: { error: '未知的服務提供者。' },
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.error('[AI Service Timeout] Request aborted after 35s timeout.');
      return {
        status: 504,
        body: { error: 'AI 服務回應逾時，請稍後重試。' },
      };
    }

    console.error('[AI Service Internal Exception]:', error);
    return {
      status: 500,
      body: { error: `處理 AI 諮詢請求時發生伺服器內部錯誤：${error.message || '未知錯誤'}` },
    };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: '僅接受 POST 請求。' });
  }

  const clientIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req.headers['x-real-ip'] as string) ||
    req.socket?.remoteAddress ||
    '127.0.0.1';

  const { service, prompt } = req.body || {};

  const result = await processAnalyzeRequest(service, prompt, clientIp);
  return res.status(result.status).json(result.body);
}
