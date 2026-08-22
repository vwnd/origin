import { Fragment, useCallback, useEffect, useState } from "react";
import { ArrowUpRight, ChevronRight, RefreshCw } from "lucide-react";
import { api, type Issue } from "@/lib/api";
import { parseFindings, type ParsedFinding } from "@/lib/findings";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";

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

const SEVERITY_DOT: Record<ParsedFinding["severity"], string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-muted-foreground/40"
};

/**
 * The findings of one issue, shown inline.
 *
 * Deliberately dense: the counts are the argument — "1 object says this, 500
 * say that" — so they lead each evidence chip and the prose stays to one line.
 */
function FindingList({ findings }: { findings: ParsedFinding[] }) {
  if (findings.length === 0) {
    return (
      <p className="px-4 py-4 text-sm text-muted-foreground">
        No findings recorded in this issue.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {findings.map((finding) => (
        <li key={finding.index} className="flex gap-3 px-4 py-2.5">
          <span
            className={cn(
              "mt-1.5 size-2 shrink-0 rounded-full",
              SEVERITY_DOT[finding.severity]
            )}
            title={finding.severity}
          />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm leading-snug">{finding.summary}</p>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              {finding.parameter ? (
                <span
                  className="font-mono text-muted-foreground"
                  title={finding.keyPath ?? undefined}
                >
                  {finding.parameter}
                </span>
              ) : null}

              {finding.evidence.map((item) => (
                <span
                  key={`${item.value}-${item.count}`}
                  className="rounded bg-muted px-1.5 py-0.5 font-mono"
                >
                  <span className="text-muted-foreground">{item.count}x</span>{" "}
                  {item.value || "(empty)"}
                </span>
              ))}

              {finding.suggestion ? (
                <span className="text-emerald-600">{finding.suggestion}</span>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Inbox({ refreshKey }: { refreshKey: number }) {
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

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
                <TableHead className="w-8" />
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
                const findings = parseFindings(issue.rawDescription);
                const isOpen = expanded === issue.id;
                return (
                  <Fragment key={issue.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setExpanded(isOpen ? null : issue.id)}
                    >
                      <TableCell>
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-label={`${isOpen ? "Hide" : "Show"} findings for ${issue.identifier}`}
                          className="flex items-center text-muted-foreground"
                        >
                          <ChevronRight
                            className={cn(
                              "size-4 transition-transform",
                              isOpen && "rotate-90"
                            )}
                          />
                        </button>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {issue.identifier}
                      </TableCell>
                      <TableCell className="font-medium">
                        {issue.title ?? "Untitled"}
                      </TableCell>
                      <TableCell>
                        {findings.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <Badge variant="secondary">{findings.length}</Badge>
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
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex items-center text-muted-foreground hover:text-foreground"
                            aria-label={`Open ${issue.identifier} in Speckle`}
                          >
                            <ArrowUpRight className="size-4" />
                          </a>
                        ) : null}
                      </TableCell>
                    </TableRow>

                    {isOpen ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={7} className="bg-muted/30 p-0">
                          <FindingList findings={findings} />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
