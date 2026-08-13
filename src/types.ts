/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CityKey = 'taipei' | 'newtaipei' | 'kaohsiung';

export interface CityConfig {
  key: CityKey;
  name: string;
  defaultDistrict: string;
  defaultCenter: { latitude: number; longitude: number };
  apiUrl: string;
  sourceLabel: string;
}

export const CITIES: Record<CityKey, CityConfig> = {
  taipei: {
    key: 'taipei',
    name: '台北市',
    defaultDistrict: '大安區',
    defaultCenter: { latitude: 25.0375, longitude: 121.5637 },
    apiUrl: 'https://tcgbusfs.blob.core.windows.net/dotapp/youbike/v2/youbike_immediate.json',
    sourceLabel: '台北市政府交通局',
  },
  newtaipei: {
    key: 'newtaipei',
    name: '新北市',
    defaultDistrict: '板橋區',
    defaultCenter: { latitude: 25.0116, longitude: 121.4658 },
    apiUrl: '/api/ntpc-youbike',
    sourceLabel: '新北市政府開放資料平台',
  },
  kaohsiung: {
    key: 'kaohsiung',
    name: '高雄市',
    defaultDistrict: '新興區',
    defaultCenter: { latitude: 22.6273, longitude: 120.3014 },
    apiUrl: '/api/kcg-youbike',
    sourceLabel: '高雄市政府交通局 / 開放資料平台',
  },
};

export interface YouBikeStation {
  sno: string;                  // 站點代號
  sna: string;                  // 中文站名 (e.g. "YouBike2.0_捷運科技大樓站")
  sarea: string;                // 行政區 (e.g. "大安區")
  ar: string;                   // 地址
  latitude: number;             // 緯度
  longitude: number;            // 經度
  available_rent_bikes: number; // 可租借車輛數
  available_return_bikes: number; // 可還車空位數
  total: number;                // 總車位
  act: string;                  // 1=正常營運, 0=暫停營運
  mday: string;                 // 更新時間
  distance?: number;            // 與目前定位的距離 (公尺)
}

export interface FilterState {
  searchQuery: string;
  sarea: string;
  status: 'all' | 'rent' | 'return'; // 顯示：全部、有車可租、有空位可還
  sortBy: 'distance' | 'available_rent' | 'available_return' | 'default';
}

