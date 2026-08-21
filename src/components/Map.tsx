/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { YouBikeStation } from '../types';

interface MapProps {
  stations: YouBikeStation[];
  selectedStation: YouBikeStation | null;
  onSelectStation: (station: YouBikeStation) => void;
  userCoords: { latitude: number; longitude: number } | null;
  centerCoords: { latitude: number; longitude: number } | null;
}

export default function Map({
  stations,
  selectedStation,
  onSelectStation,
  userCoords,
  centerCoords,
}: MapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);

  // 1. Initialize Map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Use default coordinates if none provided
    const initialLat = centerCoords?.latitude || userCoords?.latitude || 25.0478;
    const initialLng = centerCoords?.longitude || userCoords?.longitude || 121.5170;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false, // Move zoom control to bottom right or custom position
    }).setView([initialLat, initialLng], 15);

    // Add high-quality OpenStreetMap tiles (English/Traditional Chinese based on region)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    // Add custom zoom control to the bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Create a LayerGroup for station markers
    const markersLayer = L.layerGroup().addTo(map);

    mapRef.current = map;
    markersLayerRef.current = markersLayer;

      // Trigger a resize event to ensure leaflet renders tiles correctly
      setTimeout(() => {
        map.invalidateSize();
      }, 200);

      // Handle window resize dynamically
      const handleResize = () => {
        if (mapRef.current) {
          mapRef.current.invalidateSize();
        }
      };
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
          markersLayerRef.current = null;
        }
      };
    }, []);

  // 2. Sync Map Center when centerCoords changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !centerCoords) return;

    map.setView([centerCoords.latitude, centerCoords.longitude], 16, {
      animate: true,
      duration: 1,
    });
  }, [centerCoords]);

  // 3. Render User Location Marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userCoords) return;

    const userIcon = L.divIcon({
      html: `
        <div class="relative flex items-center justify-center w-6 h-6">
          <div class="absolute w-full h-full rounded-full bg-blue-500 opacity-45 animate-ping"></div>
          <div class="w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-lg"></div>
        </div>
      `,
      className: 'custom-user-icon',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userCoords.latitude, userCoords.longitude]);
    } else {
      userMarkerRef.current = L.marker([userCoords.latitude, userCoords.longitude], {
        icon: userIcon,
        zIndexOffset: 1000,
      })
        .addTo(map)
        .bindPopup('<div class="font-sans text-xs font-medium">您目前的位置</div>');
    }
  }, [userCoords]);

  // 4. Render Station Markers (Limited to a maximum of 250 nearest to avoid lag, or filtered list)
  useEffect(() => {
    const map = mapRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    // Clear previous markers
    markersLayer.clearLayers();

    // Map stations to markers
    stations.forEach((station) => {
      const bikes = station.available_rent_bikes;
      const returns = station.available_return_bikes;
      const isSuspended = station.act !== '1';

      // Determine colors based on bike availability
      let colorClass = 'bg-emerald-500 border-emerald-600 text-white';
      if (isSuspended) {
        colorClass = 'bg-gray-400 border-gray-500 text-white';
      } else if (bikes === 0) {
        colorClass = 'bg-rose-500 border-rose-600 text-white';
      } else if (bikes < 4) {
        colorClass = 'bg-amber-500 border-amber-600 text-white';
      }

      const iconHtml = `
        <div class="relative flex items-center justify-center w-8 h-8 rounded-full border-2 font-bold text-xs shadow-md transition-all duration-300 hover:scale-115 hover:shadow-lg ${colorClass}">
          ${isSuspended ? 'X' : bikes}
          <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 border-r border-b ${colorClass.split(' ')[0]} ${colorClass.split(' ')[1]}"></div>
        </div>
      `;

      const markerIcon = L.divIcon({
        html: iconHtml,
        className: 'custom-station-icon',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      });

      const marker = L.marker([station.latitude, station.longitude], {
        icon: markerIcon,
      });

      // Handle marker click
      marker.on('click', () => {
        onSelectStation(station);
      });

      // Bind a clean popup
      const popupContent = `
        <div class="font-sans text-slate-800 p-1 min-w-[180px]">
          <div class="font-bold text-sm text-slate-900 border-b pb-1 mb-1.5">${station.sna}</div>
          <div class="text-xs text-slate-500 mb-1.5">${station.sarea} | ${station.ar}</div>
          <div class="flex items-center gap-3 text-xs font-semibold">
            <span class="text-emerald-600">🚲 可租: ${station.available_rent_bikes}</span>
            <span class="text-blue-600">🅿️ 可還: ${station.available_return_bikes}</span>
          </div>
          ${isSuspended ? '<div class="text-xs text-rose-500 font-bold mt-1">⚠️ 暫停營運</div>' : ''}
        </div>
      `;
      marker.bindPopup(popupContent, { closeButton: false });

      markersLayer.addLayer(marker);

      // If this station is currently selected, open its popup
      if (selectedStation && selectedStation.sno === station.sno) {
        setTimeout(() => {
          marker.openPopup();
        }, 100);
      }
    });
  }, [stations, selectedStation, onSelectStation]);

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-inner border border-slate-200 dark:border-slate-800/50 bg-slate-100 dark:bg-slate-950 map-grid">
      <div ref={mapContainerRef} className="w-full h-full z-10" id="youbike-leaflet-map" />
      
      {/* Map legend */}
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl shadow-lg border border-slate-100 dark:border-slate-800 text-[10px] sm:text-[11px] font-medium space-y-1 sm:space-y-1.5 text-slate-700 dark:text-slate-300 pointer-events-auto">
        <div className="font-semibold text-slate-900 dark:text-slate-100 mb-0.5 sm:mb-1">車輛剩餘狀態</div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-emerald-500 border border-emerald-600"></span>
          <span>車輛充足 (&gt;3 輛)</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-amber-500 border border-amber-600"></span>
          <span>車輛較少 (1-3 輛)</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-rose-500 border border-rose-600"></span>
          <span>無車可借 (0 輛)</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-gray-400 border border-gray-500"></span>
          <span>暫停服務</span>
        </div>
      </div>
    </div>
  );
}
