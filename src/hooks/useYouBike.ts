/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useQuery } from '@tanstack/react-query';
import { YouBikeStation, CityKey, CITIES } from '../types';

// Helper to calculate distance in meters between two coordinates using Haversine formula
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

// Clean up the YouBike station name by removing prefix (e.g., "YouBike2.0_")
export function cleanStationName(name: string): string {
  return name.replace(/^YouBike2\.0_/i, '').trim();
}

// Fetch helper with timeout
async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err: any) {
    clearTimeout(id);
    if (err.name === 'AbortError') {
      throw new Error('伺服器回應超時 (Timeout)，請稍後再試');
    }
    throw err;
  }
}

export function useYouBike(
  city: CityKey = 'taipei',
  userCoords: { latitude: number; longitude: number } | null = null
) {
  const cityConfig = CITIES[city] || CITIES.taipei;

  return useQuery<YouBikeStation[]>({
    queryKey: ['youbike', city],
    queryFn: async () => {
      let response: Response;
      try {
        response = await fetchWithTimeout(cityConfig.apiUrl, 10000);
      } catch (err: any) {
        throw new Error(`${cityConfig.name}資料暫時無法取得 (${err.message || '網路連線失敗'})`);
      }

      const json = await response.json();

      if (!response.ok || (json && json.error)) {
        const errorDetail = json?.error || `HTTP ${response.status}`;
        throw new Error(`${cityConfig.name}資料暫時無法取得 (${errorDetail})`);
      }
      
      // Extract array based on API structure
      let data: any[] = [];
      if (Array.isArray(json)) {
        data = json;
      } else if (json && typeof json === 'object') {
        if (Array.isArray(json.data?.retVal)) {
          data = json.data.retVal;
        } else if (Array.isArray(json.retVal)) {
          data = json.retVal;
        } else if (Array.isArray(json.data)) {
          data = json.data;
        }
      }

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error(`${cityConfig.name}資料暫時無法取得 (開放資料平台回傳無站點資訊)`);
      }

      return data.map((item: any) => {
        const lat = parseFloat(item.latitude ?? item.lat);
        const lng = parseFloat(item.longitude ?? item.lng);
        
        let dist: number | undefined;
        if (userCoords && !isNaN(lat) && !isNaN(lng)) {
          dist = calculateDistance(userCoords.latitude, userCoords.longitude, lat, lng);
        }

        const availableRent = parseInt(item.available_rent_bikes ?? item.sbi, 10) || 0;
        const availableReturn = parseInt(item.available_return_bikes ?? item.bemp, 10) || 0;
        const total = parseInt(item.total ?? item.tot ?? item.Quantity, 10) || 0;
        const actStatus = item.act !== undefined ? String(item.act) : '1';

        return {
          sno: String(item.sno || ''),
          sna: cleanStationName(item.sna || ''),
          sarea: item.sarea || '',
          ar: item.ar || '',
          latitude: isNaN(lat) ? 0 : lat,
          longitude: isNaN(lng) ? 0 : lng,
          available_rent_bikes: availableRent,
          available_return_bikes: availableReturn,
          total: total,
          act: actStatus,
          mday: item.mday || item.updateTime || '',
          distance: dist,
        };
      });
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 15000,       // Consider data stale after 15 seconds
  });
}

