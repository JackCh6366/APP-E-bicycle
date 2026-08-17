/**
 * update-kcg-snapshot.js
 *
 * GitHub Actions cron script for updating Kaohsiung YouBike snapshot.
 *
 * Why TDX API?
 * - KCG API (api.kcg.gov.tw / openapi.kcg.gov.tw) blocks ALL overseas IPs
 *   including GitHub Actions (Azure US), Vercel (hkg1), etc.
 * - TDX (交通部運輸資料流通服務平台) is globally accessible.
 *
 * TDX Free Tier:
 * - Register at: https://tdx.transportdata.tw/
 * - Create Application → get Client ID + Client Secret
 * - Add as GitHub Secrets: TDX_CLIENT_ID, TDX_CLIENT_SECRET
 * - Free tier limit: ~500K requests/month (far exceeds 96 req/day for 15-min cron)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TDX_CLIENT_ID = process.env.TDX_CLIENT_ID;
const TDX_CLIENT_SECRET = process.env.TDX_CLIENT_SECRET;

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const OUTPUT_FILE = path.join(PUBLIC_DIR, 'kcg-youbike-snapshot.json');

// TDX endpoints
const TDX_TOKEN_URL =
  'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
const TDX_STATION_URL =
  'https://tdx.transportdata.tw/api/basic/v2/Bike/Station/City/Kaohsiung?$format=JSON';
const TDX_AVAILABILITY_URL =
  'https://tdx.transportdata.tw/api/basic/v2/Bike/Availability/City/Kaohsiung?$format=JSON';

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error(`連線逾時 (${timeoutMs}ms): ${url}`);
    throw err;
  }
}

async function getTdxToken() {
  if (!TDX_CLIENT_ID || !TDX_CLIENT_SECRET) {
    throw new Error(
      '未設定 TDX_CLIENT_ID 或 TDX_CLIENT_SECRET 環境變數。\n' +
        '請至 https://tdx.transportdata.tw/ 免費申請帳號，建立應用程式取得憑證，\n' +
        '然後在 GitHub repo 的 Settings → Secrets → Actions 中新增這兩個 Secret。'
    );
  }

  console.log('[TDX] 取得存取 Token...');
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: TDX_CLIENT_ID,
    client_secret: TDX_CLIENT_SECRET,
  });

  const resp = await fetchWithTimeout(TDX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`TDX Token 取得失敗 HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = await resp.json();
  console.log('[TDX] Token 取得成功。');
  return data.access_token;
}

async function fetchTdxData(token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };

  console.log('[TDX] 取得高雄市站點資訊...');
  const [stationResp, availResp] = await Promise.all([
    fetchWithTimeout(TDX_STATION_URL, { headers }),
    fetchWithTimeout(TDX_AVAILABILITY_URL, { headers }),
  ]);

  if (!stationResp.ok) {
    throw new Error(`TDX Station API 失敗 HTTP ${stationResp.status}`);
  }
  if (!availResp.ok) {
    throw new Error(`TDX Availability API 失敗 HTTP ${availResp.status}`);
  }

  const stations = await stationResp.json();
  const availability = await availResp.json();

  console.log(
    `[TDX] 取得 ${stations.length} 個站點資訊, ${availability.length} 筆即時資料。`
  );
  return { stations, availability };
}

/**
 * Transform TDX data into the KCG-compatible snapshot format
 * that the frontend useYouBike hook already knows how to parse.
 *
 * TDX Station fields:
 *   StationUID, StationID, StationName.Zh_tw, StationName.En,
 *   StationPosition.PositionLat, StationPosition.PositionLon,
 *   StationAddress.Zh_tw, StationAddress.En
 *
 * TDX Availability fields:
 *   StationUID, ServiceStatus (1=normal, 0=suspended),
 *   AvailableRentBikes, AvailableReturnBikes,
 *   SrcUpdateTime, UpdateTime
 */
function transformData(stations, availability) {
  // Build availability lookup map by StationUID
  const availMap = new Map();
  for (const a of availability) {
    availMap.set(a.StationUID, a);
  }

  const now = new Date();
  const mdayFallback =
    `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}` +
    `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

  return stations.map((s) => {
    const avail = availMap.get(s.StationUID) || {};
    const sbi = avail.AvailableRentBikes ?? 0;
    const bemp = avail.AvailableReturnBikes ?? 0;
    const tot = sbi + bemp;
    const act = avail.ServiceStatus !== undefined ? avail.ServiceStatus : 1;

    // Convert TDX update time (e.g. "2026-08-17T03:30:00+08:00") to
    // KCG mday format (e.g. "20260817033000")
    let mday = mdayFallback;
    if (avail.SrcUpdateTime) {
      const d = new Date(avail.SrcUpdateTime);
      if (!isNaN(d.getTime())) {
        mday =
          `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}` +
          `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
      }
    }

    return {
      // Core KCG-compatible fields (useYouBike.ts reads these)
      sno: s.StationID || s.StationUID || '',
      sna: s.StationName?.Zh_tw || '',
      snaen: s.StationName?.En || '',
      sarea: s.StationDistrict || extractDistrict(s.StationAddress?.Zh_tw) || '',
      sareaen: '',
      ar: s.StationAddress?.Zh_tw || '',
      aren: s.StationAddress?.En || '',
      lat: String(s.StationPosition?.PositionLat ?? 0),
      lng: String(s.StationPosition?.PositionLon ?? 0),
      sbi: String(sbi),
      bemp: String(bemp),
      tot: String(tot),
      act: act,
      mday: mday,
      scity: '高雄市',
      scityen: 'Kaohsiung City',
    };
  });
}

/** Try to extract district name from full address (e.g. "高雄市新興區..." → "新興區") */
function extractDistrict(address) {
  if (!address) return '';
  const match = address.match(/高雄市(.{2,3}[區鄉鎮市])/);
  return match ? match[1] : '';
}

async function updateSnapshot() {
  try {
    const token = await getTdxToken();
    const { stations, availability } = await fetchTdxData(token);

    if (!stations || stations.length === 0) {
      console.error('[ERROR] TDX 回傳空站點列表，保留現有快照。');
      process.exit(1);
    }

    const transformedStations = transformData(stations, availability);
    const fetchedAt = new Date().toISOString();

    const snapshotPayload = {
      fetchedAt,
      totalStations: transformedStations.length,
      data: transformedStations,
    };

    if (!fs.existsSync(PUBLIC_DIR)) {
      fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(snapshotPayload, null, 2), 'utf-8');
    console.log(
      `[SUCCESS] 成功更新高雄市靜態快照：${transformedStations.length} 個站點，時間: ${fetchedAt}`
    );
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    process.exit(1);
  }
}

updateSnapshot();
