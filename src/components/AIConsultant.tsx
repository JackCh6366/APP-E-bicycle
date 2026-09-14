import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Sparkles, X, Send, Bot, User, CornerDownLeft, Loader2, RefreshCw } from 'lucide-react';
import { YouBikeStation } from '../types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

interface AIConsultantProps {
  currentCityName?: string;
  currentDistrict: string;
  selectedStation: YouBikeStation | null;
  stationsInDistrict: YouBikeStation[];
  allStations?: YouBikeStation[];
}

interface StationMatchResult {
  type: 'specific_found' | 'specific_not_found' | 'open_query';
  matchedStations: YouBikeStation[];
  extractedKeyword?: string;
}

function cleanStationRawName(sna: string): string {
  return sna.replace(/^YouBike2\.0_/i, '').trim();
}

/**
 * 智慧比對使用者輸入中提到的站點（支援口語簡稱、模糊比對與防混淆）
 */
function matchStationsFromQuery(
  query: string,
  allStations: YouBikeStation[],
  stationsInDistrict: YouBikeStation[]
): StationMatchResult {
  const normalizedQuery = query.trim();

  // 0. 識別行政區與開放性推薦意圖
  const districtList = [
    '中正區', '大同區', '中山區', '松山區', '大安區', '萬華區', '信義區', '士林區', '北投區', '內湖區', '南港區', '文山區',
    '板橋區', '三重區', '中和區', '永和區', '新莊區', '新店區', '樹林區', '鶯歌區', '三峽區', '淡水區', '汐止區', '瑞芳區', '土城區', '蘆洲區', '五股區', '泰山區', '林口區',
    '桃園區', '中壢區', '平鎮區', '八德區', '楊梅區', '蘆竹區', '大溪區', '龜山區', '大園區', '觀音區', '新屋區', '龍潭區', '復興區',
    '新興區', '前金區', '苓雅區', '鹽埕區', '鼓山區', '旗津區', '前鎮區', '三民區', '楠梓區', '小港區', '左營區'
  ];

  const matchedDistrict = districtList.find(d => normalizedQuery.includes(d) || normalizedQuery.includes(d.replace('區', '')));

  // 1. 開放性問題模式（非指名特定站點）
  const openPatterns = [
    /附近有哪些站/,
    /推薦.*站點/,
    /推薦.*借車/,
    /推薦.*還車/,
    /哪裡有車/,
    /哪裡可以借/,
    /哪裡可還/,
    /推薦去哪/,
    /附近有車/,
    /附近推薦/,
    /這附近/,
    /車輛充足/,
  ];

  const isOpenQuestion = openPatterns.some((pattern) => pattern.test(normalizedQuery));

  // 如果使用者是問「某行政區推薦去哪借車/附近有哪些站」，直接視為開放推薦
  if (isOpenQuestion && (matchedDistrict || normalizedQuery.includes('附近') || normalizedQuery.includes('推薦'))) {
    const targetStations = matchedDistrict
      ? allStations.filter(s => s.sarea.includes(matchedDistrict.replace('區', '')))
      : stationsInDistrict;

    const topAvailable = [...targetStations]
      .filter(s => s.available_rent_bikes > 0 && s.act === '1')
      .sort((a, b) => b.available_rent_bikes - a.available_rent_bikes)
      .slice(0, 5);

    return {
      type: 'open_query',
      matchedStations: topAvailable.length > 0 ? topAvailable : targetStations.slice(0, 5),
      extractedKeyword: matchedDistrict || undefined,
    };
  }

  // 2. 搜尋特定站點比對
  let candidates: Array<{
    station: YouBikeStation;
    score: number;
    matchTerm: string;
  }> = [];

  for (const s of allStations) {
    const rawClean = cleanStationRawName(s.sna);
    const baseName = rawClean.replace(/\(.*?\)/g, '').replace(/（.*?）/g, '').trim();

    const aliases = new Set<string>();
    aliases.add(s.sna);
    aliases.add(rawClean);
    aliases.add(baseName);

    const mrtMatch = baseName.match(/^捷運(.+?)(站)?$/);
    if (mrtMatch) {
      const core = mrtMatch[1];
      aliases.add(`${core}捷運站`);
      aliases.add(`${core}捷運`);
      aliases.add(`${core}站`);
      if (core.length >= 2) {
        aliases.add(core);
      }
    } else {
      aliases.add(`${baseName}站`);
      const suffixStation = baseName.match(/^(.+?)站$/);
      if (suffixStation && suffixStation[1].length >= 2) {
        aliases.add(suffixStation[1]);
      }
    }

    for (const alias of aliases) {
      if (alias.length < 2) continue;
      if (districtList.some(d => d.startsWith(alias)) && isOpenQuestion) continue;

      if (normalizedQuery.includes(alias)) {
        let score = alias.length * 10;
        if (alias === s.sna || alias === rawClean) {
          score += 60;
        } else if (alias === baseName) {
          score += 40;
        } else if (alias.includes('捷運') || alias.includes('站')) {
          score += 25;
        }

        candidates.push({
          station: s,
          score,
          matchTerm: alias,
        });
        break;
      }
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);

    const topScore = candidates[0].score;
    const topTerm = candidates[0].matchTerm;

    const matched = candidates
      .filter((c) => c.score >= topScore - 10)
      .map((c) => c.station)
      .filter((s, idx, arr) => arr.findIndex((x) => x.sno === s.sno) === idx)
      .slice(0, 3);

    return {
      type: 'specific_found',
      matchedStations: matched,
      extractedKeyword: topTerm,
    };
  }

  // 3. 檢查是否指名特定站點但查無此站
  const cleanedQueryForExtract = normalizedQuery
    .replace(/^(請問一下|請問|想問|幫我查|查一下|查詢)/g, '')
    .trim();

  const specificInquiryMatch = cleanedQueryForExtract.match(
    /([\u4e00-\u9fa5A-Za-z0-9_]{2,12}(?:捷運站|站點|火車站|高鐵站|公車站|站))|([「『](.+?)[」』])/
  );

  if (specificInquiryMatch && !isOpenQuestion) {
    const extractedName = specificInquiryMatch[3] || specificInquiryMatch[1] || '';
    return {
      type: 'specific_not_found',
      matchedStations: [],
      extractedKeyword: extractedName,
    };
  }

  // 4. 開放式提問或未偵測到特定站名
  const fallbackAvailable = [...stationsInDistrict]
    .filter(s => s.available_rent_bikes > 0 && s.act === '1')
    .sort((a, b) => b.available_rent_bikes - a.available_rent_bikes)
    .slice(0, 5);

  return {
    type: 'open_query',
    matchedStations: fallbackAvailable.length > 0 ? fallbackAvailable : stationsInDistrict.slice(0, 5),
  };
}

