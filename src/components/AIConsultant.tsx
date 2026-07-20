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
  currentDistrict: string;
  selectedStation: YouBikeStation | null;
  stationsInDistrict: YouBikeStation[];
}

const QUICK_QUESTIONS = [
  { text: '🚲 推薦目前區域最充足的站點？', tag: 'recommend' },
  { text: '💰 YouBike 2.0 租借費率怎麼算？', tag: 'rate' },
  { text: '🌧️ 下雨天騎車有哪些注意事項？', tag: 'safety' },
  { text: '🔑 電子票證（悠遊卡）如何註冊？', tag: 'easycard' },
];

export default function AIConsultant({ currentDistrict, selectedStation, stationsInDistrict }: AIConsultantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: '您好！我是 **Jack的youbike小幫手** 專屬 AI 諮詢專員 🚲✨\n\n我可以協助您：\n- 查詢目前區域（如：**' + (currentDistrict || '未選取行政區') + '**）有哪些車輛充足的推薦站點\n- 計算租借費率與市府最新的 30 分鐘補助說明\n- 提供騎乘安全指引、失物招領、註冊教學等諮詢服務\n\n有什麼我可以幫您的嗎？您可以直接輸入問題，或點選下方的快捷問題喔！',
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Update welcome message if district changes
  useEffect(() => {
    if (messages.length === 1 && messages[0].id === 'welcome') {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          text: `您好！我是 **Jack的youbike小幫手** 專屬 AI 諮詢專員 🚲✨\n\n我可以協助您：\n- 查詢目前區域（如：**${currentDistrict || '未選取行政區'}**）有哪些車輛充足的推薦站點\n- 計算租借費率與市府最新的 30 分鐘補助說明\n- 提供騎乘安全指引、失物招領、註冊教學等諮詢服務\n\n有什麼我可以幫您的嗎？您可以直接輸入問題，或點選下方的快捷問題喔！`,
          timestamp: new Date(),
        }
      ]);
    }
  }, [currentDistrict]);

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
      // Get top 5 stations in the district with most available bikes as stats
      const topStations = [...stationsInDistrict]
        .filter(s => s.available_rent_bikes > 0 && s.act === '1')
        .sort((a, b) => b.available_rent_bikes - a.available_rent_bikes)
        .slice(0, 5)
        .map(s => ({
          sna: s.sna,
          sarea: s.sarea,
          ar: s.ar,
          available_rent_bikes: s.available_rent_bikes,
          available_return_bikes: s.available_return_bikes,
          total: s.total,
        }));

      const historyPayload = messages.slice(1).map(msg => ({
        role: msg.role,
        text: msg.text
      }));

      const response = await fetch('/api/ai/consult', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userPrompt: textToSend,
          history: historyPayload,
          sarea: currentDistrict,
          selectedStation: selectedStation ? {
            sna: selectedStation.sna,
            sarea: selectedStation.sarea,
            ar: selectedStation.ar,
            available_rent_bikes: selectedStation.available_rent_bikes,
            available_return_bikes: selectedStation.available_return_bikes,
            total: selectedStation.total,
            act: selectedStation.act
          } : null,
          stationStats: topStations,
        }),
      });

      if (!response.ok) {
        throw new Error('AI 專員暫時忙碌中，請稍後再試。');
      }

      const data = await response.json();
      
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
        text: `⚠️ **連線錯誤**\n\n抱歉，與 AI 專員的連線不順暢 (${error.message || '請確認 API 金鑰已設定'})。您可以嘗試重新點選，或直接再次送出您的問題。`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickQuestion = (questionText: string) => {
    // Replace placeholder with actual current district name if needed
    let processedText = questionText;
    if (questionText.includes('目前區域') && currentDistrict) {
      processedText = questionText.replace('目前區域', currentDistrict);
    }
    handleSend(processedText);
  };

  const handleResetChat = () => {
    if (window.confirm('確定要清空對話紀錄並重置 AI 專員嗎？')) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          text: `對話已重置！我是您的 **台北 YouBike 2.0 智慧 AI 諮詢專員** 🚲✨\n\n目前您瀏覽的是 **${currentDistrict || '所有行政區'}**，請問今天有什麼我可以協助您的嗎？`,
          timestamp: new Date(),
        }
      ]);
    }
  };

  // Helper to format text with simple markdown (bold and lists)
  const renderMessageText = (text: string) => {
    return text.split('\n').map((line, idx) => {
      // Bold rendering **text**
      let parts: React.ReactNode[] = [];
      let lastIndex = 0;
      const regex = /\*\*(.*?)\*\*/g;
      let match;

      while ((match = regex.exec(line)) !== null) {
        const textBefore = line.substring(lastIndex, match.index);
        const boldText = match[1];
        if (textBefore) parts.push(textBefore);
        parts.push(<strong key={match.index} className="font-bold text-slate-900 dark:text-white">{boldText}</strong>);
        lastIndex = regex.lastIndex;
      }
      
      const textAfter = line.substring(lastIndex);
      if (textAfter) parts.push(textAfter);

      const finalContent = parts.length > 0 ? parts : line;

      // Unordered lists
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        const content = line.trim().substring(2);
        return (
          <li key={idx} className="list-disc list-inside ml-2 my-1 text-slate-700 dark:text-slate-300">
            {parts.length > 0 ? parts : content}
          </li>
        );
      }

      // Ordered lists (e.g. 1. )
      const orderedMatch = line.trim().match(/^(\d+)\.\s(.*)/);
      if (orderedMatch) {
        return (
          <div key={idx} className="flex gap-1 my-1 pl-1 text-slate-700 dark:text-slate-300">
            <span className="font-bold text-amber-500 shrink-0">{orderedMatch[1]}.</span>
            <span>{parts.length > 0 ? parts : orderedMatch[2]}</span>
          </div>
        );
      }

      return (
        <p key={idx} className={`min-h-[1.25rem] leading-relaxed text-slate-700 dark:text-slate-300 ${line.trim() === '' ? 'h-3' : 'my-1'}`}>
          {finalContent}
        </p>
      );
    });
  };

  return (
    <>
      {/* 1. Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3.5 rounded-full shadow-2xl transition-all duration-300 transform active:scale-95 ${
          isOpen
            ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 scale-90'
            : 'bg-[#FFD700] hover:bg-[#ffdf1a] text-slate-900 font-bold hover:shadow-amber-500/20 scale-100'
        }`}
        id="ai-consultant-trigger"
      >
        {isOpen ? (
          <>
            <X className="w-5 h-5" />
            <span className="text-xs font-bold">關閉諮詢</span>
          </>
        ) : (
          <>
            <div className="relative">
              <MessageSquare className="w-5 h-5 fill-current" />
              <span className="absolute -top-1.5 -right-1.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
            </div>
            <span className="text-sm font-black tracking-tight">AI 即時諮詢</span>
            <div className="bg-slate-900/10 dark:bg-white/10 px-1.5 py-0.5 rounded text-[10px] font-extrabold flex items-center gap-0.5">
              <Sparkles className="w-2.5 h-2.5 animate-pulse text-amber-600" />
              Live
            </div>
          </>
        )}
      </button>

      {/* 2. Chat Window Panel */}
      <div
        className={`fixed inset-x-4 bottom-24 md:inset-x-auto md:right-6 md:bottom-24 md:w-96 z-40 bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden transition-all duration-300 transform origin-bottom-right ${
          isOpen ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-12 opacity-0 pointer-events-none scale-95'
        }`}
        style={{ height: 'min(580px, calc(100vh - 130px))' }}
      >
        {/* Chat Header */}
        <div className="bg-slate-900 dark:bg-slate-950 p-4 text-white relative">
          {/* Top Yellow Accent Bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#FFD700]"></div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#FFD700] flex items-center justify-center text-slate-900 shadow-md">
                <Bot className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <h3 className="font-bold text-sm flex items-center gap-1.5">
                  Jack的小幫手 AI 專員
                  <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">連線中</span>
                </h3>
                <p className="text-[10px] text-slate-400 font-medium">即時站點推薦與票務費率諮詢</p>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <button
                onClick={handleResetChat}
                title="清空對話"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors md:hidden"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Context Banner */}
          <div className="mt-2.5 bg-white/5 dark:bg-white/5 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2 text-[10px] text-slate-300">
            <span className="truncate">
              📍 當前行政區：<strong className="text-[#FFD700]">{currentDistrict || '未選取'}</strong>
              {selectedStation && (
                <>
                  {' / '} 選中站點：<strong className="text-white">{selectedStation.sna}</strong>
                </>
              )}
            </span>
            <span className="shrink-0 text-[9px] bg-slate-800 text-slate-400 px-1 py-0.5 rounded">
              {stationsInDistrict.length} 站可借
            </span>
          </div>
        </div>

        {/* Chat Body */}
        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-slate-950/40"
        >
          {messages.map((msg) => {
            const isAssistant = msg.role === 'assistant';
            return (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${isAssistant ? 'justify-start' : 'justify-end'}`}
              >
                {isAssistant && (
                  <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200/50 dark:border-slate-700/50">
                    <Bot className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  </div>
                )}
                
                <div
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-xs shadow-xs leading-relaxed ${
                    isAssistant
                      ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200/40 dark:border-slate-800/60 rounded-tl-none'
                      : 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 rounded-tr-none font-medium'
                  }`}
                >
                  <div className="space-y-1">
                    {renderMessageText(msg.text)}
                  </div>
                  <span
                    className={`block text-[9px] mt-1 text-right ${
                      isAssistant ? 'text-slate-400' : 'text-white/60'
                    }`}
                  >
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {!isAssistant && (
                  <div className="w-7 h-7 rounded-lg bg-slate-800 dark:bg-slate-100 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-white dark:text-slate-900" />
                  </div>
                )}
              </div>
            );
          })}

          {/* Typing state */}
          {isLoading && (
            <div className="flex gap-2.5 justify-start">
              <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200/50 dark:border-slate-700/50 animate-pulse">
                <Bot className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-2xl rounded-tl-none px-3.5 py-3 shadow-xs border border-slate-200/40 dark:border-slate-800/60 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold animate-pulse">AI 專員正在整合即時車輛狀態...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Questions list */}
        {messages.length < 5 && (
          <div className="px-4 py-2 bg-slate-50/50 dark:bg-slate-950/40 border-t border-slate-100 dark:border-slate-800/40">
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1.5">常用快捷諮詢</span>
            <div className="flex flex-col gap-1.5 max-h-24 overflow-y-auto pr-1">
              {QUICK_QUESTIONS.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => handleQuickQuestion(q.text)}
                  className="text-left text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:text-amber-600 dark:hover:text-[#FFD700] hover:bg-amber-50/30 dark:hover:bg-amber-500/5 px-2.5 py-1.5 rounded-lg border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-900 cursor-pointer transition-all truncate"
                >
                  {q.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat Input Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800/60 bg-white dark:bg-slate-900">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
            className="flex items-center gap-1.5"
          >
            <input
              type="text"
              placeholder="請輸入關於 YouBike 2.0 的疑問..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:bg-white dark:focus:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 transition-all"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-2.5 rounded-xl bg-[#FFD700] hover:bg-[#ffdf1a] disabled:bg-slate-100 dark:disabled:bg-slate-800 text-slate-900 disabled:text-slate-400 transition-all shrink-0 cursor-pointer"
            >
              <Send className="w-4 h-4 stroke-[2.2]" />
            </button>
          </form>
          <div className="flex items-center justify-between mt-2 text-[9px] text-slate-400 px-1">
            <span>Powered by Gemini 3.5 Flash</span>
            <span className="flex items-center gap-0.5">
              回車鍵傳送 <CornerDownLeft className="w-2.5 h-2.5" />
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
