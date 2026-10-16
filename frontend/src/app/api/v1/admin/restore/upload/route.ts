import { streamUpload } from '@/lib/stream-proxy';

export const runtime = 'nodejs';

export function POST(request: Request) {
  return streamUpload(request, '/api/v1/admin/restore/upload');
}
