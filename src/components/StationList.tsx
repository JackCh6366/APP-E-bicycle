/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo } from 'react';
import { Map, Navigation, ArrowUpRight, Bike, Compass } from 'lucide-react';
import { YouBikeStation } from '../types';

interface StationListProps {
  stations: YouBikeStation[];
  selectedStation: YouBikeStation | null;
  onSelectStation: (station: YouBikeStation) => void;
  onFocusStation: (station: YouBikeStation) => void;
  userCoords: { latitude: number; longitude: number } | null;
}

export default function StationList({
  stations,
  selectedStation,
  onSelectStation,
  onFocusStation,
  userCoords,
}: StationListProps) {
  const [displayCount, setDisplayCount] = useState<number>(40);

  // Reset display count when the query or station list changes
  useMemo(() => {
    setDisplayCount(40);
  }, [stations]);

  const visibleStations = useMemo(() => {
    return stations.slice(0, displayCount);
  }, [stations, displayCount]);

  // Format distance cleanly
  const formatDistance = (meters?: number) => {
    if (meters === undefined) return null;
    if (meters < 1000) {
      return `${Math.round(meters)} 公尺`;
    }
    return `${(meters / 1000).toFixed(1)} 公里`;
  };

  const handleShowMore = () => {
    setDisplayCount((prev) => prev + 40);
  };

  return (
    <div className="flex flex-col h-full bg-transparent">
      {stations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-xs">
          <div className="p-4 rounded-full bg-slate-50 dark:bg-slate-950 mb-3 text-slate-400">
            <Compass className="w-8 h-8 stroke-[1.5]" />
          </div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">找不到相符的 YouBike 站點</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-[240px]">
            請嘗試更換關鍵字、選擇其他行政區，或調整篩選條件。
          </p>
        </div>
      ) : (
        <div className="space-y-2.5 pb-6">
          <div className="grid grid-cols-1 gap-2.5">
            {visibleStations.map((station) => {
              const isSelected = selectedStation?.sno === station.sno;
              const isSuspended = station.act !== '1';
              const rentCount = station.available_rent_bikes;
              const returnCount = station.available_return_bikes;
              
              // Dynamic bg color for availability meters
              const rentBgClass = rentCount === 0 
                ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200/50 dark:border-rose-500/10' 
                : rentCount <= 3 
                  ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-500/10'
                  : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-500/10';

              const returnBgClass = returnCount === 0
                ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200/50 dark:border-rose-500/10'
                : 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-500/10';

              return (
                <div
                  key={station.sno}
                  id={`station-card-${station.sno}`}
                  onClick={() => onSelectStation(station)}
                  className={`group relative flex flex-col p-4 rounded-xl border transition-all duration-200 cursor-pointer text-left ${
                    isSelected
                      ? 'bg-amber-50/40 dark:bg-amber-950/10 border-amber-400 shadow-md shadow-amber-400/5'
                      : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-amber-200 dark:hover:border-amber-800/50 hover:bg-amber-50/20 dark:hover:bg-amber-950/5 hover:shadow-xs'
                  }`}
                >
                  {/* Left accent bar for selected item */}
                  {isSelected && (
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#FFD700] rounded-l-xl"></div>
                  )}

                  {/* Top: Station name and administrative area */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                          {station.sarea}
                        </span>
                        {station.distance !== undefined && (
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/15 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                            <Navigation className="w-2.5 h-2.5 rotate-45 fill-current" />
                            {formatDistance(station.distance)}
                          </span>
                        )}
                        {isSuspended && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500 text-white animate-pulse">
                            暫停營運
                          </span>
                        )}
                      </div>
                      <h4 className="text-[15px] font-bold text-slate-800 dark:text-slate-200 mt-1.5 group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors">
                        {station.sna}
                      </h4>
                    </div>

                    {/* Actions panel */}
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        title="在地图上查看"
                        onClick={(e) => {
                          e.stopPropagation();
                          onFocusStation(station);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-all border border-transparent hover:border-amber-200/30"
                      >
                        <Map className="w-4 h-4" />
                      </button>
                      <a
                        title="開啟 Google 地圖導航"
                        href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all border border-transparent hover:border-blue-200/30"
                      >
                        <ArrowUpRight className="w-4 h-4" />
                      </a>
                    </div>
                  </div>

                  {/* Mid: Address */}
                  <p className="text-xs text-slate-400 mt-1 line-clamp-1">
                    {station.ar}
                  </p>

                  {/* Bottom: Availability Numbers */}
                  <div className="grid grid-cols-2 gap-2 mt-3.5 pt-3 border-t border-slate-100/60 dark:border-slate-800/60">
                    <div className={`flex items-center justify-between px-3 py-2 rounded-xl transition-all ${rentBgClass}`}>
                      <div className="flex items-center gap-1.5">
                        <Bike className="w-3.5 h-3.5" />
                        <span className="text-[11px] font-semibold">可借車輛</span>
                      </div>
                      <span className="text-sm font-black font-mono">
                        {isSuspended ? '-' : rentCount}
                      </span>
                    </div>

                    <div className={`flex items-center justify-between px-3 py-2 rounded-xl transition-all ${returnBgClass}`}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">🅿️</span>
                        <span className="text-[11px] font-semibold">可還空位</span>
                      </div>
                      <span className="text-sm font-black font-mono">
                        {isSuspended ? '-' : returnCount}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {stations.length > displayCount && (
            <div className="pt-2 text-center">
              <button
                onClick={handleShowMore}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200/55 dark:border-slate-800 transition-all active:scale-98"
              >
                載入更多站點 ({stations.length - displayCount} 站)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
