import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to parse JSON
  app.use(express.json());

  // API Route: AI Consultation
  app.post("/api/ai/consult", async (req, res) => {
    try {
      const { userPrompt, history, sarea, selectedStation, stationStats } = req.body;

      if (!userPrompt) {
        res.status(400).json({ error: "userPrompt is required" });
        return;
      }

      // Build context information to feed the Gemini model
      let contextInfo = `【即時台北市 YouBike 2.0 系統狀態與使用者上下文】\n`;
      if (sarea) {
        contextInfo += `- 使用者目前瀏覽/選取的行政區：${sarea}\n`;
      }
      if (selectedStation) {
        contextInfo += `- 使用者目前選取的特定站點：${selectedStation.sna} (${selectedStation.ar || "無地址資訊"})\n`;
        contextInfo += `  * 可借車輛 (租車)：${selectedStation.available_rent_bikes} 輛\n`;
        contextInfo += `  * 可還車位 (空位)：${selectedStation.available_return_bikes} 個\n`;
        contextInfo += `  * 總車位數：${selectedStation.total} 個\n`;
        contextInfo += `  * 營運狀態：${selectedStation.act === "1" ? "正常營運中" : "暫停服務"}\n`;
      }
      if (stationStats && Array.isArray(stationStats) && stationStats.length > 0) {
        contextInfo += `- 該區域（${sarea || "目前區域"}）的其他推薦「可借車輛較多」的站點：\n`;
        stationStats.forEach((st: any, idx: number) => {
          contextInfo += `  ${idx + 1}. ${st.sna}: 剩餘可借 ${st.available_rent_bikes} 輛 / 可還 ${st.available_return_bikes} 空位 (地址: ${st.ar})\n`;
        });
      }

      // Standard useful YouBike 2.0 info context
      const guideInfo = `
【台北市 YouBike 2.0 實用資訊速查】
1. 費率說明：
   - 騎乘前 30 分鐘：5 元（台北市政府補助 5 元政策已上路，原價 10 元，使用者僅需付 5 元）。
   - 4 小時內：每 30 分鐘 10 元。
   - 4 至 8 小時：每 30 分鐘 20 元。
   - 超過 8 小時：每 30 分鐘 40 元。
   - 跨區借還車：台北市與新北市、桃園市互還不收取跨區調度費。
2. 租借與扣款方式：
   - 悠遊卡（EasyCard）、一卡通（iPASS）等電子票證。
   - 掃碼租車：手機下載 YouBike 2.0 官方 App，綁定信用卡或 Line Pay 掃描車機上的 QR Code 即可租借。
3. 聯絡資訊與遺失物：
   - 客服專線：02-89785522 或 1999 轉 YouBike 客服。
   - 若遺失物品，可連繫客服或至 YouBike 官網/App 的遺失物專區查詢。
4. 安全守則：
   - 嚴禁雙載。
   - 騎乘於自行車專用道，或設有慢車道之道路。禁止騎乘於人行道（除非設有行人與自行車共用標誌）。
   - 騎乘前請務必檢查煞車、胎壓與座墊高度。
`;

      const systemInstruction = `
你是一位專業、親切且幽默的「台北 YouBike 2.0 AI 智慧諮詢專員」。
你的職責是協助市民和旅客解答 YouBike 2.0 相關疑問，並根據系統提供的即時站點狀態推薦最適合的租借點。

【回覆準則】
1. 始終使用「繁體中文（台灣繁體）」進行回覆。
2. 語氣保持溫暖、積極、熱情。
3. 充分利用下方提供的【即時台北市 YouBike 2.0 系統狀態】與【實用資訊速查】來精準回答，絕不編造無效站點。
4. 當使用者問及「哪裡有車」、「推薦站點」或特定站點時，請利用即時上下文中的站點資訊，點名推薦站點並說明可借車輛與地址。
5. 若使用者在深夜詢問，可貼心提醒騎乘安全；若天氣炎熱或下雨，可給予適度關懷。
6. 使用精美的 Markdown 排版（包括適度使用 emoji、粗體、清單）使內容清晰、好讀。
`;

      // Build message contents following GoogleGenAI schema
      const messagesToSend: any[] = [];
      
      // If history exists, map to standard format
      if (history && Array.isArray(history)) {
        history.forEach((msg: any) => {
          messagesToSend.push({
            role: msg.role === "assistant" ? "model" : "user",
            parts: [{ text: msg.text }]
          });
        });
      }

      // Add context and new user prompt as the final user turn
      messagesToSend.push({
        role: "user",
        parts: [{ text: `${contextInfo}\n${guideInfo}\n\n使用者最新詢問：${userPrompt}` }]
      });

      // Call Gemini 3.5 Flash (the recommended model for basic/interactive text tasks)
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: messagesToSend,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      const text = response.text || "抱歉，目前 AI 專員無法產生回覆，請稍後再試。";
      res.json({ reply: text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "處理 AI 諮詢時發生未知錯誤" });
    }
  });

  // Serve static files and fallback to index.html in production, Vite in development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
