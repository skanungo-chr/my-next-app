"use client";

import { useEffect, useState, useMemo, useCallback, Fragment } from "react";
import { fetchCIPRecordsOnce } from "@/lib/firestore";
import { CIPRecord } from "@/lib/cip";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

// ─── TFS config (same env vars as the TFS Records page) ──────────────────────

const TFS_URL  = (process.env.NEXT_PUBLIC_TFS_URL         ?? "").replace(/\/+$/, "").trim();
const TFS_COL  = (process.env.NEXT_PUBLIC_TFS_COLLECTION  ?? "CHR").trim();
const TFS_PROJ = (process.env.NEXT_PUBLIC_TFS_PROJECT     ?? "Omnia360Suite").trim();
const TFS_VER  = (process.env.NEXT_PUBLIC_TFS_API_VERSION ?? "6.0").trim();
const PAT_KEY  = "tfs_pat_override";

function getActivePAT(): string {
  if (typeof window === "undefined") return process.env.NEXT_PUBLIC_TFS_PAT ?? "";
  return (localStorage.getItem(PAT_KEY) ?? process.env.NEXT_PUBLIC_TFS_PAT ?? "").trim();
}

// Only fetch the two fields we need — keeps this much lighter than the TFS page
const MINIMAL_FIELDS = "System.Id,Custom.IncidentID";

interface TFSItemLight { id: number; incidentId: string; }

async function fetchTFSForChart(months: number): Promise<TFSItemLight[]> {
  const pat = getActivePAT();
  if (!pat || !TFS_URL) throw Object.assign(new Error("NO_PAT"), { code: "NO_PAT" });

  const auth       = `Basic ${btoa(`:${pat}`)}`;
  const dateClause = months > 0
    ? (() => {
        const d = new Date();
        d.setMonth(d.getMonth() - months);
        return ` AND [System.ChangedDate] >= '${d.toISOString().slice(0, 10)}'`;
      })()
    : "";

  const wiql    = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${TFS_PROJ}'${dateClause} ORDER BY [System.ChangedDate] DESC`;
  const wiqlUrl = `${TFS_URL}/${TFS_COL}/${TFS_PROJ}/_apis/wit/wiql?api-version=${TFS_VER}`;

  let res: Response;
  try {
    res = await fetch(wiqlUrl, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: wiql }),
    });
  } catch {
    const getUrl = `${wiqlUrl}&wiql=${encodeURIComponent(wiql)}`;
    res = await fetch(getUrl, { headers: { Authorization: auth, Accept: "application/json" } });
  }

  if (res.status === 401 || res.status === 403)
    throw Object.assign(new Error("INVALID_PAT"), { code: "INVALID_PAT" });
  if (!res.ok) throw new Error(`TFS WIQL ${res.status}`);

  const wiqlData = await res.json() as { workItems?: { id: number }[] };
  const ids = (wiqlData.workItems ?? []).map(w => w.id);
  if (ids.length === 0) return [];

  const all: TFSItemLight[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const url   = `${TFS_URL}/${TFS_COL}/${TFS_PROJ}/_apis/wit/workitems`
      + `?ids=${chunk.join(",")}&fields=${MINIMAL_FIELDS}&errorPolicy=omit&api-version=${TFS_VER}`;
    const r = await fetch(url, { headers: { Authorization: auth, Accept: "application/json" } });
    if (!r.ok) break;
    const d = await r.json() as { value?: { id: number; fields: Record<string, unknown> }[] };
    for (const item of (d.value ?? [])) {
      all.push({
        id:         item.id,
        incidentId: String(item.fields["Custom.IncidentID"] ?? "").trim(),
      });
    }
    if (i + 200 < ids.length) await new Promise(r => setTimeout(r, 250));
  }
  return all;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TFSGroup {
  tfsNumber: string;
  count: number;
  types: string[];
  incNums: string[];
  records: CIPRecord[];
}

interface ChartPoint {
  tfsNumber: string;
  count: number;
  types: string[];
  incNums: string[];
}

// ─── Mock data (fallback when TFS / Firestore unavailable) ───────────────────

