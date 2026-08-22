import { useCallback, useEffect, useState } from "react";
import MDEditor from "@uiw/react-md-editor";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type Scout, type ScoutMeta } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

const NEW_SCOUT_BODY = `Describe what this scout should look for.

## What you are looking for

State the problem plainly, with an example of a value that is wrong and why.

## What is NOT a finding

Be explicit about legitimate variation, so the scout does not report it.
`;

/** Green when the scout runs on each publish, grey when it is switched off. */
function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "size-2 shrink-0 rounded-full",
        active ? "bg-emerald-500" : "bg-muted-foreground/40"
      )}
      title={active ? "Active" : "Inactive"}
    />
  );
}

type Draft = {
  id: string;
  title: string;
  body: string;
  enabled: boolean;
};

/**
 * Scouts — the instruction set, edited as markdown.
 *
 * The body is prose an LLM reads, so the editor is markdown with live preview
 * rather than a rich-text surface: what you write is exactly what the model
 * receives, with no serialisation step in between to distort it.
 */
export function Scouts() {
  const [list, setList] = useState<ScoutMeta[] | null>(null);
  const [selected, setSelected] = useState<Scout | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadList = useCallback(async () => {
    try {
      const data = await api.listScouts();
      setList(data.scouts);
      return data.scouts;
    } catch (cause) {
      toast.error("Could not load scouts", {
        description: cause instanceof Error ? cause.message : String(cause)
      });
      setList([]);
      return [];
    }
  }, []);

  const open = useCallback(async (id: string) => {
    try {
      const { scout } = await api.getScout(id);
      setSelected(scout);
      setIsNew(false);
      setDraft({
        id: scout.id,
        title: scout.title,
        body: scout.body,
        enabled: scout.enabled
      });
    } catch (cause) {
      toast.error("Could not open scout", {
        description: cause instanceof Error ? cause.message : String(cause)
      });
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const scouts = await loadList();
      if (scouts.length > 0) await open(scouts[0].id);
    })();
  }, [loadList, open]);

  const startNew = () => {
    setSelected(null);
    setIsNew(true);
    setDraft({ id: "", title: "", body: NEW_SCOUT_BODY, enabled: true });
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.title.trim()) {
      toast.error("A title is required");
      return;
    }
    setSaving(true);
    try {
      {
        const saved = isNew
          ? await api.createScout({
              // Fall back to the title so the author need not invent a slug;
              // the server normalises whatever arrives.
              id: draft.id.trim() || draft.title,
              title: draft.title,
              body: draft.body,
              enabled: draft.enabled
            })
          : await api.updateScout(draft.id, {
              title: draft.title,
              body: draft.body,
              enabled: draft.enabled
            });

        toast.success(isNew ? "Scout created" : "Saved", {
          description: saved.scout.enabled
            ? "It will run on the next published version."
            : "Inactive — it will be skipped."
        });
        setIsNew(false);
        setSelected(saved.scout);
        setDraft((current) =>
          current ? { ...current, id: saved.scout.id } : current
        );
        await loadList();
      }
    } catch (cause) {
      toast.error("Could not save", {
        description: cause instanceof Error ? cause.message : String(cause)
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selected) return;
    if (!confirm(`Delete "${selected.title}"?`)) return;
    try {
      {
        await api.deleteScout(selected.id);
        toast.success("Scout deleted");
        setSelected(null);
        setDraft(null);
        const scouts = await loadList();
        if (scouts.length > 0) await open(scouts[0].id);
      }
    } catch (cause) {
      toast.error("Could not delete", {
        description: cause instanceof Error ? cause.message : String(cause)
      });
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Scouts</h1>
          <p className="text-sm text-muted-foreground">
            Each scout is an instruction run against every published version.
          </p>
        </div>
        <Button size="sm" onClick={startNew}>
          <Plus className="size-4" />
          New scout
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <Card className="h-fit p-2">
          {list === null ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : list.length === 0 && !isNew ? (
            <EmptyState title="No scouts yet" />
          ) : (
            <nav className="flex flex-col gap-0.5">
              {list.map((scout) => (
                <button
                  key={scout.id}
                  onClick={() => open(scout.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                    selected?.id === scout.id && "bg-accent"
                  )}
                >
                  <StatusDot active={scout.enabled} />
                  <span className="truncate">{scout.title}</span>
                </button>
              ))}
            </nav>
          )}
        </Card>

        {draft ? (
          <Card className="p-5">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  value={draft.title}
                  placeholder="Scout name"
                  className="h-10 flex-1 border-0 px-0 text-base font-medium shadow-none focus-visible:ring-0"
                  onChange={(event) =>
                    setDraft({ ...draft, title: event.target.value })
                  }
                />
                <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <StatusDot active={draft.enabled} />
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(event) =>
                      setDraft({ ...draft, enabled: event.target.checked })
                    }
                    className="sr-only"
                  />
                  {draft.enabled ? "Active" : "Inactive"}
                </label>
              </div>

              <div
                data-color-mode="light"
                className="overflow-hidden rounded-md border border-border"
              >
                <MDEditor
                  value={draft.body}
                  height={480}
                  preview="edit"
                  onChange={(value) =>
                    setDraft({ ...draft, body: value ?? "" })
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Given to the model verbatim. Say what is <em>not</em> a
                  finding — it is what keeps false positives down.
                </p>
                <div className="flex shrink-0 gap-2">
                  {selected && !isNew && (
                    <Button variant="ghost" size="sm" onClick={remove}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                  <Button size="sm" onClick={save} disabled={saving}>
                    {saving ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <Card>
            <EmptyState title="Select a scout" />
          </Card>
        )}
      </div>
    </div>
  );
}
