"use client";

import { useEffect, useState } from "react";
import type { FeedbackListItem } from "@/lib/feedback/types";
import {
  BUG_ADMIN_STATUSES,
  BUG_STATUS_LABELS,
  FeedbackType,
  IMPROVEMENT_ADMIN_STATUSES,
  IMPROVEMENT_STATUS_LABELS,
  isOpenFeedbackStatus,
} from "@/lib/feedback/types";
import { formatDate } from "@/lib/format";

type Props = {
  initialItems: FeedbackListItem[];
  type: typeof FeedbackType.BUG | typeof FeedbackType.IMPROVEMENT;
  showVote?: boolean;
  adminMode?: boolean;
};

function authorLabel(item: FeedbackListItem): string {
  return item.createdBy.name?.trim() || item.createdBy.email;
}

function statusBadgeClass(status: string, open: boolean): string {
  if (!open) return "bg-slate-100 text-slate-600";
  if (status === "IN_PROGRESS") return "bg-amber-50 text-amber-800";
  return "bg-ifk-blue-pale text-ifk-blue";
}

export function FeedbackList({
  initialItems,
  type,
  showVote = false,
  adminMode = false,
}: Props) {
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState<"open" | "closed">("open");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const statusOptions =
    type === FeedbackType.BUG ? BUG_ADMIN_STATUSES : IMPROVEMENT_ADMIN_STATUSES;
  const statusLabels =
    type === FeedbackType.BUG ? BUG_STATUS_LABELS : IMPROVEMENT_STATUS_LABELS;

  const visibleItems = items.filter((item) =>
    filter === "open" ? isOpenFeedbackStatus(item.status) : !isOpenFeedbackStatus(item.status),
  );

  async function reload() {
    const res = await fetch(`/api/feedback?type=${type}&status=all`);
    if (!res.ok) return;
    const data = (await res.json()) as { items: FeedbackListItem[] };
    setItems(data.items);
  }

  async function handleVote(id: string) {
    setLoadingId(id);
    setError(null);
    const res = await fetch(`/api/feedback/${id}/vote`, { method: "POST" });
    setLoadingId(null);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Kunde inte rösta");
      return;
    }
    const updated = (await res.json()) as FeedbackListItem;
    setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
  }

  async function handleAdminUpdate(id: string, status: string, adminComment: string) {
    setLoadingId(id);
    setError(null);
    const res = await fetch(`/api/feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, adminComment: adminComment || null }),
    });
    setLoadingId(null);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Kunde inte uppdatera");
      return;
    }
    const updated = (await res.json()) as FeedbackListItem;
    setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFilter("open")}
          className={`rounded-lg px-3 py-1.5 text-sm transition ${
            filter === "open"
              ? "bg-ifk-blue text-white"
              : "border border-slate-300 text-slate-700 hover:border-ifk-blue"
          }`}
        >
          Öppna
        </button>
        <button
          type="button"
          onClick={() => setFilter("closed")}
          className={`rounded-lg px-3 py-1.5 text-sm transition ${
            filter === "closed"
              ? "bg-ifk-blue text-white"
              : "border border-slate-300 text-slate-700 hover:border-ifk-blue"
          }`}
        >
          Avslutade
        </button>
        <button
          type="button"
          onClick={() => void reload()}
          className="ml-auto text-sm text-slate-500 hover:text-ifk-blue"
        >
          Uppdatera
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {visibleItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          {filter === "open"
            ? "Inga öppna poster just nu."
            : "Inga avslutade poster att visa."}
        </div>
      ) : (
        <ul className="space-y-3">
          {visibleItems.map((item) => (
            <li key={item.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-slate-900">{item.title}</h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(item.status, isOpenFeedbackStatus(item.status))}`}
                    >
                      {item.statusLabel}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                    {item.description}
                  </p>
                  {item.stepsToReproduce && (
                    <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      <p className="font-medium text-slate-900">Steg för att återskapa</p>
                      <p className="mt-1 whitespace-pre-wrap">{item.stepsToReproduce}</p>
                    </div>
                  )}
                  {item.adminComment && (
                    <div className="mt-3 rounded-lg border border-ifk-blue/20 bg-ifk-blue-pale px-3 py-2 text-sm text-ifk-blue">
                      <p className="font-medium">Admin</p>
                      <p className="mt-1 whitespace-pre-wrap">{item.adminComment}</p>
                    </div>
                  )}
                  <p className="mt-3 text-xs text-slate-500">
                    {authorLabel(item)} · {formatDate(item.createdAt)}
                    {item.reviewedAt && item.reviewedBy
                      ? ` · Kvitterad ${formatDate(item.reviewedAt)} av ${item.reviewedBy.name?.trim() || item.reviewedBy.email}`
                      : ""}
                  </p>
                </div>

                {showVote && isOpenFeedbackStatus(item.status) && (
                  <button
                    type="button"
                    disabled={loadingId === item.id}
                    onClick={() => void handleVote(item.id)}
                    className={`flex shrink-0 flex-col items-center rounded-lg border px-3 py-2 text-sm transition disabled:opacity-50 ${
                      item.hasVoted
                        ? "border-ifk-blue bg-ifk-blue text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:border-ifk-blue hover:text-ifk-blue"
                    }`}
                    title={item.hasVoted ? "Ta bort röst" : "Rösta"}
                  >
                    <span aria-hidden>👍</span>
                    <span className="mt-1 font-medium">{item.voteCount}</span>
                  </button>
                )}
              </div>

              {adminMode && isOpenFeedbackStatus(item.status) && (
                <AdminReviewForm
                  itemId={item.id}
                  loading={loadingId === item.id}
                  statusOptions={statusOptions}
                  statusLabels={statusLabels}
                  onSubmit={handleAdminUpdate}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AdminReviewForm({
  itemId,
  loading,
  statusOptions,
  statusLabels,
  onSubmit,
}: {
  itemId: string;
  loading: boolean;
  statusOptions: readonly string[];
  statusLabels: Record<string, string>;
  onSubmit: (id: string, status: string, adminComment: string) => Promise<void>;
}) {
  const [status, setStatus] = useState(statusOptions[0] ?? "");
  const [adminComment, setAdminComment] = useState("");

  return (
    <form
      className="mt-4 border-t border-slate-200 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit(itemId, status, adminComment);
      }}
    >
      <p className="text-sm font-medium text-slate-900">Kvittera</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="form-select">
          {statusOptions.map((opt) => (
            <option key={opt} value={opt}>
              {statusLabels[opt] ?? opt}
            </option>
          ))}
        </select>
        <input
          value={adminComment}
          onChange={(e) => setAdminComment(e.target.value)}
          className="form-input"
          placeholder="Valfri kommentar till avsändaren"
        />
      </div>
      <button type="submit" disabled={loading} className="btn-primary mt-3">
        {loading ? "Sparar…" : "Spara status"}
      </button>
    </form>
  );
}
