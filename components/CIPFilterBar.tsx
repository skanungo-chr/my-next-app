"use client";

import FilterDropdown from "@/components/FilterDropdown";
import DateRangeFilter, { DateRange } from "@/components/DateRangeFilter";
import { FETCH_FROM_YEARS } from "@/lib/cip";

interface StatusOption { value: string; label: string; dot?: string; }
interface TypeOption   { value: string; label: string; }

export interface CIPFilterBarProps {
  // Filter state
  filterStatus:         string[];
  filterType:           string[];
  filterClient:         string;
  filterEnvironments:   string[];
  dateRange:            DateRange;
  syncFromYear:         string;

  // Dropdown options
  statusOptions:  StatusOption[];
  typeOptions:    TypeOption[];
  uniqueClients:  string[];
  clientCounts:   Record<string, number>;

  // Counts & loading
  cipRecordsCount: number;
  filteredCount:   number;
  cipLoading:      boolean;

  // Admin state
  isAdmin:       boolean;
  syncing:       boolean;
  seeding:       boolean;
  syncProgress:  { synced: number; total: number } | null;
  syncSummary:   { synced: number; failed: number } | null;
  lastSynced:    string | null;

  // Filter handlers
  onFilterStatusChange:       (v: string[]) => void;
  onFilterTypeChange:         (v: string[]) => void;
  onFilterClientChange:       (v: string)   => void;
  onFilterEnvironmentsChange: (v: string[]) => void;
  onDateRangeChange:          (v: DateRange) => void;
  onSyncFromYearChange:       (v: string)   => void;
  onClearFilters:             ()            => void;

  // Action handlers
  onSync:           () => void;
  onExportCSV:      () => void;
  onSeed:           () => void;
  onDebug:          () => void;
  onCheckProducts:  () => void;
}

