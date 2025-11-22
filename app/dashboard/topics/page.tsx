import { prisma } from "@/lib/prisma";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { CreateTopicButton } from "@/components/dashboard/create-topic-button";
import { TopicGrid } from "@/components/dashboard/topic-grid";

export default async function TopicsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const query = (await searchParams).q || "";

  const sections = await prisma.section.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
      ],
    },
    include: {
      messages: {
        select: {
          senderId: true,
        },
      },
      _count: {
        select: { messages: true },
      },
    },
    orderBy: {
      messages: {
        _count: "desc",
      },
    },
  });

  const formattedSections = sections.map((section) => {
    const uniqueSenders = new Set(section.messages.map((m) => m.senderId));
    return {
      id: section.id,
      title: section.name,
      description: section.description || "",
      activeUsers: uniqueSenders.size,
      messagesCount: section._count.messages,
      trending: section._count.messages > 5,
      tags: [section.icon || "Topic"],
    };
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Topics</h1>
          <p className="text-slate-500">
            Explore all active discussions and communities.
          </p>
        </div>
        <CreateTopicButton />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <form>
          <Input
            name="q"
            type="search"
            placeholder="Search topics..."
            className="w-full pl-10 h-11 rounded-xl border-slate-200 bg-white md:w-[300px] lg:w-[400px] focus:ring-blue-500/20"
            defaultValue={query}
          />
        </form>
      </div>

      <TopicGrid topics={formattedSections} />
    </div>
  );
}
