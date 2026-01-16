import { prisma } from "@/lib/infrastructure/prisma";
import { Input } from "@/components/ui/input";
import { Search, Hash } from "lucide-react";
import { CreateTopicButton } from "@/components/dashboard/create-topic-button";
import { TopicGrid } from "@/components/dashboard/topic-grid";
import { cache } from "react";

export default async function TopicsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const query = (await searchParams).q || "";

  const sections = await prisma.section.findMany({
      where: {
        deletedAt: null,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
        ],
      },
      include: {
        messages: {
          where: {
            deletedAt: null,
          },
          select: { senderId: true },
        },
        _count: {
          select: {
            messages: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
      orderBy: {
        messages: { _count: "desc" },
      },
    });

  const formattedSections = sections.map((section) => {
    const uniqueSenders = new Set(section.messages.map((m) => m.senderId));
    return {
      id: section.id,
      slug: section.slug,
      title: section.name,
      description: section.description || "",
      activeUsers: uniqueSenders.size,
      messagesCount: section._count.messages,
      trending: section._count.messages > 5,
      tags: [section.icon || "General"],
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

      <div className="pt-4">
        <TopicGrid topics={formattedSections} />
      </div>
    </div>
  );
}
