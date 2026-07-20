/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';

export interface Coords {
  latitude: number;
  longitude: number;
}

export function useGeolocation() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Default to Taipei Main Station area if geolocation is not available/granted
  const TAIPEI_CENTER = { latitude: 25.0478, longitude: 121.5170 };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setError('此瀏覽器不支援定位功能');
      setCoords(TAIPEI_CENTER);
      setLoading(false);
      return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setError(null);
        setLoading(false);
      },
      (err) => {
        let msg = '無法取得您的定位';
        switch (err.code) {
          case err.PERMISSION_DENIED:
            msg = '定位權限被拒絕，已預設為台北車站';
            break;
          case err.POSITION_UNAVAILABLE:
            msg = '無法偵測您的位置，已預設為台北車站';
            break;
          case err.TIMEOUT:
            msg = '定位逾時，已預設為台北車站';
            break;
        }
        setError(msg);
        setCoords(TAIPEI_CENTER);
        setLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0,
      }
    );
  };

  useEffect(() => {
    requestLocation();
  }, []);

  return { coords, error, loading, refetchLocation: requestLocation };
}
