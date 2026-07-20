/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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
