import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// GitHub Actions runner (Azure US East) is blocked by KCG API firewall.
// Solution: call our dedicated Vercel proxy endpoint (deployed in hkg1 / Hong Kong) which CAN reach KCG API.
const VERCEL_APP_URL = process.env.VERCEL_APP_URL || 'https://app-e-bicycle.vercel.app';

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const OUTPUT_FILE = path.join(PUBLIC_DIR, 'kcg-youbike-snapshot.json');

async function fetchWithTimeout(url, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'github-actions-snapshot-updater/1.0',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP 錯誤 ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function updateSnapshot() {
  const fetchUrl = `${VERCEL_APP_URL}/api/kcg-fetch`;
  console.log(`[${new Date().toISOString()}] 透過 Vercel hkg1 proxy 取得高雄市 YouBike 資料...`);
  console.log(`呼叫端點: ${fetchUrl}`);

  let result;
  try {
    result = await fetchWithTimeout(fetchUrl);
  } catch (err) {
    const msg = err.name === 'AbortError' ? '連線逾時 (Timeout)' : err.message;
    console.error(`[ERROR] 呼叫 Vercel endpoint 失敗: ${msg}`);
    process.exit(1);
  }

  if (result.error) {
    console.error(`[ERROR] Vercel proxy 回傳錯誤: ${result.error}`);
    process.exit(1);
  }

  const stations = result.stations;

  if (!stations || stations.length === 0) {
    console.error(`[ERROR] 無法取得有效的高雄市站點資料 (解析數量: 0)。保留現有快照檔案，不寫入空內容。`);
    process.exit(1);
  }

  const snapshotPayload = {
    fetchedAt: result.fetchedAt ?? new Date().toISOString(),
    totalStations: stations.length,
    data: stations,
  };

  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(snapshotPayload, null, 2), 'utf-8');
  console.log(
    `[SUCCESS] 成功更新高雄市靜態快照至 ${OUTPUT_FILE} (包含 ${stations.length} 個站點, 時間: ${snapshotPayload.fetchedAt})`
  );
}

updateSnapshot();
