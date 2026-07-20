/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useQuery } from '@tanstack/react-query';
import { YouBikeStation } from '../types';

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

const API_URL = 'https://tcgbusfs.blob.core.windows.net/dotapp/youbike/v2/youbike_immediate.json';

export function useYouBike(userCoords: { latitude: number; longitude: number } | null) {
  return useQuery<YouBikeStation[]>({
    queryKey: ['youbike'],
    queryFn: async () => {
      const response = await fetch(API_URL);
      if (!response.ok) {
        throw new Error('無法取得 YouBike 即時資料');
      }
      const data = await response.json();
      
      // Ensure data is array and transform numeric fields
      if (!Array.isArray(data)) {
        throw new Error('API 回傳格式錯誤');
      }

      return data.map((item: any) => {
        const lat = parseFloat(item.latitude);
        const lng = parseFloat(item.longitude);
        
        let dist: number | undefined;
        if (userCoords) {
          dist = calculateDistance(userCoords.latitude, userCoords.longitude, lat, lng);
        }

        return {
          sno: item.sno,
          sna: cleanStationName(item.sna),
          sarea: item.sarea,
          ar: item.ar,
          latitude: lat,
          longitude: lng,
          available_rent_bikes: parseInt(item.available_rent_bikes, 10) || 0,
          available_return_bikes: parseInt(item.available_return_bikes, 10) || 0,
          total: parseInt(item.total, 10) || parseInt(item.Quantity, 10) || 0,
          act: item.act,
          mday: item.mday || item.updateTime || '',
          distance: dist,
        };
      });
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 15000,       // Consider data stale after 15 seconds
  });
}
