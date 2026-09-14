/**
 * Gemini Explicit Context Cache 生命週期管理
 *
 * 負責建立、快取、刷新 Gemini Context Cache。
 * 將知識庫 + system instruction 預先快取到 Google 伺服器，
 * 後續 generateContent 請求只需引用 cache name，大幅節省 token。
 */

import { getKnowledgeBaseText, getSystemInstruction } from './knowledge-base';

interface CacheEntry {
  /** Gemini 回傳的 cache resource name, e.g. "cachedContents/abc123" */
  name: string;
  /** Cache 到期時間（ISO 8601 字串） */
  expireTime: string;
  /** 建立此 cache 時使用的城市名稱 */
  cityName: string;
}

/** In-memory cache reference（Vercel Serverless warm instance 間共用） */
let currentCache: CacheEntry | null = null;

/** Cache TTL in seconds (1 hour) */
const CACHE_TTL_SECONDS = 3600;

/** 提前多少毫秒刷新 cache（5 分鐘提前量） */
const CACHE_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * 檢查目前的 cache 是否仍然有效
 */
function isCacheValid(cityName: string): boolean {
  if (!currentCache) return false;
  if (currentCache.cityName !== cityName) return false;

  const expireDate = new Date(currentCache.expireTime).getTime();
  const now = Date.now();

  // 如果距離過期不到 5 分鐘，視為即將過期，需要刷新
  return expireDate - now > CACHE_REFRESH_BUFFER_MS;
}

/**
 * 向 Gemini API 建立新的 Context Cache
 */
async function createCache(apiKey: string, modelName: string, cityName: string): Promise<CacheEntry> {
  const knowledgeBase = getKnowledgeBaseText();
  const systemInstruction = getSystemInstruction(cityName);

  const url = `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${apiKey}`;

  const requestBody = {
    model: `models/${modelName}`,
    contents: [
      {
        role: 'user',
        parts: [{ text: knowledgeBase }],
      },
      {
        role: 'model',
        parts: [
          {
            text: '我已完整閱讀並理解 YouBike 2.0 / 2.0E 知識庫的所有內容，包含各縣市費率、跨區調度費、租借註冊方式、故障處理、FAQ、騎乘安全與轉乘優惠等。我會嚴格依據這些資料回答使用者的問題。請開始提問！',
          },
        ],
      },
    ],
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    ttl: `${CACHE_TTL_SECONDS}s`,
  };

  console.log(`[Cache Manager] Creating new Gemini context cache for model "${modelName}", city "${cityName}"...`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error(`[Cache Manager] Failed to create cache. HTTP ${response.status}:`, errorText);
    throw new Error(`Cache creation failed (HTTP ${response.status}): ${errorText}`);
  }

  const data = await response.json();

  const entry: CacheEntry = {
    name: data.name,
    expireTime: data.expireTime,
    cityName,
  };

  console.log(`[Cache Manager] Cache created successfully: name="${entry.name}", expires="${entry.expireTime}"`);

  return entry;
}

export interface CacheResult {
  /** 成功時回傳的 cache name */
  cacheName: string | null;
  /** 是否使用了 cache（false 表示 fallback 到直接注入） */
  usedCache: boolean;
  /** 若 fallback，提供 system instruction 文字 */
  fallbackSystemInstruction?: string;
  /** 若 fallback，提供知識庫文字 */
  fallbackKnowledgeBase?: string;
}

/**
 * 確保有效的 cache 存在。
 * 若 cache 不存在或已過期，自動建立新的。
 * 若建立失敗，回傳 fallback 資料供直接注入 prompt。
 *
 * @param apiKey - Gemini API Key
 * @param modelName - 模型名稱 (e.g. "gemini-3.6-flash")
 * @param cityName - 當前城市名稱 (e.g. "台北市")
 */
export async function ensureCache(
  apiKey: string,
  modelName: string,
  cityName: string
): Promise<CacheResult> {
  // 檢查現有 cache 是否有效
  if (isCacheValid(cityName) && currentCache) {
    console.log(`[Cache Manager] Using existing cache: "${currentCache.name}"`);
    return {
      cacheName: currentCache.name,
      usedCache: true,
    };
  }

  // 嘗試建立新 cache
  try {
    const entry = await createCache(apiKey, modelName, cityName);
    currentCache = entry;
    return {
      cacheName: entry.name,
      usedCache: true,
    };
  } catch (error: any) {
    console.warn(`[Cache Manager] Cache creation failed, falling back to direct injection. Error: ${error.message}`);

    // Fallback: 回傳知識庫與 system instruction 文字，讓 analyze.ts 直接注入 prompt
    return {
      cacheName: null,
      usedCache: false,
      fallbackSystemInstruction: getSystemInstruction(cityName),
      fallbackKnowledgeBase: getKnowledgeBaseText(),
    };
  }
}
