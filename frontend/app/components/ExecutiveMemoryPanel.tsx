"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import {
  createExecutiveMemory,
  deleteExecutiveMemory,
  getExecutiveMemories,
  updateExecutiveMemory,
  type Company,
  type ExecutiveMemory,
  type ExecutiveMemoryType,
  type ExecutiveRole,
} from "@/lib/api";


const executiveOptions: Array<{
  value: ExecutiveRole | "all";
  label: string;
}> = [
  { value: "all", label: "All executives" },
  { value: "ceo", label: "CEO" },
  { value: "cfo", label: "CFO" },
  { value: "cmo", label: "CMO" },
  { value: "coo", label: "COO" },
  { value: "research", label: "Research Lead" },
  { value: "board", label: "Board" },
];

const memoryTypes: ExecutiveMemoryType[] = [
  "decision",
  "fact",
  "preference",
  "goal",
  "risk",
  "customer",
  "competitor",
  "strategy",
  "meeting",
  "task",
];


export default function ExecutiveMemoryPanel({
  company,
  onError,
  onSuccess,
}: {
  company: Company | null;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}) {
  const [memories, setMemories] =
    useState<ExecutiveMemory[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [roleFilter, setRoleFilter] =
    useState<ExecutiveRole | "all">("all");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    executive_role: "ceo" as ExecutiveRole,
    memory_type: "decision" as ExecutiveMemoryType,
    title: "",
    summary: "",
    details: "",
    importance: 7,
  });

  async function loadMemories() {
    if (!company) {
      setMemories([]);
      return;
    }

    setLoading(true);

    try {
      const data = await getExecutiveMemories(
        company.id,
        roleFilter === "all"
          ? undefined
          : roleFilter,
      );

      setMemories(data);
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Executive memories could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMemories();
    // loadMemories intentionally depends on the selected workspace and role.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, roleFilter]);

  const visibleMemories = useMemo(() => {
    const needle = search.trim().toLowerCase();

    if (!needle) {
      return memories;
    }

    return memories.filter((memory) =>
      [
        memory.title,
        memory.summary,
        memory.details ?? "",
        memory.memory_type,
        memory.executive_role,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [memories, search]);

  async function submitMemory(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!company) {
      onError("Select a workspace first.");
      return;
    }

    setSaving(true);

    try {
      const memory = await createExecutiveMemory({
        company_id: company.id,
        executive_role: form.executive_role,
        memory_type: form.memory_type,
        title: form.title.trim(),
        summary: form.summary.trim(),
        details: form.details.trim() || null,
        importance: form.importance,
      });

      setMemories((current) => [
        memory,
        ...current,
      ]);

      setForm((current) => ({
        ...current,
        title: "",
        summary: "",
        details: "",
      }));

      onSuccess("Long-term executive memory saved.");
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "The memory could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!company) {
    return (
      <section className="panel executive-memory-empty">
        <span>◌</span>
        <h2>Select a workspace</h2>
        <p>
          Executive memories are stored separately for each
          business workspace.
        </p>
      </section>
    );
  }

  return (
    <section className="executive-memory-page">
      <header className="page-heading">
        <span>GrowthOS v3.0</span>
        <h1>Executive Memory</h1>
        <p>
          Save durable decisions, goals, risks, facts, and
          preferences. Ordinary chat is not automatically
          converted into permanent memory.
        </p>
      </header>

      <div className="executive-memory-layout">
        <form
          className="panel executive-memory-form"
          onSubmit={submitMemory}
        >
          <header>
            <div>
              <small>New memory</small>
              <h2>Remember this</h2>
            </div>
            <span>◉</span>
          </header>

          <div className="executive-memory-form-grid">
            <label>
              Executive
              <select
                value={form.executive_role}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    executive_role:
                      event.target.value as ExecutiveRole,
                  }))
                }
              >
                {executiveOptions
                  .filter((item) => item.value !== "all")
                  .map((item) => (
                    <option
                      key={item.value}
                      value={item.value}
                    >
                      {item.label}
                    </option>
                  ))}
              </select>
            </label>

            <label>
              Type
              <select
                value={form.memory_type}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    memory_type:
                      event.target.value as ExecutiveMemoryType,
                  }))
                }
              >
                {memoryTypes.map((memoryType) => (
                  <option
                    key={memoryType}
                    value={memoryType}
                  >
                    {memoryType}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            Title
            <input
              value={form.title}
              required
              maxLength={180}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              placeholder="Example: Validate with UK users first"
            />
          </label>

          <label>
            Memory summary
            <textarea
              value={form.summary}
              required
              rows={4}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  summary: event.target.value,
                }))
              }
              placeholder="What should this executive remember later?"
            />
          </label>

          <label>
            Supporting detail
            <textarea
              value={form.details}
              rows={3}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  details: event.target.value,
                }))
              }
              placeholder="Optional rationale, constraints, or evidence."
            />
          </label>

          <label>
            Importance: {form.importance}/10
            <input
              type="range"
              min={1}
              max={10}
              value={form.importance}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  importance: Number(
                    event.target.value,
                  ),
                }))
              }
            />
          </label>

          <button
            type="submit"
            disabled={
              saving ||
              form.title.trim().length < 2 ||
              form.summary.trim().length < 2
            }
          >
            {saving ? "Saving…" : "Save memory"}
          </button>
        </form>

        <section className="panel executive-memory-library">
          <header>
            <div>
              <small>Long-term context</small>
              <h2>{memories.length} memories</h2>
            </div>

            <button
              type="button"
              onClick={() => {
                void loadMemories();
              }}
            >
              ↻ Refresh
            </button>
          </header>

          <div className="executive-memory-filters">
            <select
              value={roleFilter}
              onChange={(event) =>
                setRoleFilter(
                  event.target.value as
                    | ExecutiveRole
                    | "all",
                )
              }
            >
              {executiveOptions.map((item) => (
                <option
                  key={item.value}
                  value={item.value}
                >
                  {item.label}
                </option>
              ))}
            </select>

            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search memories"
            />
          </div>

          {loading ? (
            <p className="executive-memory-status">
              Loading executive memory…
            </p>
          ) : visibleMemories.length === 0 ? (
            <p className="executive-memory-status">
              No saved memories match this view.
            </p>
          ) : (
            <div className="executive-memory-list">
              {visibleMemories.map((memory) => (
                <article
                  className="executive-memory-card"
                  key={memory.id}
                >
                  <header>
                    <div>
                      <span>
                        {memory.executive_role.toUpperCase()}
                      </span>
                      <strong>{memory.title}</strong>
                    </div>
                    <b>{memory.importance}/10</b>
                  </header>

                  <small>
                    {memory.memory_type} · used{" "}
                    {memory.times_used} times
                  </small>

                  <p>{memory.summary}</p>

                  {memory.details && (
                    <details>
                      <summary>Supporting detail</summary>
                      <p>{memory.details}</p>
                    </details>
                  )}

                  <footer>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const updated =
                            await updateExecutiveMemory(
                              memory.id,
                              {
                                is_archived: true,
                              },
                            );

                          setMemories((current) =>
                            current.filter(
                              (item) =>
                                item.id !== updated.id,
                            ),
                          );

                          onSuccess("Memory archived.");
                        } catch (error) {
                          onError(
                            error instanceof Error
                              ? error.message
                              : "Memory could not be archived.",
                          );
                        }
                      }}
                    >
                      Archive
                    </button>

                    <button
                      type="button"
                      className="danger"
                      onClick={async () => {
                        if (
                          !window.confirm(
                            "Permanently forget this memory?",
                          )
                        ) {
                          return;
                        }

                        try {
                          await deleteExecutiveMemory(
                            memory.id,
                          );

                          setMemories((current) =>
                            current.filter(
                              (item) =>
                                item.id !== memory.id,
                            ),
                          );

                          onSuccess(
                            "Memory permanently deleted.",
                          );
                        } catch (error) {
                          onError(
                            error instanceof Error
                              ? error.message
                              : "Memory could not be deleted.",
                          );
                        }
                      }}
                    >
                      Forget
                    </button>
                  </footer>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
