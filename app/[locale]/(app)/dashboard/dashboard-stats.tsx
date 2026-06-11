"use client";

import { trpc } from "@/lib/trpc/client";
import { useTranslations } from "next-intl";
import { UserRole, RequestState } from "@/types";
import Link from "next/link";

interface DashboardStatsProps {
  userId: string;
  role: UserRole;
  locale: string;
}

const STATE_COLORS: Record<string, string> = {
  submitted: "bg-slate-100 text-slate-700",
  pending_pre_legal_approval: "bg-amber-50 text-amber-700",
  pending_legal_assignment: "bg-orange-50 text-orange-700",
  under_legal_review: "bg-blue-50 text-blue-700",
  pending_internal_inputs: "bg-violet-50 text-violet-700",
  ready_to_share: "bg-cyan-50 text-cyan-700",
  returned_with_external_feedback: "bg-yellow-50 text-yellow-800",
  execution_copy_review: "bg-indigo-50 text-indigo-700",
  pending_execution_approval: "bg-pink-50 text-pink-700",
  ready_for_signature: "bg-teal-50 text-teal-700",
  execution_in_progress: "bg-emerald-50 text-emerald-700",
  archived: "bg-slate-100 text-slate-500",
  rejected: "bg-red-50 text-red-700",
  withdrawn: "bg-slate-100 text-slate-400",
};

export function DashboardStats({ userId, role, locale }: DashboardStatsProps) {
  const tStates = useTranslations("states");
  const tRequests = useTranslations("requests");

  const { data, isLoading } = trpc.requests.listMyTasks.useQuery({
    filter: "open",
    limit: 10,
    offset: 0,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-28 rounded-xl bg-white border border-slate-200 animate-pulse"
          />
        ))}
      </div>
    );
  }

  const requests = data?.requests ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-8">
      {/* Summary card */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Open tasks"
          value={total}
          color="blue"
        />
        <StatCard
          label="Pending action"
          value={requests.filter((r) =>
            [
              RequestState.submitted,
              RequestState.pending_pre_legal_approval,
              RequestState.pending_legal_assignment,
              RequestState.execution_copy_review,
              RequestState.pending_execution_approval,
            ].includes(r.state as RequestState)
          ).length}
          color="amber"
        />
        <StatCard
          label="In progress"
          value={requests.filter((r) =>
            [
              RequestState.under_legal_review,
              RequestState.pending_internal_inputs,
              RequestState.ready_to_share,
              RequestState.returned_with_external_feedback,
              RequestState.execution_in_progress,
            ].includes(r.state as RequestState)
          ).length}
          color="emerald"
        />
      </div>

      {/* Task table */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900">My Tasks</h2>
          <Link
            href={`/${locale}/tasks`}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            View all →
          </Link>
        </div>

        {requests.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-16 text-center">
            <p className="text-sm text-slate-400">No open tasks</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wide">
                    {tRequests("referenceNumber")}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wide">
                    {tRequests("title")}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wide">
                    {tRequests("status")}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wide">
                    {tRequests("priority")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/${locale}/requests/${req.id}`}
                        className="font-mono text-xs text-blue-600 hover:text-blue-700"
                      >
                        {req.reference_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="truncate text-slate-900 font-medium">{req.title}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          STATE_COLORS[req.state] ?? "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {tStates(req.state as keyof typeof tStates)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <PriorityBadge priority={req.priority} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "blue" | "amber" | "emerald";
}) {
  const colorClass = {
    blue: "bg-blue-600 text-white",
    amber: "bg-amber-500 text-white",
    emerald: "bg-emerald-600 text-white",
  }[color];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-slate-900">{value}</p>
      <div className={`mt-3 h-1 rounded-full ${colorClass} opacity-30`} />
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    critical: "bg-red-100 text-red-700",
    high: "bg-orange-100 text-orange-700",
    normal: "bg-slate-100 text-slate-600",
    low: "bg-slate-50 text-slate-400",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        map[priority] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {priority}
    </span>
  );
}
