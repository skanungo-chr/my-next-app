"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { fetchCIPRecordsOnce } from "@/lib/firestore";
import { CIPRecord } from "@/lib/cip";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LabelList, Cell,
} from "recharts";

// ─── Mock data (shown when Firestore has no records) ─────────────────────────

const MOCK_DATA: { type: string; count: number }[] = [
  { type: "Database Change",        count: 5751 },
  { type: "General Software",       count: 927  },
  { type: "DLL/Component Hot Fix",  count: 468  },
  { type: "Software Upgrade",       count: 426  },
  { type: "IT - Network or System", count: 369  },
  { type: "Component Hot Fix",      count: 241  },
  { type: "DLL/Component Drop",     count: 192  },
  { type: "Network Change",         count: 3    },
  { type: "Software Deployment",    count: 3    },
  { type: "Security Patch",         count: 3    },
  { type: "Infrastructure Update",  count: 2    },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const CIP_STATUSES = [
  "Approved", "Denied", "Draft", "Submitted",
  "Successful", "Cancelled", "Rolled Back", "Failed",
];

const ORANGE = "#f59e0b";

const DEFAULT_FROM = "2025-01";

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1f2937] border border-[#374151] rounded-lg px-3 py-2.5 shadow-xl pointer-events-none max-w-[220px]">
      <p className="text-xs text-gray-400 mb-1.5 leading-snug break-words">{label}</p>
      <p className="text-base font-bold text-[#f59e0b] tabular-nums">
        {Number(payload[0].value).toLocaleString()}
      </p>
      <p className="text-[10px] text-gray-500 mt-0.5">CIP records</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CIPsByTypePage() {
  const [records, setRecords]     = useState<CIPRecord[]>([]);
  const [loading, setLoading]     = useState(true);
  const [syncing, setSyncing]     = useState(false);
  const [usingMock, setUsingMock] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  // Filters
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedType, setSelectedType]         = useState("All");
  const [selectedClient, setSelectedClient]     = useState("All");
  const [fromDate, setFromDate]                 = useState(DEFAULT_FROM);
  const [toDate, setToDate]                     = useState("");

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadRecords = useCallback(async () => {
    try {
      const r = await fetchCIPRecordsOnce();
      setRecords(r);
      setUsingMock(r.length === 0);
    } catch {
      setUsingMock(true);
      setRecords([]);
    } finally {
      setLastSynced(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setLoading(true);
    await loadRecords();
    setSyncing(false);
  }, [loadRecords]);

  // ── Derived options ─────────────────────────────────────────────────────────

  const clientNames = useMemo(
    () => [...new Set(records.map(r => r.clientName).filter(Boolean))].sort(),
    [records]
  );

  const typeOptions = useMemo(
    () => [...new Set(records.map(r => r.cipType).filter(Boolean))].sort(),
    [records]
  );

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) {
      if (r.submissionDate) set.add(r.submissionDate.slice(0, 7));
    }
    return [...set].sort();
  }, [records]);

  // ── Filtered records ────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (usingMock) return [];
    return records.filter(r => {
      const matchStatus = selectedStatuses.length === 0 ||
        selectedStatuses.some(s => r.cipStatus?.toLowerCase() === s.toLowerCase());
      const matchType   = selectedType   === "All" || r.cipType    === selectedType;
      const matchClient = selectedClient === "All" || r.clientName === selectedClient;
      const recMonth    = r.submissionDate ? r.submissionDate.slice(0, 7) : "";
      const matchFrom   = fromDate ? recMonth >= fromDate : true;
      const matchTo     = toDate   ? recMonth <= toDate   : true;
      return matchStatus && matchType && matchClient && matchFrom && matchTo;
    });
  }, [records, usingMock, selectedStatuses, selectedType, selectedClient, fromDate, toDate]);

  // ── Chart data ──────────────────────────────────────────────────────────────

  const chartData = useMemo(() => {
    if (usingMock) return MOCK_DATA;
    const counts: Record<string, number> = {};
    for (const r of filtered) {
      const key = r.cipType?.trim() || "(blank)";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count }));
  }, [filtered, usingMock]);

  const total = chartData.reduce((s, d) => s + d.count, 0);

  // ── Filter helpers ──────────────────────────────────────────────────────────

  const hasActiveFilters =
    selectedStatuses.length > 0 ||
    selectedType !== "All" ||
    selectedClient !== "All" ||
    fromDate !== DEFAULT_FROM ||
    !!toDate;

  const resetFilters = () => {
    setSelectedStatuses([]);
    setSelectedType("All");
    setSelectedClient("All");
    setFromDate(DEFAULT_FROM);
    setToDate("");
  };

  const toggleStatus = (s: string) =>
    setSelectedStatuses(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );

  const formatMonth = (ym: string) => {
    const [y, m] = ym.split("-");
    return new Date(Number(y), Number(m) - 1, 1)
      .toLocaleString("default", { month: "short", year: "numeric" });
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">CIPs by Type</h2>
          <p className="text-sm text-gray-500 mt-0.5">Count of CIP records grouped by incident type</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {lastSynced && !syncing && (
            <span className="text-xs text-gray-500">Synced {lastSynced}</span>
          )}
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/60 px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Reset Filters
            </button>
          )}
          <button
            onClick={handleSync}
            disabled={syncing || loading}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <svg
              className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {syncing ? "Syncing…" : "Sync from TFS"}
          </button>
        </div>
      </div>

      {/* Mock data notice */}
      {usingMock && !loading && (
        <div className="mb-5 px-4 py-3 rounded-xl bg-amber-900/20 border border-amber-700/40 flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-300">Showing sample data</p>
            <p className="text-xs text-amber-500 mt-0.5">
              No CIP records found in Firestore. Displaying representative mock data.
              Click <strong>Sync from TFS</strong> or sync from the CIP Records page to populate live data.
            </p>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-gray-800/40 border border-gray-700 rounded-xl p-4 animate-pulse">
              <div className="h-3 w-20 bg-gray-700 rounded mb-3" />
              <div className="h-8 w-14 bg-gray-700 rounded" />
            </div>
          ))
        ) : (
          <>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Total Records</p>
              <p className="text-2xl font-bold text-amber-400 tabular-nums">{total.toLocaleString()}</p>
            </div>
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Distinct Types</p>
              <p className="text-2xl font-bold text-indigo-400 tabular-nums">{chartData.length}</p>
            </div>
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Top Type</p>
              <p className="text-sm font-bold text-orange-400 truncate leading-tight mt-1" title={chartData[0]?.type}>
                {chartData[0]?.type ?? "—"}
              </p>
            </div>
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Top Count</p>
              <p className="text-2xl font-bold text-green-400 tabular-nums">
                {chartData[0]?.count.toLocaleString() ?? "—"}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Main layout: sidebar + content */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* Left sidebar — CIP Status filter */}
        <div className="w-full lg:w-56 shrink-0">
          <div className="bg-[#1a1f2e] border border-gray-800 rounded-xl p-4 sticky top-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-white">CIP Status</span>
              {selectedStatuses.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-amber-600/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-full font-semibold">
                    {selectedStatuses.length}
                  </span>
                  <button
                    onClick={() => setSelectedStatuses([])}
                    className="text-gray-500 hover:text-red-400 transition-colors"
                    title="Clear status filter"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {loading ? (
              <div className="space-y-2.5">
                {CIP_STATUSES.map((_, i) => (
                  <div key={i} className="h-4 bg-gray-700 rounded animate-pulse"
                    style={{ width: `${60 + (i % 3) * 15}%` }} />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {CIP_STATUSES.map(status => {
                  const checked = selectedStatuses.includes(status);
                  return (
                    <label
                      key={status}
                      className="flex items-center gap-2.5 cursor-pointer group"
                      onClick={() => toggleStatus(status)}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        checked
                          ? "bg-amber-600 border-amber-500"
                          : "bg-gray-800 border-gray-600 group-hover:border-gray-400"
                      }`}>
                        {checked && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24"
                            stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className={`text-sm select-none transition-colors ${
                        checked ? "text-white font-medium" : "text-gray-400 group-hover:text-gray-200"
                      }`}>
                        {status}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {selectedStatuses.length === 0 && !loading && (
              <p className="text-xs text-gray-600 mt-3 border-t border-gray-800 pt-2">
                All statuses shown
              </p>
            )}
          </div>
        </div>

        {/* Right: filters + chart + table */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Dropdown filters row */}
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <label className="text-xs text-gray-500 font-medium">CIP Type</label>
              <select
                value={selectedType}
                onChange={e => setSelectedType(e.target.value)}
                disabled={loading || usingMock}
                className="bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500 w-full disabled:opacity-50 cursor-pointer"
              >
                <option value="All">(All Types)</option>
                {typeOptions.map(t => (
                  <option key={t} value={t} className="bg-gray-900">{t}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <label className="text-xs text-gray-500 font-medium">Client</label>
              <select
                value={selectedClient}
                onChange={e => setSelectedClient(e.target.value)}
                disabled={loading || usingMock}
                className="bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500 w-full disabled:opacity-50 cursor-pointer"
              >
                <option value="All">(All Clients)</option>
                {clientNames.map(n => (
                  <option key={n} value={n} className="bg-gray-900">{n}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Date range filter row */}
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <label className="text-xs text-gray-500 font-medium">
                From Month
                {fromDate === DEFAULT_FROM && (
                  <span className="ml-1.5 text-[10px] text-amber-500/70 font-normal">(default: Jan 2025)</span>
                )}
              </label>
              <select
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                disabled={loading || usingMock}
                className="bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500 w-full disabled:opacity-50 cursor-pointer"
              >
                <option value="">(All time)</option>
                {availableMonths.map(m => (
                  <option key={m} value={m} className="bg-gray-900">{formatMonth(m)}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <label className="text-xs text-gray-500 font-medium">To Month</label>
              <select
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                disabled={loading || usingMock}
                className="bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500 w-full disabled:opacity-50 cursor-pointer"
              >
                <option value="">(All)</option>
                {availableMonths.map(m => (
                  <option key={m} value={m} className="bg-gray-900">{formatMonth(m)}</option>
                ))}
              </select>
            </div>
            {(fromDate !== DEFAULT_FROM || toDate) && (
              <div className="flex flex-col gap-1 shrink-0">
                <label className="text-xs font-medium invisible">Reset</label>
                <button
                  onClick={() => { setFromDate(DEFAULT_FROM); setToDate(""); }}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-400 border border-gray-700 hover:border-red-500/40 px-3 py-2 rounded-lg transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Reset dates
                </button>
              </div>
            )}
          </div>

          {/* Chart */}
          {loading ? (
            <div className="bg-[#111827] rounded-2xl p-5 border border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <div className="h-4 w-48 bg-gray-700 rounded animate-pulse" />
                <div className="h-6 w-20 bg-gray-700 rounded-full animate-pulse" />
              </div>
              <div className="h-80 bg-gray-800/50 rounded animate-pulse" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="bg-[#111827] rounded-2xl p-5 border border-gray-800">
              <div className="h-80 flex flex-col items-center justify-center gap-3 text-gray-600">
                <svg className="w-10 h-10 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
                <span className="text-sm">No records match the selected filters</span>
                {hasActiveFilters && (
                  <button
                    onClick={resetFilters}
                    className="text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2"
                  >
                    Reset filters
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-[#111827] rounded-2xl p-5 border border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white">Count of CIP Records by Type</h3>
                <span className="text-xs font-semibold bg-amber-900/40 text-amber-300 px-2.5 py-1 rounded-full border border-amber-800/60">
                  {total.toLocaleString()} total
                </span>
              </div>
              <ResponsiveContainer width="100%" height={380}>
                <BarChart
                  data={chartData}
                  margin={{ top: 28, right: 16, left: 0, bottom: 110 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                  <XAxis
                    dataKey="type"
                    tick={{ fill: "#9CA3AF", fontSize: 11 }}
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={110}
                    tickLine={false}
                    axisLine={{ stroke: "#374151" }}
                  />
                  <YAxis
                    tick={{ fill: "#9CA3AF", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                    }
                  />
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ fill: "rgba(245,158,11,0.07)" }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={80}>
                    <LabelList
                      dataKey="count"
                      position="top"
                      style={{ fill: "#9CA3AF", fontSize: 11, fontWeight: 600 }}
                      formatter={(v: number) =>
                        v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
                      }
                    />
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={ORANGE} fillOpacity={i === 0 ? 1 : 0.82} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {usingMock && (
                <p className="text-[10px] text-gray-600 text-center mt-2">
                  Sample data — sync CIP records to see live counts
                </p>
              )}
            </div>
          )}

          {/* Type breakdown table */}
          {!loading && chartData.length > 0 && (
            <div className="bg-[#111827] rounded-2xl border border-gray-800 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 bg-gray-900/50">
                <h3 className="text-sm font-semibold text-white">Type Breakdown</h3>
                {usingMock && (
                  <span className="text-[10px] text-amber-600/70 bg-amber-900/20 border border-amber-700/30 px-2 py-0.5 rounded-full">
                    sample data
                  </span>
                )}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-900 border-b border-gray-700">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Count
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      % of Total
                    </th>
                    <th className="px-5 py-3 w-28 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Share
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {chartData.map((row, i) => {
                    const pct = total > 0 ? (row.count / total) * 100 : 0;
                    return (
                      <tr key={row.type} className={i % 2 === 1 ? "bg-[#1a1f2e]/30" : ""}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="w-2.5 h-2.5 rounded-sm shrink-0"
                              style={{ background: ORANGE, opacity: i === 0 ? 1 : 0.7 }}
                            />
                            <span className="text-gray-200">{row.type}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right text-gray-300 tabular-nums font-medium">
                          {row.count.toLocaleString()}
                        </td>
                        <td className="px-5 py-3 text-right text-gray-500 tabular-nums">
                          {pct.toFixed(1)}%
                        </td>
                        <td className="px-5 py-3">
                          <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${pct}%`,
                                background: ORANGE,
                                opacity: i === 0 ? 1 : 0.7,
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-600 bg-gray-900">
                    <td className="px-5 py-3 font-bold text-white">Grand Total</td>
                    <td className="px-5 py-3 text-right font-bold text-white tabular-nums">
                      {total.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-white">100%</td>
                    <td className="px-5 py-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
