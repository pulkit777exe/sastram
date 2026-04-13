import { NextRequest, NextResponse } from "next/server";
import { requireModerator, requireAdmin } from "@/lib/middleware/moderation";
import { ok, fail } from "@/lib/http/api-response";
import { prisma } from "@/lib/infrastructure/prisma";

export async function GET() {
  try {
    await requireModerator();
    const rules = await prisma.moderationRule.findMany({
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(ok({ rules }));
  } catch {
    return NextResponse.json(
      fail("AUTH_REQUIRED", "Moderator access required"),
      { status: 403 }
    );
  }
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

    // Validate regex pattern to prevent ReDoS attacks
    try {
      new RegExp(body.pattern);
    } catch (error) {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "Invalid regex pattern"),
        { status: 400,
         }
      );
    }

    // Limit pattern complexity (basic check for ReDoS potential)
    if (body.pattern.length > 100 || /(.*\b.*){20,}/.test(body.pattern)) {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "Pattern too complex"),
        { status: 400 }
      );
    }

    const newRule = await prisma.moderationRule.create({
      data: {
        ...body,
        severity: body.severity || "MEDIUM",
      },
    });

    return NextResponse.json(ok({ rule: newRule }));
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

    // Validate regex pattern if provided and updated
    if (body.pattern) {
      try {
        new RegExp(body.pattern);
      } catch (error) {
        return NextResponse.json(
          fail("VALIDATION_ERROR", "Invalid regex pattern"),
          { status: 400 }
        );
      }

      if (body.pattern.length > 100 || /(.*\b.*){20,}/.test(body.pattern)) {
        return NextResponse.json(
          fail("VALIDATION_ERROR", "Pattern too complex"),
          { status: 400 }
        );
      }
    }

    const updatedRule = await prisma.moderationRule.update({
      where: { id: body.id },
      data: {
        ...body,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(ok({ rule: updatedRule }));
  } catch (error) {
    if (error instanceof Error && error.message.includes("NotFound")) {
      return NextResponse.json(
        fail("NOT_FOUND", "Rule not found"),
        { status: 404 }
      );
    }
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

    await prisma.moderationRule.delete({
      where: { id: body.id },
    });

    return NextResponse.json(ok({ success: true }));
  } catch (error) {
    if (error instanceof Error && error.message.includes("NotFound")) {
      return NextResponse.json(
        fail("NOT_FOUND", "Rule not found"),
        { status: 404 }
      );
    }
    return NextResponse.json(
      fail("INTERNAL_ERROR", "Failed to delete rule", error),
      { status: 500 }
    );
  }
}
