/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useYouBike } from './hooks/useYouBike';
import Map from './components/Map';
import SearchFilters from './components/SearchFilters';
import StationList from './components/StationList';
import StationDetail from './components/StationDetail';
import AIConsultant from './components/AIConsultant';
import { FilterState, YouBikeStation, CityKey, CITIES } from './types';
import { 
  Sun, 
  Moon, 
  Bike, 
  RefreshCw, 
  Map as MapIcon, 
  List, 
  AlertTriangle,
  Info
} from 'lucide-react';

function YouBikeAppContent() {
  const userCoords = null;
  const [selectedCity, setSelectedCity] = useState<CityKey>('taipei');
  
  const { data, isLoading, isError, error, refetch, isFetching } = useYouBike(selectedCity, userCoords);

  // States
  const [filter, setFilter] = useState<FilterState>({
    searchQuery: '',
    sarea: '',
    status: 'all',
    sortBy: 'default',
  });
  const [selectedStation, setSelectedStation] = useState<YouBikeStation | null>(null);
  const [centerCoords, setCenterCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mobileTab, setMobileTab] = useState<'map' | 'list'>('map');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Dark Mode State
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('youbike-dark-mode');
      if (saved !== null) return saved === 'true';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Apply Dark Mode Class
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('youbike-dark-mode', String(darkMode));
  }, [darkMode]);

  // Show customized toasts
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Extract unique administrative areas
  const districts = useMemo(() => {
    if (!data) return [];
    const unique = new Set(data.map((s) => s.sarea).filter(Boolean));
    return Array.from(unique).sort();
  }, [data]);

  // Handle City Switcher
  const handleCityChange = (newCity: CityKey) => {
    if (newCity === selectedCity) return;
    setSelectedCity(newCity);
    setSelectedStation(null);
    const cityConfig = CITIES[newCity];
    setCenterCoords(cityConfig.defaultCenter);
    setFilter((prev) => ({
      ...prev,
      searchQuery: '',
      sarea: '', // Will be updated by districts effect once data loads
    }));
    showToast(`已切換至【${cityConfig.name}】YouBike 2.0 即時查詢`);
  };

  // Set default district once districts load for current city
  useEffect(() => {
    if (districts.length > 0) {
      const cityDefault = CITIES[selectedCity].defaultDistrict;
      if (!filter.sarea || !districts.includes(filter.sarea)) {
        const nextDistrict = districts.includes(cityDefault) ? cityDefault : districts[0];
        setFilter((prev) => ({ ...prev, sarea: nextDistrict }));
      }
    }
  }, [districts, selectedCity]);

  // Handle station selection from map or list
  const handleSelectStation = (station: YouBikeStation) => {
    setSelectedStation(station);
    if (mobileTab === 'list') {
      setTimeout(() => {
        const card = document.getElementById(`station-card-${station.sno}`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
    }
  };

  // Center map on a specific station
  const handleFocusStation = (station: YouBikeStation) => {
    setCenterCoords({ latitude: station.latitude, longitude: station.longitude });
    setSelectedStation(station);
    setMobileTab('map');
  };

  // Filter and sort YouBike stations
  const filteredStations = useMemo(() => {
    if (!data) return [];

    let result = data.filter((station) => {
      // 1. STRICT Filter by selected district (sarea)
      if (filter.sarea && station.sarea !== filter.sarea) return false;

      // 2. STRICT Rentable condition (must have available rentable bikes and be active)
      if (station.available_rent_bikes <= 0) return false;
      if (station.act !== '1') return false;

      // 3. Filter by search query (sna, ar) within selected district
      if (filter.searchQuery) {
        const query = filter.searchQuery.toLowerCase().trim();
        const matchName = station.sna.toLowerCase().includes(query);
        const matchAddress = station.ar.toLowerCase().includes(query);
        if (!matchName && !matchAddress) return false;
      }

      return true;
    });

    // 4. Sort results
    return result.sort((a, b) => {
      if (filter.sortBy === 'distance') {
        if (a.distance === undefined) return 1;
        if (b.distance === undefined) return -1;
        return a.distance - b.distance;
      }
      if (filter.sortBy === 'available_rent') {
        return b.available_rent_bikes - a.available_rent_bikes;
      }
      if (filter.sortBy === 'available_return') {
        return b.available_return_bikes - a.available_return_bikes;
      }
      return 0;
    });
  }, [data, filter]);

  // Aggregate stats of filtered results
  const stats = useMemo(() => {
    const totalCount = data?.length || 0;
    const activeCount = data?.filter(s => s.act === '1').length || 0;
    
    let filteredBikes = 0;
    let filteredSlots = 0;
    
    filteredStations.forEach(s => {
      if (s.act === '1') {
        filteredBikes += s.available_rent_bikes;
        filteredSlots += s.available_return_bikes;
      }
    });

    return {
      totalCount,
      activeCount,
      filteredBikes,
      filteredSlots,
    };
  }, [data, filteredStations]);

  const stationsInDistrict = useMemo(() => {
    if (!data || !filter.sarea) return [];
    return data.filter((s) => s.sarea === filter.sarea);
  }, [data, filter.sarea]);

  const currentCityConfig = CITIES[selectedCity];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300">
      
      {/* 1. Dynamic Notification Toast */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 dark:bg-white/95 text-white dark:text-slate-900 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 max-w-sm border border-slate-800 dark:border-slate-100 font-semibold text-xs backdrop-blur-md transition-all duration-300">
          <Info className="w-4 h-4 text-emerald-400 dark:text-emerald-600 animate-bounce" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 2. Navigation Header */}
      <nav className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/80 px-6 py-3 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#FFD700] rounded-xl flex items-center justify-center shadow-inner text-slate-800">
              <Bike className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-50 tracking-tight flex items-center gap-1.5">
                Jack的youbike小幫手
                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400">即時 Live</span>
              </h1>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                {currentCityConfig.name} YouBike 2.0 即時查詢與 AI 智慧諮詢
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Realtime API Data Status Indicator */}
            <button
              onClick={() => {
                refetch();
                showToast(`正在獲取最新 ${currentCityConfig.name} YouBike 站點資訊...`);
              }}
              disabled={isFetching}
              className="p-2.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 border border-slate-100 dark:border-slate-800 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline text-xs font-bold">同步資料</span>
            </button>

            {/* Dark Mode Switcher */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 border border-slate-100 dark:border-slate-800 transition-all cursor-pointer"
              aria-label="切換深色模式"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </nav>

      {/* 3. Main Dashboard Body */}
      <main className="max-w-7xl mx-auto p-4 md:py-6 space-y-4">
        
        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-full border-4 border-amber-400 border-t-transparent animate-spin mb-4"></div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
              正在下載【{currentCityConfig.name}】YouBike 2.0 即時車位資料...
            </h3>
            <p className="text-xs text-slate-400 mt-1">連線中，請稍候</p>
          </div>
        )}

        {/* Error Handling State */}
        {isError && (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-2xl bg-rose-50 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-900/40 max-w-xl mx-auto">
            <div className="p-4 rounded-full bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 mb-4">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-rose-800 dark:text-rose-400">
              {currentCityConfig.name} YouBike 伺服器連線失敗
            </h3>
            <p className="text-xs text-rose-500/80 mt-1">
              {error instanceof Error ? error.message : `無法讀取${currentCityConfig.name}站點即時 JSON 資料，請檢查網路狀態。`}
            </p>
            <button
              onClick={() => refetch()}
              className="mt-5 px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
            >
              重新整理 API 資料
            </button>
          </div>
        )}

        {!isLoading && !isError && data && (
          <div className="space-y-4">
            
            {/* Quick Overview Real-time Statistics Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3.5 rounded-2xl shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">目前營運站數</span>
                <span className="text-xl font-black font-mono text-slate-800 dark:text-slate-50 mt-1 block">
                  {stats.activeCount} <span className="text-xs text-slate-400 font-sans">/ {stats.totalCount} 站</span>
                </span>
              </div>
              
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3.5 rounded-2xl shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">篩選後總車數</span>
                <span className="text-xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-1 block">
                  {stats.filteredBikes.toLocaleString()} <span className="text-xs text-emerald-400/80 font-sans">輛可用</span>
                </span>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3.5 rounded-2xl shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">篩選後可還位</span>
                <span className="text-xl font-black font-mono text-blue-600 dark:text-blue-400 mt-1 block">
                  {stats.filteredSlots.toLocaleString()} <span className="text-xs text-blue-400/80 font-sans">個空位</span>
                </span>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3.5 rounded-2xl shadow-xs">
                <span className="text-[10px] font-bold text-amber-500 dark:text-amber-400 uppercase tracking-wider block">篩選資訊說明</span>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1 block leading-relaxed">
                  已自動過濾無車可借或暫停營運之站點。
                </span>
              </div>
            </div>

            {/* Search Filters Panel */}
            <SearchFilters
              filter={filter}
              setFilter={setFilter}
              districts={districts}
              totalCount={data.length}
              filteredCount={filteredStations.length}
              selectedCity={selectedCity}
              onCityChange={handleCityChange}
            />

            {/* Mobile Tab Control switcher */}
            <div className="flex md:hidden bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-1 rounded-xl shadow-xs">
              <button
                onClick={() => setMobileTab('map')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  mobileTab === 'map'
                    ? 'bg-emerald-500 text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <MapIcon className="w-4 h-4" />
                地圖模式
              </button>
              <button
                onClick={() => setMobileTab('list')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  mobileTab === 'list'
                    ? 'bg-emerald-500 text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <List className="w-4 h-4" />
                列表模式 ({filteredStations.length})
              </button>
            </div>

            {/* Main Content Layout Block: List side-by-side with Map on Desktop */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 h-[calc(100vh-270px)] md:h-[620px]">
              
              {/* Station List Column */}
              <div
                className={`md:col-span-4 flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-y-auto ${
                  mobileTab === 'list' ? 'block' : 'hidden md:block'
                }`}
              >
                <StationList
                  stations={filteredStations}
                  selectedStation={selectedStation}
                  onSelectStation={handleSelectStation}
                  onFocusStation={handleFocusStation}
                  userCoords={userCoords}
                />
              </div>

              {/* Map Column */}
              <div
                className={`relative md:col-span-8 h-full min-h-[380px] md:min-h-0 ${
                  mobileTab === 'map' ? 'block' : 'hidden md:block'
                }`}
              >
                <Map
                  stations={filteredStations}
                  selectedStation={selectedStation}
                  onSelectStation={handleSelectStation}
                  userCoords={userCoords}
                  centerCoords={centerCoords}
                />

                {/* Station Detail Drawer sliding overlay */}
                <StationDetail
                  station={selectedStation}
                  onClose={() => setSelectedStation(null)}
                  onFocusStation={handleFocusStation}
                />
              </div>

            </div>

          </div>
        )}

      </main>

      <AIConsultant
        currentCityName={currentCityConfig.name}
        currentDistrict={filter.sarea}
        selectedStation={selectedStation}
        stationsInDistrict={stationsInDistrict}
      />

      {/* 4. Footer */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800/80 py-4 px-6 text-[11px] text-slate-500 dark:text-slate-400 mt-auto shrink-0 transition-colors">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center gap-4">
            <span>更新頻率：每 30 秒自動更新 (TanStack Query)</span>
            <span className="flex items-center gap-1.5 justify-center">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              {currentCityConfig.name} API 連線正常
            </span>
          </div>
          <div className="flex items-center justify-center gap-4">
            <span>{currentCityConfig.sourceLabel} YouBike 公開資料</span>
            <div className="flex items-center gap-1">
              <div className="w-5 h-5 rounded bg-[#FFD700] flex items-center justify-center text-[9px] font-black text-slate-800 shadow-inner">2.0</div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

const queryClientInstance = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <YouBikeAppContent />
    </QueryClientProvider>
  );
}