const QUICK_QUESTIONS = [
  { text: '🚲 推薦車輛充足站點', tag: 'recommend' },
  { text: '💰 2.0 / 2.0E 費率計算', tag: 'rate' },
  { text: '🌧️ 下雨天騎乘注意事項', tag: 'safety' },
  { text: '🔑 悠遊卡/一卡通如何註冊', tag: 'easycard' },
  { text: '🛠️ 借到故障車（坐墊反轉）', tag: 'broken' },
  { text: '🚴 雙北/跨縣市調度費規則', tag: 'dispatch' },
];

export default function AIConsultant({ currentCityName = '台北市', currentDistrict, selectedStation, stationsInDistrict, allStations }: AIConsultantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: `您好！我是 **Jack的youbike小幫手** 專屬 AI 智慧客服 🚲✨\n\n我可以協助您：\n- 查詢【${currentCityName} ${currentDistrict || '全區'}】的即時推薦車輛充足站點\n- 計算 2.0 / 2.0E 租借費率、補助與跨市調度費規定\n- 提供騎乘安全、故障回報（坐墊反轉）、票卡註冊等即時解答\n\n請問有什麼我可以幫您的嗎？您可以直接輸入問題，或點選下方的快捷標籤喔！`,
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedService, setSelectedService] = useState<'gemini' | 'gpt-oss'>('gemini');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Update welcome message if district or city changes
  useEffect(() => {
    if (messages.length === 1 && messages[0].id === 'welcome') {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          text: `您好！我是 **Jack的youbike小幫手** 專屬 AI 智慧客服 🚲✨\n\n我可以協助您：\n- 查詢【${currentCityName} ${currentDistrict || '全區'}】的即時推薦車輛充足站點\n- 計算 2.0 / 2.0E 租借費率、補助與跨市調度費規定\n- 提供騎乘安全、故障回報（坐墊反轉）、票卡註冊等即時解答\n\n請問有什麼我可以幫您的嗎？您可以直接輸入問題，或點選下方的快捷標籤喔！`,
          timestamp: new Date(),
        }
      ]);
    }
  }, [currentCityName, currentDistrict]);

  // 判斷使用者問題是否與站點車況/找車/還車相關
  const isStationQuery = (query: string): boolean => {
    const stationKeywords = [
      '站', '車', '借', '還', '空位', '滿位', '推薦', '哪裡', '附近',
      '位置', '地點', '剩餘', '庫存', '沒車', '無車', '滿站', '找車', '周邊'
    ];
    return stationKeywords.some(kw => query.includes(kw));
  };

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: textToSend,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const isAskingStation = isStationQuery(textToSend);
      const stationPool = (allStations && allStations.length > 0) ? allStations : stationsInDistrict;
      const matchResult = matchStationsFromQuery(textToSend, stationPool, stationsInDistrict);

      let contextInfo = `【即時系統環境】\n- 當前縣市：${currentCityName}\n`;
      if (currentDistrict) {
        contextInfo += `- 使用者目前瀏覽行政區：${currentDistrict}\n`;
      }
      if (selectedStation) {
        contextInfo += `- 使用者地圖選取之站點：${selectedStation.sna} (${selectedStation.ar || '無詳細地址'})\n`;
        contextInfo += `  * 車況：可借 ${selectedStation.available_rent_bikes} 輛，可還空位 ${selectedStation.available_return_bikes} 個，營運狀態：${selectedStation.act === '1' ? '正常營運' : '暫停服務'}\n`;
      }

      if (matchResult.type === 'specific_found') {
        contextInfo += `- 使用者查詢特定站點之即時車況（精準比對成功）：\n`;
        for (const s of matchResult.matchedStations) {
          contextInfo += `  * ${s.sna} [${s.sarea}]: 可借 ${s.available_rent_bikes} 輛 / 可還 ${s.available_return_bikes} 空位 (營運狀態: ${s.act === '1' ? '正常營運' : '暫停服務'}, 地址: ${s.ar || '無詳細地址'})\n`;
        }
        contextInfo += `【回答指引】：請優先且精準回答上方比對到的站點即時車況，切勿回答其他無關站點。\n`;
      } else if (matchResult.type === 'specific_not_found') {
        contextInfo += `- 使用者指名查詢之站點「${matchResult.extractedKeyword}」：在目前【${currentCityName}】即時資料庫中查無完全符合的站點名稱。\n`;
        contextInfo += `【回答指引】：請明確且誠實告知使用者在${currentCityName}即時資料庫中查無此站點，建議確認站名是否正確或於上方搜尋欄查詢。嚴禁捏造站點數據或拿其他無關站點冒充。\n`;
      } else if (isAskingStation && matchResult.matchedStations.length > 0) {
        contextInfo += `- 該區域目前車輛充足推薦站點（即時數據）：\n`;
        for (const s of matchResult.matchedStations) {
          contextInfo += `  * ${s.sna} [${s.sarea}]: 可借 ${s.available_rent_bikes} 輛 / 可還 ${s.available_return_bikes} 空位 (${s.ar || '無詳細地址'})\n`;
        }
      }

      // 結構化多輪歷史
      const historyPayload = messages.slice(1).slice(-6).map((msg) => ({
        role: msg.role,
        text: msg.text,
      }));

      const userPrompt = `【使用者提問】\n${textToSend}\n\n${contextInfo}`;

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          service: selectedService,
          prompt: userPrompt,
          history: historyPayload,
          cityName: currentCityName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'AI 專員暫時無法回應，請稍後再試。');
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: data.reply,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: `⚠️ **連線失敗**\n\n${error.message || '無法連線至 AI 服務，請稍後再試。'}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickQuestion = (questionText: string) => {
    let processedText = questionText;
    if (questionText.includes('目前區域') && currentDistrict) {
      processedText = questionText.replace('目前區域', currentDistrict);
    }
    handleSend(processedText);
  };

  const handleResetChat = () => {
    if (window.confirm('確定要清空對話紀錄並重置 AI 客服嗎？')) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          text: `對話已重置！我是您的 **${currentCityName} YouBike 2.0 智慧 AI 客服** 🚲✨\n\n目前您瀏覽的是 **${currentDistrict || '所有行政區'}**，請問今天有什麼我可以協助您的嗎？`,
          timestamp: new Date(),
        }
      ]);
    }
  };

  // 格式化文字解析（粗體標記）
  const renderFormattedLine = (content: string, isAssistant: boolean) => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const regex = /\*\*(.*?)\*\*/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      const textBefore = content.substring(lastIndex, match.index);
      if (textBefore) parts.push(textBefore);
      parts.push(
        <strong
          key={match.index}
          className={`font-bold ${isAssistant ? 'text-slate-900 dark:text-amber-300' : 'text-inherit'}`}
        >
          {match[1]}
        </strong>
      );
      lastIndex = regex.lastIndex;
    }
    const textAfter = content.substring(lastIndex);
    if (textAfter) parts.push(textAfter);

    return parts.length > 0 ? parts : content;
  };

  // 處理 Markdown 清單與換行，修復「• -」重複符號與版面跑版問題
  const renderMessageText = (text: string, isAssistant: boolean = true) => {
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      const trimmed = line.trim();

      // 無序清單 (- 或 * 開頭)
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const cleanContent = trimmed.substring(2).trim();
        return (
          <li key={idx} className="list-disc list-outside ml-4 my-1 text-inherit pl-0.5 leading-relaxed">
            {renderFormattedLine(cleanContent, isAssistant)}
          </li>
        );
      }

      // 有序清單 (1. 2. 等數字開頭)
      const orderedMatch = trimmed.match(/^(\d+)\.\s*(.*)/);
      if (orderedMatch) {
        const num = orderedMatch[1];
        const cleanContent = orderedMatch[2];
        return (
          <div key={idx} className="flex items-start gap-1.5 my-1 text-inherit leading-relaxed">
            <span className={`font-bold shrink-0 text-xs ${isAssistant ? 'text-amber-500 dark:text-amber-400' : 'text-inherit'}`}>
              {num}.
            </span>
            <span className="flex-1">{renderFormattedLine(cleanContent, isAssistant)}</span>
          </div>
        );
      }

      // 空行
      if (!trimmed) {
        return <div key={idx} className="h-1.5" />;
      }

      // 一般段落
      return (
        <p key={idx} className="leading-relaxed my-0.5">
          {renderFormattedLine(line, isAssistant)}
        </p>
      );
    });
  };

  return (
    <>
      {/* 1. Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 flex items-center gap-2 px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-full shadow-2xl transition-all duration-300 transform active:scale-95 cursor-pointer ${
          isOpen
            ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 scale-90'
            : 'bg-[#FFD700] hover:bg-[#ffdf1a] text-slate-900 font-bold hover:shadow-amber-500/20 scale-100'
        }`}
        id="ai-consultant-trigger"
        aria-label="開啟 AI 客服"
      >
        {isOpen ? (
          <>
            <X className="w-5 h-5" />
            <span className="text-xs font-bold hidden sm:inline">關閉客服</span>
          </>
        ) : (
          <>
            <div className="relative">
              <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
              <span className="absolute -top-1 -right-1 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
            </div>
            <span className="text-xs sm:text-sm font-black tracking-tight">AI 客服</span>
            <div className="bg-slate-900/10 dark:bg-white/10 px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-extrabold flex items-center gap-0.5">
              <Sparkles className="w-2.5 h-2.5 animate-pulse text-amber-600 dark:text-amber-400" />
              Live
            </div>
          </>
        )}
      </button>

      {/* 2. Chat Window Panel (RWD Optimized) */}
      <div
        className={`fixed inset-x-3 bottom-16 sm:inset-x-auto sm:right-6 sm:bottom-20 w-auto sm:w-[420px] z-50 bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden transition-all duration-300 transform origin-bottom-right ${
          isOpen ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-12 opacity-0 pointer-events-none scale-95'
        }`}
        style={{ height: 'min(620px, calc(100dvh - 85px))' }}
      >
        {/* Chat Header (Compact RWD Design) */}
        <div className="bg-slate-900 dark:bg-slate-950 px-3.5 py-2.5 sm:px-4 sm:py-3 text-white relative shrink-0">
          {/* Top Yellow Accent Bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#FFD700]"></div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#FFD700] flex items-center justify-center text-slate-900 shadow-md shrink-0">
                <Bot className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.2]" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-xs sm:text-sm flex items-center gap-1.5 leading-tight">
                  <span className="truncate">Jack的小幫手 AI 客服</span>
                  <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 shrink-0">連線中</span>
                </h3>
                <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">即時車況、費率與騎乘指南</p>
              </div>
            </div>
            
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={handleResetChat}
                title="清空對話"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="關閉視窗"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Compact Control Strip: Context + Model Selector */}
          <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[10px] sm:text-[11px]">
            <div className="flex items-center gap-1 text-slate-300 min-w-0 truncate">
              <span className="text-amber-400 shrink-0 font-bold">📍</span>
              <span className="font-semibold text-[#FFD700] truncate">{currentCityName} {currentDistrict || '全區'}</span>
              {selectedStation && (
                <span className="text-slate-400 truncate text-[10px]">({selectedStation.sna})</span>
              )}
            </div>
            
            <div className="shrink-0 flex items-center gap-1">
              <span className="text-slate-400 text-[10px] hidden xs:inline">模型:</span>
              <select
                id="ai-service-selector"
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value as 'gemini' | 'gpt-oss')}
                className="bg-slate-800 hover:bg-slate-750 text-slate-200 text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 rounded border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400 cursor-pointer"
              >
                <option value="gemini">Gemini 3.6 Flash</option>
                <option value="gpt-oss">GPT-OSS 20B</option>
              </select>
            </div>
          </div>
        </div>

        {/* Chat Body */}
        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 bg-slate-50/70 dark:bg-slate-950/60"
        >
          {messages.map((msg) => {
            const isAssistant = msg.role === 'assistant';
            return (
              <div
                key={msg.id}
                className={`flex gap-2 sm:gap-2.5 ${isAssistant ? 'justify-start' : 'justify-end'}`}
              >
                {isAssistant && (
                  <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-slate-200/70 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200/50 dark:border-slate-700/50 mt-0.5">
                    <Bot className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-700 dark:text-slate-300" />
                  </div>
                )}
                
                <div
                  className={`max-w-[88%] sm:max-w-[82%] rounded-2xl px-3 py-2 sm:px-3.5 sm:py-2.5 text-xs sm:text-[13px] shadow-xs leading-relaxed ${
                    isAssistant
                      ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200/60 dark:border-slate-800 rounded-tl-xs'
                      : 'bg-slate-900 dark:bg-amber-400 text-white dark:text-slate-950 rounded-tr-xs font-medium'
                  }`}
                >
                  <div className="space-y-1">
                    {renderMessageText(msg.text, isAssistant)}
                  </div>
                  <span
                    className={`block text-[9px] sm:text-[10px] mt-1 text-right ${
                      isAssistant ? 'text-slate-400' : 'text-white/70 dark:text-slate-900/70'
                    }`}
                  >
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {!isAssistant && (
                  <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-slate-900 dark:bg-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white dark:text-slate-950" />
                  </div>
                )}
              </div>
            );
          })}

          {/* Typing indicator */}
          {isLoading && (
            <div className="flex gap-2 sm:gap-2.5 justify-start">
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-slate-200/70 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200/50 dark:border-slate-700/50 animate-pulse mt-0.5">
                <Bot className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-700 dark:text-slate-300" />
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-2xl rounded-tl-xs px-3 py-2 sm:px-3.5 sm:py-2.5 shadow-xs border border-slate-200/60 dark:border-slate-800 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                <span className="text-xs text-slate-700 dark:text-slate-200 font-medium animate-pulse">AI 客服正在為您整理精確回覆...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Questions (Horizontal Scroll Chips - No vertical squeezing or text cutting) */}
        {messages.length < 6 && (
          <div className="px-3 py-2 bg-slate-100/70 dark:bg-slate-950/70 border-t border-slate-200/60 dark:border-slate-800/60 shrink-0">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar touch-pan-x">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 shrink-0 flex items-center gap-1 pr-0.5">
                <Sparkles className="w-3 h-3 text-amber-500" /> 快捷:
              </span>
              {QUICK_QUESTIONS.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => handleQuickQuestion(q.text)}
                  className="whitespace-nowrap shrink-0 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:text-amber-600 dark:hover:text-[#FFD700] hover:bg-amber-50 dark:hover:bg-amber-500/10 px-2.5 py-1 rounded-full border border-slate-300/70 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer transition-colors shadow-2xs"
                >
                  {q.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat Input Footer */}
        <div className="p-2.5 sm:p-3 border-t border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
            className="flex items-center gap-1.5"
          >
            <input
              type="text"
              placeholder="請輸入關於 YouBike 的疑問（如費率、故障、找車）..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              className="flex-1 px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-slate-50 placeholder-slate-400 dark:placeholder-slate-500 transition-all"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-2 sm:p-2.5 rounded-xl bg-[#FFD700] hover:bg-[#ffdf1a] disabled:bg-slate-100 dark:disabled:bg-slate-800 text-slate-900 disabled:text-slate-400 transition-all shrink-0 cursor-pointer"
              aria-label="發送訊息"
            >
              <Send className="w-4 h-4 stroke-[2.2]" />
            </button>
          </form>
          <div className="flex items-center justify-between mt-1.5 text-[9px] sm:text-[10px] text-slate-400 px-0.5">
            <span>Powered by {selectedService === 'gemini' ? 'Google Gemini 3.6 Flash' : 'OpenAI GPT-OSS 20B'}</span>
            <span className="flex items-center gap-0.5">
              Enter 發送 <CornerDownLeft className="w-2.5 h-2.5" />
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
