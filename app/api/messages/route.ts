import { NextRequest, NextResponse } from "next/server";
import { postMessage } from "@/modules/messages/actions";

export async function POST(request: NextRequest) {
  const { threadId, parentId, body } = (await request.json()) as {
    threadId?: string;
    parentId?: string | null;
    body?: string;
  };

  if (!threadId || !body || !body.trim()) {
    return NextResponse.json(
      { error: "Missing threadId or body" },
      { status: 400 },
    );
  }

  const formData = new FormData();
  formData.append("content", body);
  formData.append("sectionId", threadId);
  if (parentId) {
    formData.append("parentId", parentId);
  }

  const result = await postMessage(formData);

  if (!result || ("error" in result && result.error)) {
    return NextResponse.json(
      { error: result && "error" in result ? result.error : "Failed to post" },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      message: result.data,
    },
    { status: 200 },
  );
}

