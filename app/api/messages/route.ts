import { NextRequest, NextResponse } from 'next/server';
import { postMessage } from '@/modules/messages/actions';

export async function POST(request: NextRequest) {
  const formData = await request.formData();

  const threadId = formData.get('threadId') as string;
  const body = formData.get('body') as string;

  if (!threadId) {
    return NextResponse.json({ error: 'Missing threadId' }, { status: 400 });
  }

  // If there's no body, check if there are files
  const files = formData.getAll('files') as File[];
  if (!body?.trim() && files.length === 0) {
    return NextResponse.json({ error: 'Missing body or files' }, { status: 400 });
  }

  // Reformat FormData to match postMessage expectations
  const postFormData = new FormData();
  if (body) postFormData.append('content', body);
  postFormData.append('sectionId', threadId);
  const parentId = formData.get('parentId') as string | null;
  if (parentId) {
    postFormData.append('parentId', parentId);
  }
  // Append files
  for (const file of files) {
    postFormData.append('files', file);
  }

  const result = await postMessage(postFormData);

  if (!result || ('error' in result && result.error)) {
    const errorMessage = result?.error || 'Failed to post message';
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }

  const typedResult = result as { data: any };
  return NextResponse.json(
    {
      message: typedResult.data,
    },
    { status: 200 }
  );
}
