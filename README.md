# Jack的youbike小幫手 (YouBike 2.0 AI 智慧諮詢)

台北市 YouBike 2.0 即時車位查詢 App，提供即時車位狀態、地圖定位、搜尋與多 AI 服務模型諮詢。

## 專案架構
- **Frontend**: React + Vite + TailwindCSS + Leaflet
- **Backend API**: Vercel Serverless Function (`/api/analyze.ts`)
- **AI 服務支援**:
  - Google Gemini (`gemini-3.5-flash-lite`)
  - NVIDIA (`nvidia/nemotron-3-ultra-550b-a55b`)
  - Meta (`meta/llama-3.3-70b-instruct`)

## 本地開發步驟 (Local Development)

1. 安裝依賴套件：
   ```bash
   npm install
   ```

2. 設定本地環境變數：
   複製 `.env.example` 為 `.env.local` 並填入您的 API Keys：
   ```env
   GEMINI_API_KEY=你的_Gemini_API_Key
   NVIDIA_API_KEY=你的_NVIDIA_API_Key
   ```

3. 啟動 Vite 開發伺服器：
   ```bash
   npm run dev
   ```

## 部署至 Vercel (Vercel Deployment)

1. 將本專案推送至 GitHub Repository。
2. 進入 Vercel Dashboard 匯入該專案。
3. 在 Vercel 專案設定的 Environment Variables 加入：
   - `GEMINI_API_KEY`
   - `NVIDIA_API_KEY`
4. 點擊 Deploy 即可完成部署，`/api/analyze` 會自動作為 Serverless Function 運作。
