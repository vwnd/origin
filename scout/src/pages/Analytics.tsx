import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { api, type RunRecord } from "@/lib/api";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/primitives";

/** Polled only while something is in flight; live events cover the rest. */
const ACTIVE_POLL_MS = 3000;
const IDLE_POLL_MS = 20000;

const RUNNING_STATUSES = new Set(["running", "inspecting"]);

function statusBadge(status: string) {
  if (RUNNING_STATUSES.has(status)) {
    return (
      <Badge variant="warning" className="gap-1">
        <Loader2 className="size-3 animate-spin" />
        {status}
      </Badge>
    );
  }
  if (status === "complete") {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="size-3" />
        complete
      </Badge>
    );
  }
  if (status === "no_findings") return <Badge variant="secondary">clean</Badge>;
  return (
    <Badge variant="danger" className="gap-1">
      <CircleAlert className="size-3" />
      {status}
    </Badge>
  );
}

function duration(run: RunRecord): string {
  const end = run.finishedAt ? new Date(run.finishedAt) : new Date();
  const seconds = Math.max(
    0,
    Math.round((end.getTime() - new Date(run.startedAt).getTime()) / 1000)
  );
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function Analytics({ refreshKey }: { refreshKey: number }) {
  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const load = useCallback(async () => {
    try {
      const data = await api.listRuns();
      setRuns(data.runs);
      setError(null);
      return data.runs;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return [];
    }
  }, []);

  // Self-scheduling poll: the interval depends on the result, so this reschedules
  // after each response rather than running on a fixed timer.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const current = await load();
      if (cancelled) return;
      const active = current.some((run) => RUNNING_STATUSES.has(run.status));
      timer.current = setTimeout(tick, active ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load, refreshKey]);

  const totals = (runs ?? []).reduce(
    (acc, run) => ({
      runs: acc.runs + 1,
      findings: acc.findings + (run.findings ?? 0),
      deltas: acc.deltas + (run.deltas ?? 0),
      cost: acc.cost + (run.costUsd ?? 0)
    }),
    { runs: 0, findings: 0, deltas: 0, cost: 0 }
  );

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Inspection runs, updated live while one is in flight.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Runs", value: totals.runs },
          { label: "Findings", value: totals.findings },
          { label: "Proposed edits", value: totals.deltas },
          { label: "Spend", value: `$${totals.cost.toFixed(2)}` }
        ].map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">
                {stat.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        {error ? (
          <EmptyState title="Could not load runs" detail={error} />
        ) : runs === null ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-10 w-full" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <EmptyState
            title="No runs yet"
            detail="Publish a model version to start the pipeline."
            action={<Activity className="mt-2 size-5 text-muted-foreground" />}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Status</TableHead>
                <TableHead>Model</TableHead>
                <TableHead className="w-24">Version</TableHead>
                <TableHead className="w-24">Objects</TableHead>
                <TableHead className="w-24">Findings</TableHead>
                <TableHead className="w-20">Edits</TableHead>
                <TableHead className="w-24">Issue</TableHead>
                <TableHead className="w-20">Cost</TableHead>
                <TableHead className="w-20">Took</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.instanceId}>
                  <TableCell>{statusBadge(run.status)}</TableCell>
                  <TableCell
                    className="max-w-[220px] truncate font-medium"
                    title={run.error ?? undefined}
                  >
                    {run.modelName ?? "—"}
                    {run.error ? (
                      <span className="ml-2 text-xs text-red-500">
                        {run.error.slice(0, 60)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {run.versionId}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {run.indexedObjects?.toLocaleString() ?? "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {run.findings ?? "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {run.deltas ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {run.issueIdentifier ?? "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {run.costUsd ? `$${run.costUsd.toFixed(2)}` : "—"}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {duration(run)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
