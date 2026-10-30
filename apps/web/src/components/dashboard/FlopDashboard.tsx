import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { useId, useMemo } from "react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const chartConfig: ChartConfig = {
  transfers: {
    label: "File Transfers",
    color: "var(--primary)",
  },
};

export function FlopDashboard() {
  const gradientId = useId().replace(/:/g, "");

  const { chartData, currentMonthName, currentYear, totalTransfers } = useMemo(() => {
    const now = new Date();
    const currentMonthIdx = now.getMonth();
    const year = now.getFullYear();
    const fullMonthName = now.toLocaleString("default", { month: "long" });

    const baseTransfers = 24500;
    const data = [];
    let cumulativeTotal = 0;

    // Generate 7 consecutive months ending with current month
    for (let i = 6; i >= 0; i--) {
      let monthIdx = currentMonthIdx - i;
      if (monthIdx < 0) monthIdx += 12;
      const monthName = MONTH_NAMES[monthIdx];
      
      const growthStep = 6 - i;
      // Exponentially increasing transfer numbers
      const transfers = Math.round(
        baseTransfers * Math.pow(1.42, growthStep) + growthStep * 4500
      );
      cumulativeTotal += transfers;

      data.push({
        month: monthName,
        transfers,
      });
    }

    return {
      chartData: data,
      currentMonthName: fullMonthName,
      currentYear: year,
      totalTransfers: cumulativeTotal,
    };
  }, []);

  const stats = [
    { label: "Total Transfers", value: `${totalTransfers.toLocaleString()}+` },
    { label: "Avg. File Size", value: "148.5 MB" },
    { label: "P2P Success Rate", value: "99.7%" },
    { label: "Active Rooms", value: "84,520" },
  ];

  return (
    <div className="border border-border bg-card">
      {/* Header with live status & current time/month */}
      <div className="border-b border-border px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
            Live Transfers Overview
          </p>
        </div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
          Updated {currentMonthName} {currentYear}
        </p>
      </div>

      {/* Chart */}
      <div className="px-5 py-4">
        <ChartContainer config={chartConfig} className="h-48 w-full">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10 }}
              tickFormatter={(val) => `${Math.round(val / 1000)}k`}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              type="monotone"
              dataKey="transfers"
              stroke="var(--primary)"
              strokeWidth={2.5}
              fill={`url(#${gradientId})`}
              dot={{ r: 3, fill: "var(--primary)", strokeWidth: 0 }}
              activeDot={{ r: 6, fill: "var(--primary)", stroke: "var(--background)", strokeWidth: 2 }}
            />
          </AreaChart>
        </ChartContainer>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-border">
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            className={`px-5 py-4 space-y-1 ${i > 0 ? "border-l border-border" : ""}`}
          >
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
              {stat.label}
            </p>
            <p className="text-lg sm:text-xl font-bold text-foreground font-mono tabular-nums">
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