export default function CIPFilterBar({
  filterStatus, filterType, filterClient, filterEnvironments,
  dateRange, syncFromYear,
  statusOptions, typeOptions, uniqueClients, clientCounts,
  cipRecordsCount, filteredCount, cipLoading,
  isAdmin, syncing, seeding, syncProgress, syncSummary, lastSynced,
  onFilterStatusChange, onFilterTypeChange, onFilterClientChange,
  onFilterEnvironmentsChange,
  onDateRangeChange, onSyncFromYearChange,
  onClearFilters, onSync, onExportCSV, onSeed, onDebug, onCheckProducts,
}: CIPFilterBarProps) {
  const hasFilters =
    filterStatus.length > 0 || filterType.length > 0 ||
    filterClient || filterEnvironments.length > 0 ||
    dateRange.from || dateRange.to;

  return (
    <div className="sticky top-0 z-20 bg-[#0f1117] py-3 border-b border-white/10 -mx-6 px-6 mb-4">
      <div className="flex flex-wrap items-center gap-3">

        {/* Status */}
        <FilterDropdown
          multi
          label="Status"
          options={statusOptions}
          value={filterStatus}
          onChange={onFilterStatusChange}
        />

        {/* CIP Type */}
        <FilterDropdown
          multi
          label="CIP Type"
          options={typeOptions}
          value={filterType}
          onChange={onFilterTypeChange}
        />

        {/* Environment */}
        <FilterDropdown
          multi
          label="Environment"
          options={[
            { value: "Development", label: "Development" },
            { value: "Production",  label: "Production"  },
            { value: "QA",          label: "QA"          },
            { value: "Research",    label: "Research"    },
            { value: "Staging",     label: "Staging"     },
            { value: "Test",        label: "Test"        },
          ]}
          value={filterEnvironments}
          onChange={onFilterEnvironmentsChange}
        />

        {/* All Clients */}
        <div className="relative">
          <select
            value={filterClient}
            onChange={(e) => onFilterClientChange(e.target.value)}
            className={`appearance-none pl-3 pr-8 py-2 rounded-lg border text-sm transition-colors focus:outline-none cursor-pointer ${
              filterClient
                ? "bg-indigo-600/15 border-indigo-500/40 text-indigo-300"
                : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600 hover:text-white"
            }`}
          >
            <option value="">All Clients</option>
            {uniqueClients.map((c) => (
              <option key={c} value={c} className="bg-gray-900 text-white">
                {c} ({clientCounts[c] ?? 0})
              </option>
            ))}
          </select>
          <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* Date Range */}
        <DateRangeFilter value={dateRange} onChange={onDateRangeChange} />

{/* Record count badge */}
        {cipRecordsCount > 0 && (
          <span className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
            filteredCount === cipRecordsCount
              ? "bg-gray-800 border-gray-700 text-gray-400"
              : "bg-indigo-600/15 border-indigo-500/30 text-indigo-300"
          }`}>
            {filteredCount === cipRecordsCount
              ? `${cipRecordsCount} record${cipRecordsCount !== 1 ? "s" : ""}`
              : `${filteredCount} of ${cipRecordsCount}`}
          </span>
        )}

        {/* Clear filters */}
        {hasFilters && (
          <button
            onClick={onClearFilters}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors underline underline-offset-2"
          >
            Clear filters
          </button>
        )}

        {/* Right-side actions */}
        <div className="ml-auto flex items-center gap-3">
          {syncSummary && !syncing && (
            <span className="text-xs text-green-400">
              Sync complete: {syncSummary.synced.toLocaleString()} synced
              {syncSummary.failed > 0 && (
                <span className="text-red-400">, {syncSummary.failed} failed</span>
              )}
            </span>
          )}
          {lastSynced && !syncSummary && (
            <span className="text-xs text-gray-500">Last synced: {lastSynced}</span>
          )}

          {isAdmin && (
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-2">
                {/* From year selector */}
                <div className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5">
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <select
                    value={syncFromYear}
                    onChange={(e) => onSyncFromYearChange(e.target.value)}
                    disabled={syncing}
                    className="bg-transparent text-xs text-gray-300 outline-none cursor-pointer disabled:opacity-50"
                  >
                    {Object.keys(FETCH_FROM_YEARS).map((y) => (
                      <option key={y} value={y} className="bg-gray-900">
                        {y === "All" ? "All Records" : `From ${y}`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sync button */}
                <button
                  onClick={onSync}
                  disabled={syncing}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium px-4 py-2 rounded-lg transition-colors min-w-[160px] text-center"
                >
                  {syncing && syncProgress
                    ? `Syncing... ${syncProgress.synced.toLocaleString()} / ${syncProgress.total.toLocaleString()} (${Math.round((syncProgress.synced / Math.max(syncProgress.total, 1)) * 100)}%)`
                    : syncing ? "Syncing..."
                    : "Sync from SharePoint"}
                </button>
              </div>

              {/* Sync progress bar */}
              {syncing && syncProgress && (
                <div className="w-full h-1 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-300"
                    style={{ width: `${Math.round((syncProgress.synced / Math.max(syncProgress.total, 1)) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Export CSV */}
          <button
            onClick={onExportCSV}
            className="bg-emerald-700 hover:bg-emerald-600 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Export CSV
          </button>

          {/* Ready / Loading dot */}
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-400">
            <span className={`w-1.5 h-1.5 rounded-full ${cipLoading ? "bg-yellow-400 animate-pulse" : "bg-green-400"}`} />
            {cipLoading ? "Loading..." : "Ready"}
          </div>

          {isAdmin && (
            <button onClick={onSeed} disabled={seeding}
              className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-xs px-3 py-2 rounded-lg transition-colors text-gray-400">
              {seeding ? "Seeding..." : "Seed Data"}
            </button>
          )}
          {isAdmin && (
            <button onClick={onDebug}
              className="bg-gray-700 hover:bg-gray-600 text-xs px-3 py-2 rounded-lg transition-colors text-gray-400">
              Debug
            </button>
          )}
          {isAdmin && (
            <button onClick={onCheckProducts}
              className="bg-gray-700 hover:bg-gray-600 text-xs px-3 py-2 rounded-lg transition-colors text-amber-400">
              Check SP Products
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
