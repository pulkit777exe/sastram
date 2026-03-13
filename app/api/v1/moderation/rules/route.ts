import { NextRequest, NextResponse } from "next/server";
import { requireModerator, requireAdmin } from "@/lib/middleware/moderation";
import { ok, fail } from "@/lib/http/api-response";

// In-memory storage for moderation rules (will be replaced with database implementation later)
let rules = [
  {
    id: "1",
    pattern: "\\b(spam|junk)\\b",
    category: "spam",
    action: "BLOCK",
    severity: "HIGH",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "2",
    pattern: "\\b(hate|discrimination)\\b",
    category: "harassment",
    action: "BLOCK",
    severity: "HIGH",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

export async function GET() {
  try {
    await requireModerator();
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

    const newRule = {
      id: Date.now().toString(),
      ...body,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    rules.push(newRule);
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

    const ruleIndex = rules.findIndex((r) => r.id === body.id);
    if (ruleIndex === -1) {
      return NextResponse.json(
        fail("NOT_FOUND", "Rule not found"),
        { status: 404 }
      );
    }

    rules[ruleIndex] = {
      ...rules[ruleIndex],
      ...body,
      updatedAt: new Date(),
    };

    return NextResponse.json(ok({ rule: rules[ruleIndex] }));
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

    const ruleIndex = rules.findIndex((r) => r.id === body.id);
    if (ruleIndex === -1) {
      return NextResponse.json(
        fail("NOT_FOUND", "Rule not found"),
        { status: 404 }
      );
    }

    rules.splice(ruleIndex, 1);
    return NextResponse.json(ok({ success: true }));
  } catch (error) {
    return NextResponse.json(
      fail("INTERNAL_ERROR", "Failed to delete rule", error),
      { status: 500 }
    );
  }
}
