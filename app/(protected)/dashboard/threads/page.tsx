import { prisma } from "@/lib/infrastructure/prisma";
import { Input } from "@/components/ui/input";
import { Search, Hash } from "lucide-react";
import { CreateTopicButton } from "@/components/dashboard/create-topic-button";
import { TopicGrid } from "@/components/dashboard/topic-grid";
import Link from "next/link";
import { getSession } from "@/modules/auth/session";
import { Prisma } from "@prisma/client";

function parseTagFilter(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  const values = Array.isArray(raw) ? raw : [raw];
  return values
    .flatMap((value) => value.split(","))
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag, index, all) => tag.length > 0 && all.indexOf(tag) === index);
}

export default async function TopicsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string | string[] }>;
}) {
  const session = await getSession();
  const params = await searchParams;
  const query = params.q || "";
  const selectedTags = parseTagFilter(params.tag);

  const sections = await prisma.section.findMany({
      where: {
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { description: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(selectedTags.length > 0
          ? {
              AND: selectedTags.map((tagSlug) => ({
                tags: {
                  some: {
                    tag: {
                      slug: tagSlug,
                    },
                  },
                },
              })),
            }
          : {}),
      },
      include: {
        messages: {
          select: { senderId: true, createdAt: true },
        },
        tags: {
          include: {
            tag: {
              select: {
                name: true,
                slug: true,
              },
            },
          },
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
      orderBy: {
        messages: { _count: "desc" },
      },
    });
  const sectionIds = sections.map((section) => section.id);
  let readReceiptRows: Array<{ threadId: string; readAt: Date }> = [];
  if (session?.user && sectionIds.length > 0) {
    try {
      readReceiptRows = await prisma.$queryRaw<
        Array<{ threadId: string; readAt: Date }>
      >`
        SELECT "threadId", "readAt"
        FROM "read_receipts"
        WHERE "userId" = ${session.user.id}
          AND "threadId" IN (${Prisma.join(sectionIds)})
      `;
    } catch (error) {
      console.error("[threads.readReceipts]", error);
    }
  }
  const readAtByThread = new Map(
    readReceiptRows.map((row) => [row.threadId, row.readAt]),
  );

  const formattedSections = sections.map((section) => {
    const uniqueSenders = new Set(section.messages.map((m) => m.senderId));
    const readAt = readAtByThread.get(section.id);
    const unreadCount = section.messages.filter((message) => {
      if (message.senderId === session?.user.id) {
        return false;
      }

      if (!readAt) {
        return true;
      }

      return message.createdAt > readAt;
    }).length;

    return {
      id: section.id,
      slug: section.slug,
      title: section.name,
      description: section.description || "",
      activeUsers: uniqueSenders.size,
      messagesCount: section._count.messages,
      unreadCount,
      trending: section._count.messages > 5,
      tags:
        section.tags.length > 0
          ? section.tags.map((relation) => relation.tag.name)
          : ["general"],
    };
  });

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-[0.2em] mb-2">
            <Hash size={14} />
            <span>Community Feed</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">
            Topics
          </h1>
          <p className="text-zinc-500 max-w-md">
            Dive into active discussions, share insights, and connect with other
            members across the workspace.
          </p>
        </div>
        <CreateTopicButton />
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 md:max-w-md group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 group-focus-within:text-indigo-400 transition-colors" />
          <form>
            <Input
              name="q"
              type="search"
              placeholder="Filter by name or keywords..."
              className="w-full pl-10 h-12 rounded-xl transition-all shadow-inner"
              defaultValue={query}
            />
          </form>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:flex gap-1 pointer-events-none">
            <kbd className="text-[10px] px-1.5 py-0.5 rounded border font-sans uppercase">
              Enter
            </kbd>
          </div>
        </div>

        <div className="hidden sm:flex border rounded-xl px-4 h-12 items-center gap-2 cursor-pointer text-sm transition-colors">
          <span className="text-zinc-500 font-medium">Sort:</span>
          <span>Hottest</span>
        </div>
      </div>

      {selectedTags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground">
            Filtering by:
          </span>
          {selectedTags.map((tag) => (
            <Link
              key={tag}
              href={`/dashboard/threads?q=${encodeURIComponent(query)}`}
              className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700"
            >
              #{tag} ×
            </Link>
          ))}
        </div>
      )}

      <div className="pt-4">
        <TopicGrid topics={formattedSections} />
      </div>
    </div>
  );
}
