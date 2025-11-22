import { prisma } from "@/lib/prisma";
import { StatsCard } from "@/components/dashboard/stats-card";
import { DollarSign, ShoppingBag, Users, CreditCard, Calendar, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default async function DashboardPage() {
  // Fetch real data
  const sections = await prisma.section.findMany({
    include: {
      messages: {
        select: { senderId: true },
      },
      _count: {
        select: { messages: true },
      },
    },
    orderBy: {
      messages: { _count: "desc" },
    },
    take: 6,
  });

  const totalMessages = sections.reduce((acc, s) => acc + s._count.messages, 0);
  const activeTopics = sections.length;
  const totalUsers = await prisma.user.count();

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Messages"
          value={totalMessages.toLocaleString()}
          trend="+0.94"
          trendUp={true}
          icon={DollarSign}
          chartType="bar"
        />
        <StatsCard
          title="Active Topics"
          value={activeTopics.toLocaleString()}
          trend="+1.94"
          trendUp={true}
          icon={ShoppingBag}
          chartType="bar"
        />
        <StatsCard
          title="Total Users"
          value={totalUsers.toLocaleString()}
          trend="+1.21"
          trendUp={true}
          icon={Users}
          chartType="bar"
        />
        <StatsCard
          title="Total Income"
          value="$91,304"
          trend="+1.02"
          trendUp={true}
          icon={CreditCard}
          chartType="bar"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Activity Overview</h3>
              <div className="flex gap-4 mt-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                  <span className="text-slate-500">Messages</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-orange-400"></span>
                  <span className="text-slate-500">Topics</span>
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" className="text-slate-500 border-slate-200">
              <Calendar className="mr-2 h-4 w-4" />
              Monthly
            </Button>
          </div>
          
          <div className="flex items-end justify-between h-64 gap-2 mt-4">
            {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((month, i) => (
              <div key={month} className="flex flex-col items-center gap-2 flex-1 group">
                <div className="relative w-full flex justify-center items-end h-full gap-1">
                  <div 
                    className="w-3 bg-blue-100 rounded-t-md transition-all group-hover:bg-blue-200"
                    style={{ height: `${((i * 17) % 60) + 20}%` }}
                  ></div>
                  <div 
                    className="w-3 bg-blue-500 rounded-t-md transition-all group-hover:bg-blue-600"
                    style={{ height: `${((i * 23) % 40) + 10}%` }}
                  ></div>
                </div>
                <span className="text-xs text-slate-400">{month}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
             <h3 className="text-lg font-bold text-slate-900">Engagement</h3>
             <MoreHorizontal className="h-5 w-5 text-slate-400" />
          </div>
          
          <div className="relative flex items-center justify-center h-64">
             <div className="relative h-48 w-48 rounded-full border-16 border-slate-100 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-16 border-blue-500 border-t-transparent border-l-transparent rotate-45"></div>
                <div className="text-center">
                  <div className="text-xs text-slate-400">Total Messages</div>
                  <div className="text-xl font-bold text-slate-900">{totalMessages}</div>
                </div>
             </div>
          </div>
          
          <div className="mt-4 text-center">
            <Button className="w-full bg-slate-50 text-slate-900 hover:bg-slate-100 border border-slate-200">View Detail</Button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-slate-900">Recent Topics</h3>
          <div className="flex gap-2">
             <Input placeholder="Search topics..." className="h-9 w-64 bg-slate-50 border-slate-200" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-400 uppercase bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 font-medium">Topic</th>
                <th className="px-4 py-3 font-medium">Created By</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Messages</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {formattedSections.map((topic) => (
                <tr key={topic.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-4 font-medium text-slate-900">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded bg-blue-50 text-blue-600">
                        {topic.tags[0]}
                      </div>
                      {topic.title}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-500">User</td>
                  <td className="px-4 py-4 text-slate-500">Today</td>
                  <td className="px-4 py-4">
                    <span className={cn(
                      "px-2.5 py-0.5 rounded-full text-xs font-medium",
                      topic.trending ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                    )}>
                      {topic.trending ? "Trending" : "Active"}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right font-medium text-slate-900">
                    {topic.messagesCount}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
