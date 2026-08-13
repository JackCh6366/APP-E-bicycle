import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';

export const maxDuration = 30;

function readSnapshotFile(): any | null {
  try {
    const snapshotPath = path.join(process.cwd(), 'public', 'kcg-youbike-snapshot.json');
    if (fs.existsSync(snapshotPath)) {
      const content = fs.readFileSync(snapshotPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('無法讀取靜態快照檔案:', err);
  }
  return null;
}

export async function processKcgRequest(): Promise<{ status: number; body: any }> {
  // Always prefer static snapshot file for Kaohsiung on Vercel to guarantee 100% availability
  const snapshot = readSnapshotFile();
  if (snapshot) {
    return {
      status: 200,
      body: snapshot,
    };
  }

  return {
    status: 504,
    body: { error: '高雄市 YouBike 靜態快照尚未建置，且原始伺服器回應逾時' },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: '僅接受 GET 請求。' });
  }

  const result = await processKcgRequest();
  res.setHeader('Content-Type', 'application/json');
  return res.status(result.status).json(result.body);
}
