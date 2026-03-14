import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST() {
  const cacheFile = path.join(process.cwd(), 'data', 'analysis_report.json');
  if (fs.existsSync(cacheFile)) {
    // Delete cache to force refresh
    fs.unlinkSync(cacheFile);
  }
  return NextResponse.json({ success: true, message: 'Cache cleared. Next request will fetch fresh data.' });
}
