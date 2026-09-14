import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getKnowledgeBaseText, getSystemInstruction } from './knowledge-base';

const SERVICE_WHITELIST: Record<string, { provider: 'gemini' | 'nvidia'; model: string; fallbackModel?: string; name: string }> = {
  gemini: {
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    fallbackModel: 'gemini-3.5-flash',
    name: 'Google Gemini 3.6 Flash',
  },
  'gpt-oss': {
    provider: 'nvidia',
    model: 'openai/gpt-oss-20b',
    name: 'OpenAI GPT-OSS 20B',
  },
  nvidia: {
    provider: 'nvidia',
    model: 'openai/gpt-oss-20b',
    name: 'OpenAI GPT-OSS 20B',
  },
  meta: {
    provider: 'nvidia',
    model: 'openai/gpt-oss-20b',
    name: 'OpenAI GPT-OSS 20B',
  },
};

// In-memory rate limiting map (IP -> timestamps array)
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 20; // 20 requests per minute

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

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  text: string;
}

export async function processAnalyzeRequest(
  service: string,
  prompt: string,
  ip: string,
  systemInstruction?: string,
  history?: ChatHistoryItem[],
  cityName?: string
): Promise<{ status: number; body: { reply?: string; error?: string } }> {
  // 1. Rate Limiting Check
  if (!checkRateLimit(ip)) {
    return {
      status: 429,
      body: { error: '請求過於頻繁，請稍後再試（速率限制：每分鐘最多 20 次）。' },
    };
  }

  // 2. Security Whitelist Check for service parameter
  const serviceConfig = SERVICE_WHITELIST[service];
  if (!serviceConfig) {
    return {
      status: 400,
      body: { error: '不合法的 AI 服務選擇。僅支援 "gemini" 與 "gpt-oss"。' },
    };
  }

  // 3. Input Validation and Length Limit Check
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return {
      status: 400,
      body: { error: '請輸入有效的查詢內容。' },
    };
  }

  if (prompt.length > 8000) {
    return {
      status: 400,
      body: { error: `查詢內容超出長度限制（當前 ${prompt.length} 字，上限 8000 字）。` },
    };
  }

  // 4. Upstream API Call with AbortController Timeout (38 seconds)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 38000);

  try {
    const resolvedCityName = cityName || '台北市';
    const activeSystemInstruction = systemInstruction || getSystemInstruction(resolvedCityName);
    const activeKnowledgeBase = getKnowledgeBaseText();

    if (serviceConfig.provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (!apiKey) {
        return {
          status: 500,
          body: { error: '伺服器端未設定 GEMINI_API_KEY 環境變數。' },
        };
      }

      // Build structured contents for Gemini
      const contents: Array<{ role?: string; parts: Array<{ text: string }> }> = [];

      // Prepend knowledge base as structured context
      contents.push(
        {
          role: 'user',
          parts: [{ text: activeKnowledgeBase }],
        },
        {
          role: 'model',
          parts: [
            {
              text: '我已完整閱讀並理解 YouBike 2.0 / 2.0E 核心規則與政策知識庫。我會嚴格依據這些資料回答使用者的問題。請開始提問！',
            },
          ],
        }
      );

      if (Array.isArray(history) && history.length > 0) {
        for (const item of history) {
          if (item.text && item.text.trim()) {
            contents.push({
              role: item.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: item.text }],
            });
          }
        }
      }

      // Append current user prompt
      contents.push({
        role: 'user',
        parts: [{ text: prompt }],
      });

      const requestBody: any = {
        contents,
        generationConfig: {
          temperature: 0.2, // Lower temperature to prevent hallucination and off-topic responses
          topP: 0.8,
          maxOutputTokens: 2048,
        },
        system_instruction: {
          parts: [{ text: activeSystemInstruction }],
        },
      };

      const callGemini = async (modelName: string) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        return await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify(requestBody),
        });
      };

      let response = await callGemini(serviceConfig.model);

      // If primary model fails (e.g. 503 High demand, 429 rate limit, 500 error, 404 not found) and fallbackModel exists, automatically fall back
      if (!response.ok && serviceConfig.fallbackModel) {
        const primaryError = await response.text().catch(() => '');
        console.warn(
          `[Google Gemini API] Primary model ${serviceConfig.model} returned HTTP ${response.status} (${primaryError.slice(0, 150)}). Automatically falling back to ${serviceConfig.fallbackModel}...`
        );
        response = await callGemini(serviceConfig.fallbackModel);
      }

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error(`[Google Gemini API Error] HTTP ${response.status}:`, errorText);

        let upstreamMsg = errorText;
        try {
          const parsed = JSON.parse(errorText);
          upstreamMsg = parsed?.error?.message || errorText;
        } catch (_) {}

        if (response.status === 503 || upstreamMsg.toLowerCase().includes('high demand')) {
          return {
            status: 503,
            body: { error: 'Google Gemini 官方目前處於尖峰高負載狀態（503 暫時性擁擠），請稍候 3~5 秒後再試，或可切換至 OpenAI GPT-OSS 模型。' },
          };
        }

        if (isQuotaError(errorText) || response.status === 429) {
          return {
            status: 429,
            body: { error: 'AI 服務目前使用量過大或額度不足，請稍後再試。' },
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
      
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

      // Unified system instruction and knowledge base for NVIDIA (GPT-OSS 20B)
      messages.push({
        role: 'system',
        content: `${activeSystemInstruction}\n\n${activeKnowledgeBase}`,
      });

      if (Array.isArray(history) && history.length > 0) {
        for (const item of history) {
          if (item.text && item.text.trim()) {
            messages.push({
              role: item.role === 'assistant' ? 'assistant' : 'user',
              content: item.text,
            });
          }
        }
      }

      messages.push({
        role: 'user',
        content: prompt,
      });

      const response = await fetch(nvidiaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: serviceConfig.model,
          messages,
          temperature: 0.2, // Lower temperature to focus answers
          max_tokens: 2048,
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
      console.error('[AI Service Timeout] Request aborted after 38s timeout.');
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

  const { service, prompt, systemInstruction, history, cityName } = req.body || {};

  const result = await processAnalyzeRequest(service, prompt, clientIp, systemInstruction, history, cityName);
  return res.status(result.status).json(result.body);
}