const MOCK_GROUPS: TFSGroup[] = [
  { tfsNumber: "TFS-82216", count: 14, types: ["Database Change", "General Software"],
    incNums: ["INC-274959","INC-275303","INC-281234"], records: [] },
  { tfsNumber: "TFS-79034", count: 11, types: ["DLL/Component Hot Fix"],
    incNums: ["INC-271100","INC-273456"], records: [] },
  { tfsNumber: "TFS-81003", count: 9,  types: ["Software Upgrade", "Database Change"],
    incNums: ["INC-280001","INC-280002"], records: [] },
  { tfsNumber: "TFS-77821", count: 7,  types: ["General Software"],
    incNums: ["INC-268000"], records: [] },
  { tfsNumber: "TFS-80115", count: 6,  types: ["IT - Network or System"],
    incNums: ["INC-279000"], records: [] },
  { tfsNumber: "TFS-78904", count: 5,  types: ["Component Hot Fix"],
    incNums: ["INC-270500"], records: [] },
  { tfsNumber: "TFS-76500", count: 4,  types: ["DLL/Component Drop"],
    incNums: ["INC-265000"], records: [] },
  { tfsNumber: "TFS-83001", count: 3,  types: ["Network Change"],
    incNums: ["INC-283000"], records: [] },
  { tfsNumber: "(No TFS Linked)", count: 12, types: ["Database Change", "Software Deployment"],
    incNums: [], records: [] },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const CIP_STATUSES = [
  "Approved", "Denied", "Draft", "Submitted",
  "Successful", "Cancelled", "Rolled Back", "Failed",
];

const STATUS_BADGE: Record<string, string> = {
  approved:      "bg-emerald-900/40 text-emerald-400 border-emerald-700/50",
  submitted:     "bg-blue-900/40 text-blue-400 border-blue-700/50",
  draft:         "bg-yellow-900/40 text-yellow-400 border-yellow-700/50",
  denied:        "bg-red-900/40 text-red-400 border-red-700/50",
  cancelled:     "bg-gray-800/60 text-gray-400 border-gray-600/50",
  "rolled back": "bg-orange-900/40 text-orange-400 border-orange-700/50",
  failed:        "bg-red-900/60 text-red-300 border-red-600/50",
  successful:    "bg-emerald-900/60 text-emerald-300 border-emerald-600/50",
};
function statusBadge(s: string) {
  return STATUS_BADGE[s.toLowerCase()] ?? "bg-indigo-900/40 text-indigo-400 border-indigo-700/50";
}

const ORANGE       = "#f59e0b";
const DEFAULT_FROM = "2025-01";
const CHART_LIMIT  = 30;

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ value: number; payload: ChartPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const { tfsNumber, count, incNums } = payload[0].payload;
  return (
    <div className="bg-[#1f2937] border border-[#374151] rounded-lg px-3 py-2.5 shadow-xl pointer-events-none max-w-[260px]">
      <p className="text-xs font-mono font-bold text-amber-400 mb-1 break-all">{tfsNumber}</p>
      <p className="text-base font-bold text-white tabular-nums">
        {count.toLocaleString()}
        <span className="text-xs text-gray-400 font-normal ml-1.5">incidents</span>
      </p>
      {incNums.length > 0 && (
        <div className="mt-1.5 border-t border-gray-700/60 pt-1.5">
          <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-wide">Linked INCs</p>
          {incNums.slice(0, 5).map(n => (
            <p key={n} className="text-[11px] text-indigo-300 font-mono leading-snug">· {n}</p>
          ))}
          {incNums.length > 5 && (
            <p className="text-[10px] text-gray-600 mt-0.5">+{incNums.length - 5} more</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CIPsByTypePage() {
  const [cipRecords, setCipRecords]   = useState<CIPRecord[]>([]);
  const [tfsItems, setTfsItems]       = useState<TFSItemLight[]>([]);
  const [cipLoading, setCipLoading]   = useState(true);
  const [tfsLoading, setTfsLoading]   = useState(false);
  const [tfsError, setTfsError]       = useState<string | null>(null);
  const [usingMock, setUsingMock]     = useState(false);
  const [lastSynced, setLastSynced]   = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Filters
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedType, setSelectedType]         = useState("All");
  const [selectedClient, setSelectedClient]     = useState("All");
  const [fromDate, setFromDate]                 = useState(DEFAULT_FROM);
  const [toDate, setToDate]                     = useState("");
  const [tfsSearch, setTfsSearch]               = useState("");

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadCIP = useCallback(async () => {
    setCipLoading(true);
    try {
      const r = await fetchCIPRecordsOnce();
      setCipRecords(r);
      if (r.length === 0) setUsingMock(true);
    } catch {
      setUsingMock(true);
    } finally {
      setCipLoading(false);
    }
  }, []);

  const loadTFS = useCallback(async () => {
    setTfsLoading(true);
    setTfsError(null);
    try {
      const items = await fetchTFSForChart(12); // last 12 months by default
      setTfsItems(items);
      setLastSynced(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch (e) {
      const err = e as Error & { code?: string };
      setTfsError(err.code ?? err.message ?? "Unknown TFS error");
      setUsingMock(true);
    } finally {
      setTfsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCIP();
    loadTFS();
  }, [loadCIP, loadTFS]);

  const handleSync = useCallback(async () => {
    setUsingMock(false);
    await Promise.all([loadCIP(), loadTFS()]);
  }, [loadCIP, loadTFS]);

  // ── Derived filter options ──────────────────────────────────────────────────

  const clientNames = useMemo(
    () => [...new Set(cipRecords.map(r => r.clientName).filter(Boolean))].sort(),
    [cipRecords]
  );

  const typeOptions = useMemo(
    () => [...new Set(cipRecords.map(r => r.cipType).filter(Boolean))].sort(),
    [cipRecords]
  );

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const r of cipRecords) {
      if (r.submissionDate) set.add(r.submissionDate.slice(0, 7));
    }
    return [...set].sort();
  }, [cipRecords]);

  // ── Filtered CIP records ────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (usingMock) return [];
    return cipRecords.filter(r => {
      const matchStatus = selectedStatuses.length === 0 ||
        selectedStatuses.some(s => r.cipStatus?.toLowerCase() === s.toLowerCase());
      const matchType   = selectedType   === "All" || r.cipType    === selectedType;
      const matchClient = selectedClient === "All" || r.clientName === selectedClient;
      const recMonth    = r.submissionDate ? r.submissionDate.slice(0, 7) : "";
      const matchFrom   = fromDate ? recMonth >= fromDate : true;
      const matchTo     = toDate   ? recMonth <= toDate   : true;
      return matchStatus && matchType && matchClient && matchFrom && matchTo;
    });
  }, [cipRecords, usingMock, selectedStatuses, selectedType, selectedClient, fromDate, toDate]);

  // ── Group CIP records by TFS work item (via Custom.IncidentID ↔ chrTicketNumbers) ──

  const tfsGroups = useMemo((): TFSGroup[] => {
    if (usingMock || (tfsItems.length === 0 && cipRecords.length === 0)) return MOCK_GROUPS;

    // Build: tfsId → Set of matched CIP record ids
    const byTFS = new Map<number, Set<string>>();

    for (const tfs of tfsItems) {
      if (!tfs.incidentId) continue;
      const inc = tfs.incidentId.toLowerCase();
      for (const cip of filtered) {
        if (String(cip.chrTicketNumbers ?? "").toLowerCase().includes(inc)) {
          if (!byTFS.has(tfs.id)) byTFS.set(tfs.id, new Set());
          byTFS.get(tfs.id)!.add(cip.id);
        }
      }
    }

    const linkedCIPIds = new Set([...byTFS.values()].flatMap(s => [...s]));
    const unlinked     = filtered.filter(c => !linkedCIPIds.has(c.id));

    const groups: TFSGroup[] = [];

    for (const [tfsId, cipIds] of byTFS.entries()) {
      const recs    = filtered.filter(c => cipIds.has(c.id));
      const types   = [...new Set(recs.map(c => c.cipType).filter(Boolean))].sort();
      const incNums = recs.map(c => c.chrTicketNumbers).filter(Boolean);
      groups.push({ tfsNumber: `TFS-${tfsId}`, count: recs.length, types, incNums, records: recs });
    }

    if (unlinked.length > 0) {
      groups.push({
        tfsNumber: "(No TFS Linked)",
        count:     unlinked.length,
        types:     [...new Set(unlinked.map(c => c.cipType).filter(Boolean))].sort(),
        incNums:   unlinked.map(c => c.chrTicketNumbers).filter(Boolean),
        records:   unlinked,
      });
    }

    return groups.sort((a, b) => {
      if (a.tfsNumber === "(No TFS Linked)") return 1;
      if (b.tfsNumber === "(No TFS Linked)") return -1;
      return b.count - a.count;
    });
  }, [tfsItems, filtered, usingMock, cipRecords.length]);

  // Apply TFS number search on top of the already-filtered groups
  const visibleGroups = useMemo(() => {
    if (!tfsSearch.trim()) return tfsGroups;
    const q = tfsSearch.trim().toLowerCase();
    return tfsGroups.filter(g => g.tfsNumber.toLowerCase().includes(q));
  }, [tfsGroups, tfsSearch]);

  const chartData: ChartPoint[] = useMemo(
    () => visibleGroups.slice(0, CHART_LIMIT).map(g => ({
      tfsNumber: g.tfsNumber,
      count:     g.count,
      types:     g.types,
      incNums:   g.incNums,
    })),
    [visibleGroups]
  );

  const total = visibleGroups.reduce((s, g) => s + g.count, 0);
  const loading = cipLoading || tfsLoading;

  // ── Filter helpers ──────────────────────────────────────────────────────────

  const hasActiveFilters =
    selectedStatuses.length > 0 ||
    selectedType   !== "All" ||
    selectedClient !== "All" ||
    fromDate !== DEFAULT_FROM ||
    !!toDate ||
    !!tfsSearch;

  const resetFilters = () => {
    setSelectedStatuses([]);
    setSelectedType("All");
    setSelectedClient("All");
    setFromDate(DEFAULT_FROM);
    setToDate("");
    setTfsSearch("");
  };

  const toggleStatus = (s: string) =>
    setSelectedStatuses(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );

  const toggleRow = (tfsNumber: string) =>
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(tfsNumber) ? next.delete(tfsNumber) : next.add(tfsNumber);
      return next;
    });

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
          <p className="text-sm text-gray-500 mt-0.5">Incidents attached per TFS record</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {lastSynced && !tfsLoading && (
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
            disabled={loading}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <svg
              className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {loading ? "Syncing…" : "Sync from TFS"}
          </button>
        </div>
      </div>

      {/* TFS error banners */}
      {tfsError === "NO_PAT" && !tfsLoading && (
        <div className="mb-5 px-4 py-3 rounded-xl bg-red-900/20 border border-red-700/40 flex items-start gap-3">
          <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-red-300">TFS token not configured</p>
            <p className="text-xs text-red-400 mt-0.5">
              Add <code className="bg-red-900/30 px-1 rounded">NEXT_PUBLIC_TFS_PAT</code> to Vercel environment variables.
              Showing sample data below.
            </p>
          </div>
        </div>
      )}
      {tfsError === "INVALID_PAT" && !tfsLoading && (
        <div className="mb-5 px-4 py-3 rounded-xl bg-red-900/20 border border-red-700/40 flex items-start gap-3">
          <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          <p className="text-sm text-red-300">
            <strong>TFS authentication failed</strong> — PAT is invalid or expired. Showing sample data.
          </p>
        </div>
      )}
      {tfsError && tfsError !== "NO_PAT" && tfsError !== "INVALID_PAT" && !tfsLoading && (
        <div className="mb-5 px-4 py-3 rounded-xl bg-yellow-900/20 border border-yellow-700/40 flex items-start gap-3">
          <svg className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-yellow-300">TFS unreachable — VPN required</p>
            <p className="text-xs text-yellow-500 mt-0.5">Connect to the company VPN, then click <strong>Sync from TFS</strong>. Showing sample data.</p>
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
              <p className="text-xs text-gray-500 mb-1">Total Incidents</p>
              <p className="text-2xl font-bold text-amber-400 tabular-nums">{total.toLocaleString()}</p>
            </div>
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">TFS Records</p>
              <p className="text-2xl font-bold text-indigo-400 tabular-nums">{tfsGroups.length}</p>
            </div>
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Top TFS #</p>
              <p className="text-sm font-bold font-mono text-orange-400 truncate leading-tight mt-1"
                title={tfsGroups[0]?.tfsNumber}>
                {tfsGroups[0]?.tfsNumber ?? "—"}
              </p>
            </div>
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Max Incidents</p>
              <p className="text-2xl font-bold text-green-400 tabular-nums">
                {tfsGroups[0]?.count.toLocaleString() ?? "—"}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Main layout: sidebar + content */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* Left sidebar — CIP Status checkboxes */}
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
                    <label key={status} className="flex items-center gap-2.5 cursor-pointer group"
                      onClick={() => toggleStatus(status)}>
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        checked ? "bg-amber-600 border-amber-500" : "bg-gray-800 border-gray-600 group-hover:border-gray-400"
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
                      }`}>{status}</span>
                    </label>
                  );
                })}
              </div>
            )}
            {selectedStatuses.length === 0 && !loading && (
              <p className="text-xs text-gray-600 mt-3 border-t border-gray-800 pt-2">All statuses shown</p>
            )}
          </div>
        </div>

        {/* Right: dropdowns + chart + table */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* TFS number search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search TFS number… e.g. TFS-81725 or 81725"
              value={tfsSearch}
              onChange={e => setTfsSearch(e.target.value)}
              disabled={loading}
              className="w-full bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg pl-10 pr-10 py-2.5 focus:outline-none focus:border-amber-500 placeholder:text-gray-600 disabled:opacity-50"
            />
            {tfsSearch && (
              <button
                onClick={() => setTfsSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-red-400 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Dropdown filters */}
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <label className="text-xs text-gray-500 font-medium">CIP Type</label>
              <select
                value={selectedType}
                onChange={e => setSelectedType(e.target.value)}
                disabled={cipLoading || usingMock}
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
                disabled={cipLoading || usingMock}
                className="bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500 w-full disabled:opacity-50 cursor-pointer"
              >
                <option value="All">(All Clients)</option>
                {clientNames.map(n => (
                  <option key={n} value={n} className="bg-gray-900">{n}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Date range */}
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
                disabled={cipLoading || usingMock}
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
                disabled={cipLoading || usingMock}
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
                <div className="h-4 w-52 bg-gray-700 rounded animate-pulse" />
                <div className="h-6 w-20 bg-gray-700 rounded-full animate-pulse" />
              </div>
              <div className="h-80 bg-gray-800/50 rounded animate-pulse" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="bg-[#111827] rounded-2xl p-5 border border-gray-800">
              <div className="h-80 flex flex-col items-center justify-center gap-3 text-gray-600">
                <svg className="w-10 h-10 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
                </svg>
                <span className="text-sm">
                  {tfsSearch
                    ? `No TFS records match "${tfsSearch}"`
                    : "No records match the selected filters"}
                </span>
                {hasActiveFilters && (
                  <button onClick={resetFilters}
                    className="text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2">
                    Reset filters
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-[#111827] rounded-2xl p-5 border border-gray-800">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold text-white">Incidents per TFS Record</h3>
                <span className="text-xs font-semibold bg-amber-900/40 text-amber-300 px-2.5 py-1 rounded-full border border-amber-800/60">
                  {total.toLocaleString()} total
                </span>
              </div>
              {visibleGroups.length > CHART_LIMIT && (
                <p className="text-xs text-gray-600 mb-3">
                  Top {CHART_LIMIT} of {visibleGroups.length} TFS records shown · see table below for all
                </p>
              )}
              <ResponsiveContainer width="100%" height={380}>
                <BarChart data={chartData} margin={{ top: 16, right: 16, left: 0, bottom: 110 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                  <XAxis
                    dataKey="tfsNumber"
                    tick={{ fill: "#9CA3AF", fontSize: 11 }}
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={110}
                    tickLine={false}
                    axisLine={{ stroke: "#374151" }}
                  />
                  <YAxis
                    label={{ value: "Incident Count", angle: -90, position: "insideLeft",
                      offset: 10, style: { fill: "#6b7280", fontSize: 11 } }}
                    tick={{ fill: "#9CA3AF", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={60}
                    allowDecimals={false}
                  />
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ fill: "rgba(245,158,11,0.07)" }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={72}
                    fill={ORANGE} fillOpacity={0.9} />
                </BarChart>
              </ResponsiveContainer>
              {usingMock && (
                <p className="text-[10px] text-gray-600 text-center mt-1">
                  Sample data — connect to VPN and click Sync from TFS for live data
                </p>
              )}
            </div>
          )}

          {/* TFS Breakdown table — expandable rows */}
          {!loading && visibleGroups.length > 0 && (
            <div className="bg-[#111827] rounded-2xl border border-gray-800 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 bg-gray-900/50">
                <h3 className="text-sm font-semibold text-white">TFS Breakdown</h3>
                <div className="flex items-center gap-2">
                  {usingMock && (
                    <span className="text-[10px] text-amber-600/70 bg-amber-900/20 border border-amber-700/30 px-2 py-0.5 rounded-full">
                      sample data
                    </span>
                  )}
                  <span className="text-xs text-gray-500">{visibleGroups.length} records</span>
                </div>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-900 border-b border-gray-700">
                    <th className="px-4 py-3 w-8" />
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      TFS Number
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Incident Count
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      % of Total
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Linked INCs
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {visibleGroups.map((row, i) => {
                    const pct     = total > 0 ? (row.count / total) * 100 : 0;
                    const isOpen  = expandedRows.has(row.tfsNumber);
                    const isNoTFS = row.tfsNumber === "(No TFS Linked)";

                    return (
                      <Fragment key={row.tfsNumber}>
                        <tr
                          onClick={() => !usingMock && toggleRow(row.tfsNumber)}
                          className={`transition-colors select-none ${
                            usingMock ? "" : "cursor-pointer hover:bg-amber-900/5"
                          } ${isOpen ? "bg-amber-950/10" : i % 2 === 1 ? "bg-[#1a1f2e]/30" : ""}`}
                        >
                          <td className="pl-4 py-3 w-8">
                            {!usingMock && (
                              <svg
                                className={`w-3.5 h-3.5 text-gray-600 transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}
                                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ background: ORANGE, opacity: isNoTFS ? 0.25 : 1 }}
                              />
                              <span className={`font-mono text-sm ${isNoTFS ? "text-gray-500 italic" : "text-gray-200"}`}>
                                {row.tfsNumber}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right text-gray-300 tabular-nums font-medium">
                            {row.count.toLocaleString()}
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden hidden sm:block">
                                <div className="h-full rounded-full"
                                  style={{ width: `${pct}%`, background: ORANGE, opacity: isNoTFS ? 0.25 : 0.85 }} />
                              </div>
                              <span className="text-gray-500">{pct.toFixed(1)}%</span>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex flex-wrap gap-1">
                              {row.incNums.slice(0, 3).map(n => (
                                <span key={n}
                                  className="text-[10px] font-mono text-indigo-400 bg-indigo-900/20 border border-indigo-800/40 px-1.5 py-0.5 rounded">
                                  {n}
                                </span>
                              ))}
                              {row.incNums.length > 3 && (
                                <span className="text-[10px] text-gray-600 self-center">
                                  +{row.incNums.length - 3} more
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expanded CIP records */}
                        {isOpen && (
                          <Fragment key={`${row.tfsNumber}__exp`}>
                            <tr className="bg-gray-900/60 border-t border-gray-700/50">
                              <td colSpan={5} className="px-0 py-0">
                                <div className="grid grid-cols-[2.5rem_1fr_1fr_1fr_1fr] text-[11px] font-semibold text-gray-500 uppercase tracking-wider pl-12 pr-5 py-2 gap-3">
                                  <span className="col-start-2">INC Number / Date</span>
                                  <span>Client</span>
                                  <span>CIP Type</span>
                                  <span>Status</span>
                                </div>
                              </td>
                            </tr>
                            {row.records.length === 0 ? (
                              <tr className="bg-gray-900/30">
                                <td colSpan={5} className="pl-12 pr-5 py-3 text-xs text-gray-600 italic">
                                  No records available.
                                </td>
                              </tr>
                            ) : (
                              row.records.map(r => (
                                <tr key={r.id}
                                  className="bg-gray-900/30 hover:bg-gray-800/20 transition-colors border-t border-gray-800/40">
                                  <td colSpan={5} className="px-0 py-0">
                                    <div className="grid grid-cols-[2.5rem_1fr_1fr_1fr_1fr] items-center pl-12 pr-5 py-2.5 gap-3">
                                      <div className="col-start-2 flex flex-col gap-0.5 min-w-0">
                                        <span className="text-xs font-mono text-indigo-300 font-semibold truncate">
                                          {r.chrTicketNumbers || "—"}
                                        </span>
                                        <span className="text-[10px] text-gray-600">
                                          {r.submissionDate ? r.submissionDate.slice(0, 10) : "—"}
                                          {r.emergencyFlag && (
                                            <span className="ml-2 text-red-400 font-semibold">EMERGENCY</span>
                                          )}
                                        </span>
                                      </div>
                                      <span className="text-xs text-gray-300 truncate">
                                        {r.clientName || <span className="text-gray-600 italic">—</span>}
                                      </span>
                                      <span className="text-xs text-gray-400 truncate">
                                        {r.cipType || <span className="text-gray-600 italic">—</span>}
                                      </span>
                                      <span>
                                        {r.cipStatus ? (
                                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusBadge(r.cipStatus)}`}>
                                            {r.cipStatus}
                                          </span>
                                        ) : (
                                          <span className="text-gray-600 text-xs italic">—</span>
                                        )}
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              ))
                            )}
                          </Fragment>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-600 bg-gray-900">
                    <td className="px-4 py-3" />
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
