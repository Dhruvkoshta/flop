import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { useId } from "react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

// Static flop-themed data: monthly file transfers
const chartData = [
  { month: "Jan", transfers: 200 },
  { month: "Feb", transfers: 218 },
  { month: "Mar", transfers: 305 },
];

const chartConfig: ChartConfig = {
  transfers: {
    label: "File Transfers",
    color: "var(--primary)",
  },
};

const STATS = [
  { label: "Avg. File Size", value: "5.2 MB" },
  { label: "P2P Success Rate", value: "93%" },
  { label: "Rooms Created", value: "1,204" },
  { label: "Avg. Transfer Time", value: "00:02:17" },
];

export function FlopDashboard() {
  const gradientId = useId().replace(/:/g, "");
  return (
    <div className="border border-border bg-card">
      {/* Header */}
      <div className="border-b border-border px-5 py-4 flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
          Activity
        </p>
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
           2026
        </p>
      </div>

      {/* Chart */}
      <div className="px-5 py-4">
        <ChartContainer config={chartConfig} className="h-40 w-full">
          <AreaChart data={chartData} margin={{ top: 4, right: 0, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10 }}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              type="monotone"
              dataKey="transfers"
              stroke="var(--primary)"
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
            />
          </AreaChart>
        </ChartContainer>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-border">
        {STATS.map((stat, i) => (
          <div
            key={stat.label}
            className={`px-5 py-4 space-y-1 ${i > 0 ? "border-l border-border" : ""}`}
          >
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
              {stat.label}
            </p>
            <p className="text-lg font-bold text-foreground font-mono tabular-nums">
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
