/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Search, MapPin, ListFilter, ArrowUpDown, X, Building2 } from 'lucide-react';
import { FilterState, CityKey, CITIES } from '../types';

interface SearchFiltersProps {
  filter: FilterState;
  setFilter: (filter: FilterState | ((prev: FilterState) => FilterState)) => void;
  districts: string[];
  totalCount: number;
  filteredCount: number;
  selectedCity: CityKey;
  onCityChange: (city: CityKey) => void;
}

export default function SearchFilters({
  filter,
  setFilter,
  districts,
  totalCount,
  filteredCount,
  selectedCity,
  onCityChange,
}: SearchFiltersProps) {
  
  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilter((prev) => ({ ...prev, searchQuery: e.target.value }));
  };

  const handleDistrictChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilter((prev) => ({ ...prev, sarea: e.target.value }));
  };

  const handleSortChange = (sortBy: FilterState['sortBy']) => {
    setFilter((prev) => ({ ...prev, sortBy }));
  };

  const clearFilters = () => {
    setFilter((prev) => ({
      ...prev,
      searchQuery: '',
      status: 'all',
      sortBy: 'default',
    }));
  };

  const isFiltered = !!filter.searchQuery || filter.sortBy !== 'default';

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-4 space-y-4">
      {/* 0. City Selector Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800/60">
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0 flex items-center gap-1.5">
          <Building2 className="w-4 h-4 text-amber-500" />
          切換查詢縣市：
        </span>
        <div className="flex items-center gap-2 overflow-x-auto py-0.5">
          {(Object.keys(CITIES) as CityKey[]).map((cityKey) => {
            const city = CITIES[cityKey];
            const isActive = selectedCity === cityKey;
            return (
              <button
                key={cityKey}
                onClick={() => onCityChange(cityKey)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  isActive
                    ? 'bg-[#FFD700] text-slate-900 shadow-md ring-2 ring-amber-400/60 font-black'
                    : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/80'
                }`}
              >
                {city.name} YouBike 2.0
              </button>
            );
          })}
        </div>
      </div>

      {/* 1. Search Bar and District Dropdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            id="search-station-input"
            type="text"
            placeholder="搜尋站點名稱、地址或區域..."
            value={filter.searchQuery}
            onChange={handleQueryChange}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 text-sm font-medium transition-all text-slate-800 dark:text-slate-100 placeholder-slate-400"
          />
          {filter.searchQuery && (
            <button
              onClick={() => setFilter((prev) => ({ ...prev, searchQuery: '' }))}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="relative">
          <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500 pointer-events-none" />
          <select
            id="district-select"
            value={filter.sarea}
            onChange={handleDistrictChange}
            className="w-full pl-10 pr-8 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 text-sm font-bold transition-all text-amber-600 dark:text-amber-400 appearance-none cursor-pointer"
          >
            <option value="" disabled>📍 請選擇行政區 ({districts.length})</option>
            {districts.map((area) => (
              <option key={area} value={area} className="text-slate-800 dark:text-slate-100">
                {area}
              </option>
            ))}
          </select>
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-400 w-0 h-0"></div>
        </div>
      </div>

      {/* 2. Quick Status Filters & Sorting */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-slate-100 dark:border-slate-800/60">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mr-1">
            <ListFilter className="w-3.5 h-3.5" />
            狀態模式:
          </span>
          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-500/20 shadow-xs flex items-center gap-1">
            🚲 僅顯示「可租借站點」
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <ArrowUpDown className="w-3.5 h-3.5" />
            排序方式:
          </span>
          <select
            id="sort-by-select"
            value={filter.sortBy}
            onChange={(e) => handleSortChange(e.target.value as FilterState['sortBy'])}
            className="pl-3 pr-6 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-semibold transition-all text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-yellow-400 appearance-none cursor-pointer"
          >
            <option value="default">預設排序</option>
            <option value="available_rent">可借車輛 🚲</option>
            <option value="available_return">空位剩餘 🅿️</option>
          </select>
        </div>
      </div>

      {/* 3. Filter Stats */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <div>
          搜尋結果：<span className="font-bold text-slate-800 dark:text-slate-200">{filteredCount}</span> 站 / 共 {totalCount} 站
        </div>
        {isFiltered && (
          <button
            onClick={clearFilters}
            className="text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 font-medium flex items-center gap-1 transition-all"
          >
            <X className="w-3 h-3" />
            重設篩選條件
          </button>
        )}
      </div>
    </div>
  );
}
