/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { X, Navigation, Map, Compass, RefreshCw } from 'lucide-react';
import { YouBikeStation } from '../types';

interface StationDetailProps {
  station: YouBikeStation | null;
  onClose: () => void;
  onFocusStation: (station: YouBikeStation) => void;
}

export default function StationDetail({
  station,
  onClose,
  onFocusStation,
}: StationDetailProps) {
  if (!station) return null;

  const isSuspended = station.act !== '1';
  const rentCount = station.available_rent_bikes;
  const returnCount = station.available_return_bikes;
  const totalSlots = station.total;

  // Format update time from YYYYMMDDHHMMSS to YYYY/MM/DD HH:MM:SS
  const formatUpdateTime = (mdayStr: string) => {
    if (!mdayStr || mdayStr.length < 14) return mdayStr;
    const year = mdayStr.substring(0, 4);
    const month = mdayStr.substring(4, 6);
    const day = mdayStr.substring(6, 8);
    const hour = mdayStr.substring(8, 10);
    const minute = mdayStr.substring(10, 12);
    const second = mdayStr.substring(12, 14);
    return `${year}/${month}/${day} ${hour}:${minute}:${second}`;
  };

  // Format distance cleanly
  const formatDistance = (meters?: number) => {
    if (meters === undefined) return null;
    if (meters < 1000) {
      return `${Math.round(meters)} 公尺`;
    }
    return `${(meters / 1000).toFixed(1)} 公里`;
  };

  return (
    <>
      {/* Mobile Backdrop Blur Overlay */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40 md:hidden transition-opacity duration-300"
        onClick={onClose}
      />

      <div className="fixed bottom-0 left-0 right-0 md:absolute md:bottom-4 md:left-4 md:right-auto md:w-96 z-50 p-3 sm:p-4 md:p-0 transition-transform duration-300 transform translate-y-0 max-h-[90vh]">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-3xl md:rounded-3xl shadow-2xl p-4 sm:p-5 space-y-3.5 sm:space-y-4 relative overflow-hidden max-h-[85vh] overflow-y-auto no-scrollbar">
          {/* Mobile Sheet Handle Indicator */}
          <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto md:hidden -mt-1 mb-1"></div>

          {/* Decorative Top Accent Bar */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#FFD700]"></div>

          {/* 1. Header with Name & Close Button */}
          <div className="flex items-start justify-between gap-3 pt-1">
            <div>
              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  {station.sarea}
                </span>
                {station.distance !== undefined && (
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded flex items-center gap-0.5">
                    <Navigation className="w-2.5 h-2.5 rotate-45 fill-current" />
                    {formatDistance(station.distance)}
                  </span>
                )}
                {isSuspended ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500 text-white animate-pulse">
                    暫停營運
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    正常營運
                  </span>
                )}
              </div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-50">{station.sna}</h3>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors self-start cursor-pointer"
              aria-label="關閉"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 2. Detailed Info Block */}
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">詳細地址</span>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
              {station.ar}
            </p>
          </div>

          {/* 3. Availability Stats Grid */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            {/* Rent Box */}
            <div className="flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl border border-emerald-100/30 dark:border-emerald-500/10 bg-emerald-50/50 dark:bg-emerald-500/5 text-center">
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mb-0.5">
                <span className="text-xs">🚲</span> 可借
              </span>
              <span className="text-xl sm:text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                {isSuspended ? '-' : rentCount}
              </span>
            </div>

            {/* Return Box */}
            <div className="flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl border border-blue-100/30 dark:border-blue-500/10 bg-blue-50/50 dark:bg-blue-500/5 text-center">
              <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1 mb-0.5">
                <span>🅿️</span> 可還
              </span>
              <span className="text-xl sm:text-2xl font-black font-mono text-blue-600 dark:text-blue-400">
                {isSuspended ? '-' : returnCount}
              </span>
            </div>

            {/* Total Box */}
            <div className="flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-center">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-0.5">
                <span>📊</span> 總車位
              </span>
              <span className="text-xl sm:text-2xl font-black font-mono text-slate-700 dark:text-slate-300">
                {totalSlots}
              </span>
            </div>
          </div>

          {/* Visual Occupancy Bar */}
          {!isSuspended && totalSlots > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                <span>車輛佔用比例</span>
                <span>{Math.round((rentCount / totalSlots) * 100)}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${(rentCount / totalSlots) * 100}%` }}
                ></div>
                <div
                  className="h-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${(returnCount / totalSlots) * 100}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* 4. Action CTA Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={() => onFocusStation(station)}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-all cursor-pointer"
            >
              <Map className="w-4 h-4" />
              地圖置中
            </button>
            
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 py-2.5 px-3.5 rounded-xl text-xs font-bold text-slate-900 bg-[#FFD700] hover:bg-[#ffdf1a] shadow-md shadow-amber-500/10 transition-all text-center"
            >
              <Compass className="w-4 h-4 animate-spin-slow" />
              導航到此
            </a>
          </div>

          {/* 5. Footer Update Time */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-500">
            <span className="flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin-slow" />
              每 30 秒自動更新
            </span>
            <span>更新時間: {formatUpdateTime(station.mday)}</span>
          </div>
        </div>
      </div>
    </>
  );
}
