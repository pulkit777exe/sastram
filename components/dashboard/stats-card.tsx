import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  trend: string;
  trendUp: boolean;
  icon: LucideIcon;
  chartType?: "bar" | "line";
}

export function StatsCard({
  title,
  value,
  trend,
  trendUp,
  icon: Icon,
  chartType = "bar",
}: StatsCardProps) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-start justify-between mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 border border-slate-100">
          <Icon className="h-5 w-5 text-slate-500" />
        </div>
        <div className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">
          ⓘ
        </div>
      </div>

      <div className="mb-1 text-sm font-medium text-slate-500">{title}</div>

      <div className="flex items-end justify-between">
        <div>
          <div className="text-2xl font-bold text-slate-900">{value}</div>
          <div className="flex items-center gap-1 text-xs mt-1">
            <span
              className={cn(
                "font-medium",
                trendUp ? "text-emerald-500" : "text-red-500"
              )}
            >
              {trendUp ? "+" : ""}
              {trend}
            </span>
            <span className="text-slate-400">last year</span>
          </div>
        </div>

        {/* Mini Chart Visualization (CSS) */}
        <div className="flex items-end gap-1 h-8">
          {[40, 70, 50, 90, 60, 80].map((h, i) => (
            <div
              key={i}
              className={cn(
                "w-1.5 rounded-t-sm",
                chartType === "bar" ? "bg-blue-500/20" : "bg-emerald-500/20"
              )}
              style={{ height: `${h}%` }}
            >
              <div
                className={cn(
                  "w-full rounded-t-sm h-full opacity-50",
                  chartType === "bar" ? "bg-blue-500" : "bg-emerald-500"
                )}
                style={{ height: i === 5 ? "100%" : "0%" }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
