import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { api, type Issue } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/primitives";

const SPECKLE_BASE = "https://app.speckle.systems";

function statusVariant(status: string) {
  if (status === "resolved") return "success" as const;
  if (status === "readyForReview") return "warning" as const;
  return "outline" as const;
}

function relativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Findings counted from the issue body.
 *
 * Scout writes numbered lines, so this reads the highest number rather than
 * counting matches — a wrapped line would inflate a naive count.
 */
function findingCount(raw: string | null): number | null {
  if (!raw) return null;
  const numbers = [...raw.matchAll(/^(\d+)\.\s+\[/gm)].map((m) => Number(m[1]));
  return numbers.length ? Math.max(...numbers) : null;
}

export function Inbox({ refreshKey }: { refreshKey: number }) {
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const data = await api.listIssues();
      setIssues(data.issues);
      setProjectId(data.projectId);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, []);

  // refreshKey changes when a run completes, so the table follows the pipeline.
  // The effect only kicks off the fetch; state lands in the async callback,
  // not synchronously during the effect.
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load, refreshKey]);

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
          <p className="text-sm text-muted-foreground">
            Issues Scout has filed on this project.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={busy}>
          <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} />
          Refresh
        </Button>
      </header>

      <Card>
        {error ? (
          <EmptyState
            title="Could not load issues"
            detail={error}
            action={
              <Button size="sm" variant="outline" onClick={load}>
                Try again
              </Button>
            }
          />
        ) : issues === null ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} className="h-10 w-full" />
            ))}
          </div>
        ) : issues.length === 0 ? (
          <EmptyState
            title="No issues yet"
            detail="Publish a model version and Scout will inspect it."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Issue</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="w-28">Findings</TableHead>
                <TableHead className="w-32">Status</TableHead>
                <TableHead className="w-28">Created</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {issues.map((issue) => {
                const findings = findingCount(issue.rawDescription);
                return (
                  <TableRow key={issue.id}>
                    <TableCell className="font-mono text-xs">
                      {issue.identifier}
                    </TableCell>
                    <TableCell className="font-medium">
                      {issue.title ?? "Untitled"}
                    </TableCell>
                    <TableCell>
                      {findings === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Badge variant="secondary">{findings}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(issue.status)}>
                        {issue.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {relativeTime(issue.createdAt)}
                    </TableCell>
                    <TableCell>
                      {projectId ? (
                        <a
                          href={`${SPECKLE_BASE}/projects/${projectId}/issues/${issue.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center text-muted-foreground hover:text-foreground"
                          aria-label={`Open ${issue.identifier} in Speckle`}
                        >
                          <ArrowUpRight className="size-4" />
                        </a>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
