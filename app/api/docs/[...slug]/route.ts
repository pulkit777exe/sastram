import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const MIME_TYPES: Record<string, string> = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
  '.json': 'application/json',
  '.html': 'text/html',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  const filePath = slug.join('/');

  try {
    const swaggerDir = path.dirname(require.resolve('swagger-ui-dist/package.json'));
    const fullPath = path.join(swaggerDir, filePath);

    if (!fullPath.startsWith(swaggerDir)) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
      return new NextResponse('Not Found', { status: 404 });
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const content = fs.readFileSync(fullPath);

    return new NextResponse(content, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, immutable',
      },
    });
  } catch {
    return new NextResponse('Not Found', { status: 404 });
  }
}
