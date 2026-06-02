"use client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LabelList, Cell,
} from "recharts";

interface DataPoint { type: string; count: number; }
interface Props { data?: DataPoint[]; records?: { cipType?: string }[]; }

function buildData(props: Props): DataPoint[] {
  if (props.data && props.data.length > 0) return props.data;
  if (props.records) {
    const counts: Record<string, number> = {};
    for (const r of props.records) {
      const key = r.cipType?.trim() || "(blank)";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([type, count]) => ({ type, count }));
  }
  return [];
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1f2937] border border-[#374151] rounded-lg px-3 py-2 shadow-lg pointer-events-none">
      <p className="text-xs text-gray-400 mb-1 max-w-[200px] break-words">{label}</p>
      <p className="text-sm font-bold text-[#f59e0b]">
        {Number(payload[0].value).toLocaleString()} records
      </p>
    </div>
  );
}

export default function CIPsByType(props: Props) {
  const data  = buildData(props);
  const total = data.reduce((s, d) => s + d.count, 0);

  if (!data.length) {
    return (
      <div className="bg-[#111827] rounded-2xl p-5 border border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <div className="h-4 w-36 bg-gray-700 rounded animate-pulse" />
          <div className="h-6 w-14 bg-gray-700 rounded-full animate-pulse" />
        </div>
        <div className="h-[300px] flex items-center justify-center text-gray-600 text-sm">
          No data available
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#111827] rounded-2xl p-5 border border-gray-800">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white">CIPs by Type</h3>
        <span className="text-xs font-semibold bg-amber-900/40 text-amber-300 px-2.5 py-1 rounded-full border border-amber-800/60">
          {total.toLocaleString()} total
        </span>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 20, right: 16, left: 0, bottom: 90 }}>
          <CartesianGrid strokeDasharray="4 4" stroke="#374151" vertical={false} />
          <XAxis
            dataKey="type"
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            angle={-45}
            textAnchor="end"
            interval={0}
            height={90}
            tickLine={false}
            axisLine={{ stroke: "#374151" }}
          />
          <YAxis
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: "rgba(245,158,11,0.08)" }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={60}>
            {data.map((_, i) => (
              <Cell key={i} fill="#f59e0b" fillOpacity={i === 0 ? 1 : 0.85} />
            ))}
            <LabelList
              dataKey="count"
              position="top"
              style={{ fill: "#9ca3af", fontSize: 10 }}
              formatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
