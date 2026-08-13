import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KCG_API_URLS = [
  'https://api.kcg.gov.tw/api/service/Get/b4dd9c40-9027-4125-8666-06bef1756092',
  'https://openapi.kcg.gov.tw/Api/Service/Get/b4dd9c40-9027-4125-8666-06bef1756092',
];

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const OUTPUT_FILE = path.join(PUBLIC_DIR, 'kcg-youbike-snapshot.json');

function fetchHttps(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        family: 4,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
        rejectUnauthorized: false,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(new Error('JSON 解析失敗'));
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      const err = new Error('Timeout');
      err.name = 'AbortError';
      reject(err);
    });
  });
}

async function updateSnapshot() {
  console.log(`[${new Date().toISOString()}] 開始存取高雄市 YouBike 原始 API...`);
  let rawData = null;
  let lastError = null;

  for (const url of KCG_API_URLS) {
    try {
      console.log(`嘗試連線至: ${url}`);
      rawData = await fetchHttps(url, 15000);
      if (rawData) {
        console.log(`成功由 ${url} 取得資料`);
        break;
      }
    } catch (err) {
      console.error(`連線至 ${url} 失敗:`, err.message);
      lastError = err;
    }
  }

  // Extract station list array
  let stations = [];
  if (rawData) {
    if (Array.isArray(rawData)) {
      stations = rawData;
    } else if (rawData && typeof rawData === 'object') {
      if (Array.isArray(rawData.data?.data?.retVal)) {
        stations = rawData.data.data.retVal;
      } else if (Array.isArray(rawData.data?.retVal)) {
        stations = rawData.data.retVal;
      } else if (Array.isArray(rawData.retVal)) {
        stations = rawData.retVal;
      } else if (Array.isArray(rawData.data)) {
        stations = rawData.data;
      }
    }
  }

  if (!stations || stations.length === 0) {
    console.error(`[ERROR] 無法取得無效的高雄市站點資料 (解析數量: ${stations.length})。保留現有快照檔案，不安裝空內容。`);
    if (lastError) console.error('詳細錯誤資訊:', lastError);
    process.exit(1);
  }

  const snapshotPayload = {
    fetchedAt: new Date().toISOString(),
    totalStations: stations.length,
    data: stations,
  };

  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(snapshotPayload, null, 2), 'utf-8');
  console.log(`[SUCCESS] 成功更新高雄市靜態快照至 ${OUTPUT_FILE} (包含 ${stations.length} 個站點)`);
}

updateSnapshot();
