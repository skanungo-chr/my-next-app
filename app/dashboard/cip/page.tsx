"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { CIPRecord } from "@/lib/cip";
import StatusFilter from "@/components/StatusFilter";

const STATUS_COLORS: Record<string, string> = {
  open:          "bg-blue-900/40 text-blue-300",
  "in progress": "bg-yellow-900/40 text-yellow-300",
  completed:     "bg-green-900/40 text-green-300",
  closed:        "bg-gray-700 text-gray-400",
};

function statusClass(status: string) {
  return STATUS_COLORS[status.toLowerCase()] ?? "bg-gray-700 text-gray-400";
}

const PAGE_SIZE_OPTIONS = [10, 25, 50];

export default function CIPPage() {
  const { msAccessToken, role } = useAuth();
  const isAdmin = role === "admin";

  const [cipRecords, setCipRecords]     = useState<CIPRecord[]>([]);
  const [cipLoading, setCipLoading]     = useState(false);
  const [cipError, setCipError]         = useState("");
  const [syncing, setSyncing]           = useState(false);
  const [seeding, setSeeding]           = useState(false);
  const [lastSynced, setLastSynced]     = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType]     = useState("");
  const [debugResult, setDebugResult]   = useState<string | null>(null);

  // Pagination
  const [page, setPage]           = useState(1);
  const [pageSize, setPageSize]   = useState(10);

  useEffect(() => { fetchCIPRecords(); }, []);

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1); }, [filterStatus, filterType]);

  const authHeaders = (): Record<string, string> =>
    msAccessToken ? { Authorization: `Bearer ${msAccessToken}` } : {};

  const fetchCIPRecords = async () => {
    setCipLoading(true);
    setCipError("");
    try {
      const res  = await fetch("/api/cip", { headers: authHeaders() });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setCipRecords(data.records);
    } catch (err) {
      setCipError(err instanceof Error ? err.message : "Failed to load CIP records");
    } finally {
      setCipLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setCipError("");
    try {
      const res  = await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() } });
      const data = await res.json();
      if (!data.success && !data.synced) throw new Error(data.error);
      setLastSynced(new Date().toLocaleTimeString());
      await fetchCIPRecords();
    } catch (err) {
      setCipError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    setCipError("");
    try {
      const res  = await fetch("/api/seed", { method: "POST" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await fetchCIPRecords();
    } catch (err) {
      setCipError(err instanceof Error ? err.message : "Seed failed");
    } finally {
      setSeeding(false);
    }
  };

  const handleDebug = async () => {
    setDebugResult("Running...");
    try {
      const res  = await fetch("/api/cip/debug", { headers: authHeaders() });
      const data = await res.json();
      setDebugResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setDebugResult(err instanceof Error ? err.message : "Debug failed");
    }
  };

  const uniqueStatuses = [...new Set(cipRecords.map((r) => r.cipStatus).filter(Boolean))];
  const uniqueTypes    = [...new Set(cipRecords.map((r) => r.cipType).filter(Boolean))];

  const filteredCIP = cipRecords.filter((r) => {
    const matchStatus = filterStatus ? r.cipStatus.toLowerCase() === filterStatus.toLowerCase() : true;
    const matchType   = filterType   ? r.cipType.toLowerCase()   === filterType.toLowerCase()   : true;
    return matchStatus && matchType;
  });

  const totalPages  = Math.max(1, Math.ceil(filteredCIP.length / pageSize));
  const safePage    = Math.min(page, totalPages);
  const pageStart   = (safePage - 1) * pageSize;
  const pageRecords = filteredCIP.slice(pageStart, pageStart + pageSize);

  // Page numbers to show (max 5 around current)
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1
  );

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <StatusFilter
          statuses={uniqueStatuses}
          value={filterStatus}
          onChange={setFilterStatus}
        />

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-sm text-white rounded-lg px-3 py-2 focus:outline-none"
        >
          <option value="">All Types</option>
          {uniqueTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <div className="ml-auto flex items-center gap-3">
          {lastSynced && <span className="text-xs text-gray-500">Last synced: {lastSynced}</span>}
          {isAdmin && (
            <button onClick={handleSync} disabled={syncing}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              {syncing ? "Syncing..." : "Sync from SharePoint"}
            </button>
          )}
          <button onClick={fetchCIPRecords} disabled={cipLoading}
            className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-sm px-4 py-2 rounded-lg transition-colors">
            {cipLoading ? "Loading..." : "Refresh"}
          </button>
          {isAdmin && (
            <button onClick={handleSeed} disabled={seeding}
              className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-xs px-3 py-2 rounded-lg transition-colors text-gray-400">
              {seeding ? "Seeding..." : "Seed Data"}
            </button>
          )}
          {isAdmin && (
            <button onClick={handleDebug}
              className="bg-gray-700 hover:bg-gray-600 text-xs px-3 py-2 rounded-lg transition-colors text-gray-400">
              Debug
            </button>
          )}
        </div>
      </div>

      {debugResult && (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold text-gray-400">Debug Output</span>
            <button onClick={() => setDebugResult(null)} className="text-xs text-gray-500 hover:text-gray-300">Close</button>
          </div>
          <pre className="text-xs text-green-400 overflow-auto max-h-64 whitespace-pre-wrap">{debugResult}</pre>
        </div>
      )}

      {cipError && (
        <div className="bg-red-900/30 border border-red-700 text-red-400 text-sm rounded-lg px-4 py-3 mb-4">
          {cipError}
        </div>
      )}

      {cipLoading ? (
        <p className="text-center text-gray-500 py-16">Loading CIP records...</p>
      ) : filteredCIP.length === 0 ? (
        <p className="text-center text-gray-600 py-16">
          {cipRecords.length === 0
            ? <>No CIP records found. Click &quot;Seed Data&quot; or &quot;Sync from SharePoint&quot; to load data.</>
            : "No records match your filters."}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900 text-gray-400 text-left">
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">CHR Ticket #</th>
                  <th className="px-4 py-3 font-medium">CIP Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Submission Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {pageRecords.map((record, idx) => (
                  <tr key={record.id} className="hover:bg-gray-900/60 transition-colors">
                    <td className="px-4 py-3 text-gray-600 tabular-nums">{pageStart + idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-white">{record.chrTicketNumbers || "—"}</td>
                    <td className="px-4 py-3 text-gray-300">{record.cipType || "—"}</td>
                    <td className="px-4 py-3">
                      {record.cipStatus ? (
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusClass(record.cipStatus)}`}>
                          {record.cipStatus}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {record.submissionDate ? new Date(record.submissionDate).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Footer: count + page-size picker */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border-t border-gray-800">
              <span className="text-xs text-gray-500">
                {filteredCIP.length} record{filteredCIP.length !== 1 ? "s" : ""}
                {filteredCIP.length !== cipRecords.length && ` (filtered from ${cipRecords.length})`}
                {msAccessToken ? " · Delegated access" : ""}
              </span>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="bg-gray-800 border border-gray-700 text-white rounded px-2 py-1 focus:outline-none"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1 mt-4">
              {/* Prev */}
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ‹ Prev
              </button>

              {pageNumbers.map((n, i) => {
                const prev = pageNumbers[i - 1];
                return (
                  <span key={n} className="flex items-center gap-1">
                    {prev && n - prev > 1 && (
                      <span className="px-1 text-gray-600 text-sm select-none">…</span>
                    )}
                    <button
                      onClick={() => setPage(n)}
                      className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                        n === safePage
                          ? "bg-indigo-600 text-white"
                          : "text-gray-400 hover:text-white hover:bg-gray-800"
                      }`}
                    >
                      {n}
                    </button>
                  </span>
                );
              })}

              {/* Next */}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next ›
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
