"use client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, LabelList,
} from "recharts";

// Palette cycles for version bars (no fixed mapping needed)
const BAR_COLORS = [
  "#6366F1", "#8B5CF6", "#06B6D4", "#F59E0B",
  "#EF4444", "#10B981", "#3B82F6", "#F97316",
  "#EC4899", "#6B7280",
];

function truncate(s: string, max = 25): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

interface CIPLike { softwareVersion?: string; }
interface DataPoint { name: string; displayName: string; value: number; color: string; }
interface Props { data?: DataPoint[]; records?: CIPLike[]; }

function buildData(props: Props): DataPoint[] {
  if (props.data && props.data.length > 0) return props.data;
  if (props.records && props.records.length > 0) {
    const counts: Record<string, number> = {};
    for (const r of props.records) {
      const version = r.softwareVersion?.trim() || "Unknown";
      counts[version] = (counts[version] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([version, count], i) => ({
        name:        version,
        displayName: truncate(version),
        value:       count,
        color:       BAR_COLORS[i % BAR_COLORS.length],
      }));
  }
  return [];
}

// Custom tooltip that shows the full version string
function VersionTooltip({ active, payload }: { active?: boolean; payload?: { payload: DataPoint; value: number }[] }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0].payload;
  return (
    <div style={{
      background: "#1F2937", border: "1px solid #374151",
      borderRadius: 8, color: "#ffffff", fontSize: 12, padding: "6px 10px",
    }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{name}</p>
      <p style={{ margin: 0, color: "#9ca3af" }}>{Number(value).toLocaleString()} CIPs</p>
    </div>
  );
}

export default function CIPsByProduct(props: Props) {
  const data = buildData(props);
  const total = data.reduce((s, d) => s + d.value, 0);
  const allUnknown = data.length === 1 && data[0].name === "Unknown";

  if (!data.length) {
    return (
      <div className="bg-[#111827] rounded-2xl p-5 border border-gray-800">
        <div className="h-4 w-36 bg-gray-700 rounded animate-pulse mb-4" />
        <div className="h-[320px] flex flex-col items-center justify-center gap-2 text-gray-600 text-sm">
          <span>No software version data found</span>
          <span className="text-xs text-gray-700">Run Sync from SharePoint to populate version data</span>
        </div>
      </div>
    );
  }

  const chartHeight = data.length * 44 + 60;

  return (
    <div className="bg-[#111827] rounded-2xl p-5 border border-gray-800">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-white">CIPs by Software Version</h3>
          <p className="text-xs text-gray-500 mt-0.5">{total.toLocaleString()} total records</p>
        </div>
        <span className="text-xs font-semibold bg-indigo-900/50 text-indigo-300 px-2.5 py-1 rounded-full border border-indigo-800">
          {data.length} version{data.length !== 1 ? "s" : ""}
        </span>
      </div>

      {allUnknown && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-yellow-900/20 border border-yellow-800/40 text-xs text-yellow-400">
          ⚠️ Software Version field is empty — run Sync from SharePoint to populate version data.
        </div>
      )}

      <div style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 4, right: 56, left: 8, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="4 4" stroke="#374151" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#374151" }}
            />
            <YAxis
              type="category"
              dataKey="displayName"
              width={180}
              tick={{ fill: "#d1d5db", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<VersionTooltip />} cursor={{ fill: "#1f293780" }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
              <LabelList
                dataKey="value"
                position="right"
                style={{ fill: "#9ca3af", fontSize: 11 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
