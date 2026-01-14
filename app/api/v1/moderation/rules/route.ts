import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/infrastructure/prisma";
import { requireModerator, requireAdmin } from "@/lib/middleware/moderation";
import { ok, fail } from "@/lib/http/api-response";

export async function GET() {
  try {
    await requireModerator();
  } catch {
    return NextResponse.json(
      fail("AUTH_REQUIRED", "Moderator access required"),
      { status: 403 }
    );
  }

  const rules = await prisma.contentSafetyRule.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(ok({ rules }));
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin();
    const body = await request.json();

    if (!body.pattern || !body.category || !body.action) {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "pattern, category and action are required"),
        { status: 400 }
      );
    }

    const rule = await prisma.contentSafetyRule.create({
      data: {
        pattern: body.pattern,
        category: body.category,
        action: body.action,
        severity: body.severity ?? "MEDIUM",
        createdBy: session.user.id,
        metadata: body.metadata,
      },
    });

    return NextResponse.json(ok({ rule }));
  } catch (error) {
    return NextResponse.json(
      fail("INTERNAL_ERROR", "Failed to create rule", error),
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "id is required"),
        { status: 400 }
      );
    }

    const rule = await prisma.contentSafetyRule.update({
      where: { id: body.id },
      data: {
        pattern: body.pattern,
        category: body.category,
        action: body.action,
        severity: body.severity,
        metadata: body.metadata,
      },
    });

    return NextResponse.json(ok({ rule }));
  } catch (error) {
    return NextResponse.json(
      fail("INTERNAL_ERROR", "Failed to update rule", error),
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "id is required"),
        { status: 400 }
      );
    }

    await prisma.contentSafetyRule.delete({
      where: { id: body.id },
    });

    return NextResponse.json(ok({ success: true }));
  } catch (error) {
    return NextResponse.json(
      fail("INTERNAL_ERROR", "Failed to delete rule", error),
      { status: 500 }
    );
  }
}

