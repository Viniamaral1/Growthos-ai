"use client";

import { useEffect, useMemo, useState } from "react";
import SemanticWorkspaceSearch from "@/app/components/SemanticWorkspaceSearch";
import {
  createKnowledgeSpace,
  deleteKnowledgeItem,
  deleteKnowledgeSpace,
  getKnowledgeItems,
  getKnowledgeSpaces,
  updateKnowledgeItem,
  updateKnowledgeSpace,
  type Company,
  type KnowledgeItem,
  type KnowledgeSpace,
} from "@/lib/api";

const TYPE_META: Record<string, { label: string; icon: string }> = {
  email: { label: "Emails", icon: "✉" },
  idea: { label: "Ideas", icon: "✦" },
  research: { label: "Research", icon: "⌕" },
  decision: { label: "Decisions", icon: "◇" },
  strategy: { label: "Strategy", icon: "◆" },
  task: { label: "Tasks", icon: "✓" },
  note: { label: "Notes", icon: "▤" },
  finance: { label: "Finance", icon: "£" },
  date: { label: "Dates", icon: "◷" },
  supplier: { label: "Suppliers", icon: "◇" },
  customer: { label: "Customers", icon: "◎" },
  organisation: { label: "Organisations", icon: "▦" },
  contact: { label: "Contacts", icon: "◉" },
  contract: { label: "Contracts", icon: "▣" },
  commercial: { label: "Commercial", icon: "%" },
  location: { label: "Locations", icon: "⌖" },
  product: { label: "Products", icon: "□" },
  risk: { label: "Risks", icon: "!" },
  fact: { label: "Facts", icon: "•" },
};

function downloadBlob(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeFilename(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "knowledge-item";
}

function activeSpaceStorageKey(companyId: number) {
  return `growthos-active-knowledge-space:${companyId}`;
}

function itemTags(item: KnowledgeItem): string[] {
  try {
    const value = JSON.parse(item.tags_json || "[]");
    return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

function confidenceFromItem(item: KnowledgeItem): number | null {
  const tag = itemTags(item).find((value) => value.startsWith("confidence:"));
  if (!tag) return null;
  const value = Number(tag.slice("confidence:".length));
  return Number.isFinite(value) ? value : null;
}

function decodeTaggedValue(item: KnowledgeItem, prefix: string): string[] {
  return itemTags(item)
    .filter((tag) => tag.startsWith(`${prefix}:`))
    .map((tag) => {
      const encoded = tag.slice(prefix.length + 1);
      try {
        const padded = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
        return decodeURIComponent(Array.from(atob(padded.replaceAll("-", "+").replaceAll("_", "/"))).map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""));
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

function evidenceFromItem(item: KnowledgeItem): string | null {
  return decodeTaggedValue(item, "evidence-b64")[0] ?? null;
}

function reasonsFromItem(item: KnowledgeItem): string[] {
  return decodeTaggedValue(item, "reason-b64");
}

function previousValuesFromItem(item: KnowledgeItem): string[] {
  const tagged = decodeTaggedValue(item, "previous-value-b64");
  const legacy = [...item.content.matchAll(/Previous value:\s*([^\n]+)/gi)].map((match) => match[1].trim());
  return [...new Set([...tagged, ...legacy])];
}

function calendarReasonFromItem(item: KnowledgeItem): string | null {
  return decodeTaggedValue(item, "calendar-reason-b64")[0] ?? null;
}

function sourceQualityFromItem(item: KnowledgeItem): string {
  return itemTags(item).find((tag) => tag.startsWith("source-quality:"))?.slice("source-quality:".length).replaceAll("_", " ") ?? "direct source document";
}

function currentItemContent(item: KnowledgeItem): string {
  return item.content.split(/\n\nPrevious value:/i)[0].trim();
}

function sourceDocumentMetas(item: KnowledgeItem): Array<{ id: number; filename: string | null }> {
  const tags = itemTags(item);
  const result: Array<{ id: number; filename: string | null }> = [];
  for (let index = 0; index < tags.length; index += 1) {
    const tag = tags[index];
    if (!tag.startsWith("source-document:")) continue;
    const id = Number(tag.slice("source-document:".length));
    if (!Number.isFinite(id)) continue;
    const followingFile = tags.slice(index + 1).find((candidate) => candidate.startsWith("source-file:") || candidate.startsWith("source-document:"));
    result.push({
      id,
      filename: followingFile?.startsWith("source-file:") ? followingFile.slice("source-file:".length) : null,
    });
  }
  return result;
}

function sourceDocumentMeta(item: KnowledgeItem): { id: number; filename: string | null } | null {
  return sourceDocumentMetas(item)[0] ?? null;
}

function evidenceHealthFromItem(item: KnowledgeItem): { label: string; status: "healthy" | "warning" | "unlinked" } {
  const tags = itemTags(item);
  const sourceCount = new Set(sourceDocumentMetas(item).map((source) => source.id)).size;
  if (tags.some((tag) => tag.startsWith("evidence-unlinked-document:"))) {
    return { label: sourceCount > 0 ? `${sourceCount} supporting source${sourceCount === 1 ? "" : "s"} · one unlinked` : "Evidence unlinked", status: "unlinked" };
  }
  if (tags.some((tag) => tag.startsWith("source-deleted-document:")) || tags.includes("evidence-status:source-deleted")) {
    return { label: sourceCount > 1 ? `${sourceCount - 1} other supporting source${sourceCount - 1 === 1 ? "" : "s"}` : "Original evidence deleted", status: "warning" };
  }
  return { label: sourceCount > 0 ? `${sourceCount} supporting source${sourceCount === 1 ? "" : "s"}` : "Captured Knowledge", status: "healthy" };
}

export default function KnowledgeSpacesPanel({
  company,
  onError,
  onSuccess,
  activeSpaceId,
  onActiveSpaceChange,
}: {
  company: Company | null;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  activeSpaceId?: number | null;
  onActiveSpaceChange?: (spaceId: number | null) => void;
}) {
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [active, setActive] = useState<KnowledgeSpace | null>(null);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [activeType, setActiveType] = useState<string>("all");
  const [selected, setSelected] = useState<KnowledgeItem | null>(null);
  const [selectedSourceGroup, setSelectedSourceGroup] = useState<{ documentId: number; filename: string; items: KnowledgeItem[] } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editType, setEditType] = useState("note");
  const [editSpaceId, setEditSpaceId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [spaceAction, setSpaceAction] = useState<"rename" | "delete" | null>(null);
  const [spaceName, setSpaceName] = useState("");
  const [spaceItemCount, setSpaceItemCount] = useState(0);
  const [spaceSaving, setSpaceSaving] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [typeMenuCollapsed, setTypeMenuCollapsed] = useState(false);

  useEffect(() => {
    if (!company) {
      setSpaces([]);
      setActive(null);
      return;
    }
    getKnowledgeSpaces(company.id)
      .then((result) => {
        setSpaces(result);
        setActive((current) => {
          const requested = activeSpaceId ? result.find((space) => space.id === activeSpaceId) : null;
          if (requested) return requested;
          const currentMatch = result.find((space) => space.id === current?.id);
          if (currentMatch) return currentMatch;
          const storedId = Number(window.localStorage.getItem(activeSpaceStorageKey(company.id)) || "0");
          return result.find((space) => space.id === storedId) ?? result[0] ?? null;
        });
      })
      .catch((error) => onError(error instanceof Error ? error.message : "Knowledge spaces could not be loaded."));
  // Load the project list when the workspace changes. activeSpaceId changes are
  // handled by the lightweight sync effect below so we do not refetch the
  // whole list twice and visibly flicker the Knowledge page.
  }, [company?.id]);

  useEffect(() => {
    if (!activeSpaceId || spaces.length === 0) return;
    const requested = spaces.find((space) => space.id === activeSpaceId);
    if (requested && requested.id !== active?.id) {
      setActive(requested);
      setActiveType("all");
      setSelected(null);
      setSelectedSourceGroup(null);
    }
  }, [activeSpaceId, spaces, active?.id]);

  useEffect(() => {
    if (company && active) {
      window.localStorage.setItem(activeSpaceStorageKey(company.id), String(active.id));
      onActiveSpaceChange?.(active.id);
    }
  }, [company?.id, active?.id]);

  useEffect(() => {
    if (!active) {
      setItems([]);
      return;
    }
    getKnowledgeItems(active.id, search)
      .then(setItems)
      .catch((error) => onError(error instanceof Error ? error.message : "Knowledge could not be loaded."));
  }, [active?.id, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, KnowledgeItem[]>();
    for (const item of items) {
      const key = item.item_type || "note";
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [items]);

  const visibleItems = activeType === "all" ? items : grouped.get(activeType) ?? [];

  const sourceGroups = useMemo(() => {
    if (activeType !== "all") return [];
    const byDocument = new Map<number, { documentId: number; filename: string; items: KnowledgeItem[] }>();
    for (const item of visibleItems) {
      const sources = sourceDocumentMetas(item);
      for (const source of sources) {
        const group = byDocument.get(source.id) ?? {
          documentId: source.id,
          filename: source.filename ?? `Business Intelligence source #${source.id}`,
          items: [],
        };
        if (!group.items.some((candidate) => candidate.id === item.id)) group.items.push(item);
        if (source.filename) group.filename = source.filename;
        byDocument.set(source.id, group);
      }
    }
    return [...byDocument.values()].sort((a, b) => {
      const aDate = Math.max(...a.items.map((item) => new Date(item.updated_at).getTime()));
      const bDate = Math.max(...b.items.map((item) => new Date(item.updated_at).getTime()));
      return bDate - aDate;
    });
  }, [visibleItems, activeType]);

  const standaloneItems = useMemo(() => {
    if (activeType !== "all") return visibleItems;
    return visibleItems.filter((item) => sourceDocumentMeta(item) === null);
  }, [visibleItems, activeType]);

  async function addSpace() {
    if (!company || name.trim().length < 2) return;
    try {
      const created = await createKnowledgeSpace({ company_id: company.id, name: name.trim(), description: null, color: "cyan" });
      setSpaces((current) => [created, ...current]);
      setActive(created);
      setName("");
      onSuccess("Knowledge space created.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Knowledge space could not be created.");
    }
  }



  function openRenameSpace() {
    if (!active) return;
    setSpaceName(active.name);
    setSpaceAction("rename");
  }

  async function openDeleteSpace() {
    if (!active) return;
    try {
      const allItems = await getKnowledgeItems(active.id);
      setSpaceItemCount(allItems.length);
      setSpaceAction("delete");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Knowledge space details could not be loaded.");
    }
  }

  async function renameSpace() {
    if (!active || spaceName.trim().length < 2) return;
    setSpaceSaving(true);
    try {
      const updated = await updateKnowledgeSpace(active.id, { name: spaceName.trim() });
      setSpaces((current) => current.map((space) => (space.id === updated.id ? updated : space)));
      setActive(updated);
      setSpaceAction(null);
      onSuccess("Knowledge space renamed.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Knowledge space could not be renamed.");
    } finally {
      setSpaceSaving(false);
    }
  }

  async function removeSpace() {
    if (!active) return;
    setSpaceSaving(true);
    try {
      await deleteKnowledgeSpace(active.id);
      const remaining = spaces.filter((space) => space.id !== active.id);
      setSpaces(remaining);
      setActive(remaining[0] ?? null);
      setItems([]);
      setSelected(null);
      setSearch("");
      setActiveType("all");
      setSpaceAction(null);
      onSuccess("Knowledge space deleted.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Knowledge space could not be deleted.");
    } finally {
      setSpaceSaving(false);
    }
  }

  function openItem(item: KnowledgeItem) {
    setSelected(item);
    setEditing(false);
    setEditTitle(item.title);
    setEditContent(item.content);
    setEditType(item.item_type || "note");
    setEditSpaceId(item.space_id);
  }

  async function saveItem() {
    if (!selected || !editSpaceId || editTitle.trim().length < 2 || editContent.trim().length < 2) return;
    setSaving(true);
    try {
      const updated = await updateKnowledgeItem(selected.id, {
        title: editTitle.trim(),
        summary: editContent.trim().slice(0, 1200),
        content: editContent.trim(),
        item_type: editType,
        space_id: editSpaceId,
      });
      if (editSpaceId !== active?.id) {
        setItems((current) => current.filter((item) => item.id !== selected.id));
      } else {
        setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      }
      setSelected(updated);
      setEditing(false);
      onSuccess("Knowledge item updated.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Knowledge item could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  async function removeItem() {
    if (!selected || !window.confirm(`Delete “${selected.title}”? This cannot be undone.`)) return;
    try {
      await deleteKnowledgeItem(selected.id);
      setItems((current) => current.filter((item) => item.id !== selected.id));
      setSelected(null);
      onSuccess("Knowledge item deleted.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Knowledge item could not be deleted.");
    }
  }

  function downloadWord(item: KnowledgeItem) {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${item.title}</title></head><body><h1>${item.title}</h1><p><strong>Type:</strong> ${item.item_type}</p><div style="white-space:pre-wrap;font-family:Arial,sans-serif">${item.content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div></body></html>`;
    downloadBlob(`${safeFilename(item.title)}.doc`, html, "application/msword");
  }

  function printItem(item: KnowledgeItem) {
    const popup = window.open("", "_blank", "width=900,height=700");
    if (!popup) return;
    popup.document.write(`<html><head><title>${item.title}</title><style>body{font-family:Arial,sans-serif;padding:48px;line-height:1.6;color:#111}pre{white-space:pre-wrap;font:inherit}</style></head><body><h1>${item.title}</h1><p>${TYPE_META[item.item_type]?.label ?? item.item_type}</p><pre>${item.content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre></body></html>`);
    popup.document.close();
    popup.focus();
    window.setTimeout(() => popup.print(), 250);
  }

  function emailItem(item: KnowledgeItem) {
    window.location.href = `mailto:?subject=${encodeURIComponent(item.title)}&body=${encodeURIComponent(item.content)}`;
  }

  return (
    <section className="knowledge-spaces-page">
      <header className="knowledge-spaces-hero">
        <div>
          <span>Company brain</span>
          <h1>Knowledge</h1>
          <p>Browse captured business knowledge by subject and type. Open, edit, move, export, or delete any saved item.</p>
        </div>
        <div>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="New subject, e.g. Meat Farm" onKeyDown={(event) => { if (event.key === "Enter") void addSpace(); }} />
          <button type="button" onClick={() => void addSpace()}>Create space</button>
        </div>
      </header>

      {!company ? (
        <div className="empty-panel">Select a workspace first.</div>
      ) : (
        <div className={`knowledge-spaces-layout ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
          <aside className="knowledge-space-sidebar">
            <div className="knowledge-space-sidebar-title">
              <span>Subjects</span>
            </div>
            {spaces.length === 0 ? <p>No spaces yet. Capture a message from Executive Team or create one above.</p> : spaces.map((space) => (
              <button
                key={space.id}
                type="button"
                className={active?.id === space.id ? "active" : ""}
                aria-label={space.name}
                data-tooltip={sidebarCollapsed ? space.name : undefined}
                onClick={() => { setActive(space); setActiveType("all"); setSelected(null); setSelectedSourceGroup(null); onActiveSpaceChange?.(space.id); }}
              >
                <span>▦</span><div><strong>{space.name}</strong><small>{space.description ?? "Saved business knowledge"}</small></div>
              </button>
            ))}
          </aside>

          <button
            type="button"
            className="knowledge-project-collapse"
            onClick={() => setSidebarCollapsed((current) => !current)}
            aria-label={sidebarCollapsed ? "Expand knowledge projects" : "Collapse knowledge projects"}
            data-tooltip={sidebarCollapsed ? "Expand projects" : "Collapse projects"}
          >
            {sidebarCollapsed ? "›" : "‹"}
          </button>

          <main className="knowledge-browser">
            {active ? (
              <>
                <header className="knowledge-browser-header">
                  <div><span className="knowledge-space-color" aria-hidden="true" /><div><small>Knowledge space</small><h2>{active.name}</h2></div></div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                    <label className="knowledge-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search titles, content, tags…" /></label>
                    <SemanticWorkspaceSearch company={company} activeSpaceId={active.id} onError={onError} />
                    <button
                      type="button"
                      onClick={openRenameSpace}
                      style={{ minHeight: 36, border: "1px solid var(--border)", borderRadius: 9, background: "transparent", padding: "0 11px", color: "var(--text-soft)", fontSize: 8, fontWeight: 800 }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => void openDeleteSpace()}
                      style={{ minHeight: 36, border: "1px solid rgba(255,106,121,.28)", borderRadius: 9, background: "rgba(255,106,121,.08)", padding: "0 11px", color: "#ff7f8c", fontSize: 8, fontWeight: 800 }}
                    >
                      Delete space
                    </button>
                  </div>
                </header>

                <div className="knowledge-type-menu-header">
                  <strong>Categories</strong>
                  <button
                    type="button"
                    onClick={() => setTypeMenuCollapsed((current) => !current)}
                    aria-label={typeMenuCollapsed ? "Expand knowledge categories" : "Collapse knowledge categories"}
                    data-tooltip={typeMenuCollapsed ? "Show All, Emails and other categories" : "Hide category menu"}
                  >
                    {typeMenuCollapsed ? "⌄" : "⌃"}
                  </button>
                </div>

                {!typeMenuCollapsed && (
                  <nav className="knowledge-type-tabs" aria-label="Knowledge categories">
                    <button type="button" className={activeType === "all" ? "active" : ""} onClick={() => setActiveType("all")}><span>▦</span><strong>All</strong><small>{items.length}</small></button>
                    {Object.entries(TYPE_META).map(([type, meta]) => (
                      <button key={type} type="button" className={activeType === type ? "active" : ""} onClick={() => setActiveType(type)}><span>{meta.icon}</span><strong>{meta.label}</strong><small>{grouped.get(type)?.length ?? 0}</small></button>
                    ))}
                  </nav>
                )}

                {visibleItems.length === 0 ? <div className="empty-panel">Nothing has been captured in this category yet.</div> : (
                  <>
                    {activeType === "all" && sourceGroups.length > 0 && (
                      <section className="knowledge-source-section">
                        <div className="knowledge-source-heading">
                          <div><strong>Captured from Business Intelligence</strong><span>One source object, with its reusable facts grouped underneath.</span></div>
                        </div>
                        <div className="knowledge-source-grid">
                          {sourceGroups.map((group) => {
                            const types = [...new Set(group.items.map((item) => TYPE_META[item.item_type]?.label ?? item.item_type))];
                            const calendarCount = group.items.filter((item) => itemTags(item).includes("calendar-candidate")).length;
                            const health = group.items.some((item) => evidenceHealthFromItem(item).status === "warning")
                              ? { label: "Some original evidence was deleted", status: "warning" as const }
                              : group.items.some((item) => evidenceHealthFromItem(item).status === "unlinked")
                                ? { label: "Some evidence was unlinked", status: "unlinked" as const }
                                : { label: "Evidence linked", status: "healthy" as const };
                            return (
                              <article key={group.documentId} tabIndex={0} onClick={() => setSelectedSourceGroup(group)} onKeyDown={(event) => { if (event.key === "Enter") setSelectedSourceGroup(group); }}>
                                <header><span>▤ Business Intelligence source</span><time>{new Date(group.items[0]?.updated_at ?? Date.now()).toLocaleDateString()}</time></header>
                                <h3>{group.filename}</h3>
                                <p>{group.items.length} reusable {group.items.length === 1 ? "fact" : "facts"} captured</p>
                                <div className="knowledge-source-tags">{types.slice(0, 5).map((type) => <span key={type}>{type}</span>)}{calendarCount > 0 && <span>◷ {calendarCount} calendar candidate{calendarCount === 1 ? "" : "s"}</span>}<span className={`evidence-health ${health.status}`}>{health.label}</span></div>
                                <footer><button type="button" onClick={(event) => { event.stopPropagation(); setSelectedSourceGroup(group); }}>Open knowledge</button><span>Grouped by source</span></footer>
                              </article>
                            );
                          })}
                        </div>
                      </section>
                    )}
                    {standaloneItems.length > 0 && (
                      <div className="knowledge-item-grid">
                        {standaloneItems.map((item) => (
                          <article key={item.id} tabIndex={0} onClick={() => openItem(item)} onKeyDown={(event) => { if (event.key === "Enter") openItem(item); }}>
                            <header><span>{TYPE_META[item.item_type]?.icon ?? "▤"} {TYPE_META[item.item_type]?.label ?? item.item_type}</span><time>{new Date(item.created_at).toLocaleDateString()}</time></header>
                            <h3>{item.title}</h3>
                            <p>{item.summary}</p>
                            <footer><button type="button" onClick={(event) => { event.stopPropagation(); openItem(item); }}>Open</button><span>{item.source_conversation_id ? "From conversation" : "Captured item"}</span></footer>
                          </article>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            ) : <div className="empty-panel">Create or select a knowledge space.</div>}
          </main>
        </div>
      )}



      {spaceAction && active && (
        <div className="knowledge-preview-backdrop" role="presentation" onMouseDown={() => !spaceSaving && setSpaceAction(null)}>
          <section className="knowledge-preview" role="dialog" aria-modal="true" aria-label={spaceAction === "rename" ? "Rename knowledge space" : "Delete knowledge space"} onMouseDown={(event) => event.stopPropagation()} style={{ width: "min(560px, 100%)", gridTemplateRows: "auto auto auto" }}>
            <header>
              <div>
                <span>{spaceAction === "rename" ? "✎" : "×"}</span>
                <div>
                  <small>Knowledge space</small>
                  <h2>{spaceAction === "rename" ? "Rename space" : "Delete space"}</h2>
                </div>
              </div>
              <button type="button" onClick={() => setSpaceAction(null)} disabled={spaceSaving}>×</button>
            </header>

            {spaceAction === "rename" ? (
              <div className="knowledge-edit-form">
                <label>
                  Space name
                  <input
                    autoFocus
                    value={spaceName}
                    onChange={(event) => setSpaceName(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") void renameSpace(); }}
                  />
                </label>
              </div>
            ) : (
              <div className="knowledge-preview-content" style={{ paddingBlock: 26 }}>
                <p style={{ marginTop: 0 }}>Delete <strong>{active.name}</strong>?</p>
                <p style={{ color: "var(--text-soft)" }}>
                  {spaceItemCount === 0
                    ? "This space is empty."
                    : `This space contains ${spaceItemCount} saved ${spaceItemCount === 1 ? "item" : "items"}. Deleting it will permanently remove the space and everything inside it.`}
                </p>
                <p style={{ color: "#ff7f8c", marginBottom: 0 }}>This cannot be undone.</p>
              </div>
            )}

            <footer>
              <div />
              <div>
                <button type="button" className="subtle" onClick={() => setSpaceAction(null)} disabled={spaceSaving}>Cancel</button>
                {spaceAction === "rename" ? (
                  <button type="button" onClick={() => void renameSpace()} disabled={spaceSaving || spaceName.trim().length < 2}>
                    {spaceSaving ? "Saving…" : "Save name"}
                  </button>
                ) : (
                  <button type="button" className="danger" onClick={() => void removeSpace()} disabled={spaceSaving}>
                    {spaceSaving ? "Deleting…" : spaceItemCount > 0 ? `Delete space and ${spaceItemCount} ${spaceItemCount === 1 ? "item" : "items"}` : "Delete space"}
                  </button>
                )}
              </div>
            </footer>
          </section>
        </div>
      )}

      <style jsx>{`
        .knowledge-spaces-layout {
          position: relative;
        }

        .knowledge-space-sidebar-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .knowledge-project-collapse {
          position: absolute;
          z-index: 4;
          top: 18px;
          left: calc(var(--knowledge-sidebar-width, 260px) - 15px);
          display: grid;
          width: 30px;
          height: 30px;
          place-items: center;
          border: 1px solid rgba(59, 214, 208, 0.26);
          border-radius: 9px;
          background: rgba(7, 20, 34, 0.96);
          color: var(--cyan);
          box-shadow: 0 8px 22px rgba(0, 0, 0, 0.22);
          cursor: pointer;
          transition: left 180ms ease, background 180ms ease;
        }

        .knowledge-type-menu-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin: 4px 0 10px;
        }

        .knowledge-type-menu-header strong {
          color: var(--muted);
          font-size: 8px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .knowledge-type-menu-header button {
          display: grid;
          width: 30px;
          height: 30px;
          place-items: center;
          border: 1px solid rgba(59, 214, 208, 0.18);
          border-radius: 8px;
          background: rgba(59, 214, 208, 0.06);
          color: var(--cyan);
          cursor: pointer;
        }

        :global(.knowledge-spaces-layout.sidebar-collapsed) {
          grid-template-columns: 62px minmax(0, 1fr);
        }

        :global(.knowledge-spaces-layout.sidebar-collapsed .knowledge-project-collapse) {
          left: 47px;
        }

        :global(.knowledge-spaces-layout.sidebar-collapsed .knowledge-space-sidebar) {
          padding-inline: 9px;
        }

        :global(.knowledge-spaces-layout.sidebar-collapsed .knowledge-space-sidebar-title) {
          min-height: 28px;
        }

        :global(.knowledge-spaces-layout.sidebar-collapsed .knowledge-space-sidebar-title > span),
        :global(.knowledge-spaces-layout.sidebar-collapsed .knowledge-space-sidebar > p),
        :global(.knowledge-spaces-layout.sidebar-collapsed .knowledge-space-sidebar button > div) {
          display: none;
        }

        :global(.knowledge-spaces-layout.sidebar-collapsed .knowledge-space-sidebar > button) {
          display: grid;
          min-height: 42px;
          place-items: center;
          padding: 0;
        }

        :global(.knowledge-spaces-layout.sidebar-collapsed .knowledge-space-sidebar > button > span) {
          margin: 0;
          font-size: 15px;
        }

        .knowledge-source-section {
          display: grid;
          gap: 12px;
          margin-bottom: 18px;
        }

        .knowledge-source-heading div { display: grid; gap: 3px; }
        .knowledge-source-heading strong { color: var(--text); font-size: 12px; }
        .knowledge-source-heading span { color: var(--muted); font-size: 9px; }
        .knowledge-source-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
        .knowledge-source-grid > article { border: 1px solid rgba(59,214,208,.18); border-radius: 15px; padding: 16px; background: rgba(9,25,42,.72); cursor: pointer; display: grid; gap: 10px; }
        .knowledge-source-grid header, .knowledge-source-grid footer { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
        .knowledge-source-grid header span, .knowledge-source-grid footer span { color: var(--muted); font-size: 8px; }
        .knowledge-source-grid h3 { margin: 0; font-size: 14px; }
        .knowledge-source-grid p { margin: 0; color: var(--text-soft); font-size: 10px; }
        .knowledge-source-tags { display: flex; gap: 6px; flex-wrap: wrap; }
        .knowledge-source-tags span, .calendar-chip { border: 1px solid rgba(59,214,208,.16); border-radius: 999px; padding: 4px 7px; color: var(--cyan); font-size: 8px; background: rgba(59,214,208,.05); }
        .knowledge-source-preview { width: min(980px, calc(100vw - 40px)); max-height: min(86vh, 900px); }
        .knowledge-source-content { overflow: auto; padding: 22px; display: grid; gap: 18px; }
        .knowledge-source-summary { display: grid; gap: 4px; border: 1px solid var(--border); border-radius: 12px; padding: 14px; }
        .knowledge-source-summary span { color: var(--muted); font-size: 9px; }
        .knowledge-source-why { border: 1px solid rgba(148,163,184,.14); border-radius: 12px; padding: 10px 12px; background: rgba(255,255,255,.015); }
        .knowledge-source-why summary { color: var(--cyan); font-weight: 800; cursor: pointer; }
        .knowledge-source-why p { color: var(--text-soft); font-size: 9px; }
        .knowledge-source-why div { display: flex; flex-wrap: wrap; gap: 6px; }
        .knowledge-source-why div span { border: 1px solid var(--border); border-radius: 999px; padding: 4px 7px; color: var(--muted); font-size: 8px; }
        .knowledge-source-category { display: grid; gap: 8px; }
        .knowledge-source-category h3 { margin: 0; font-size: 11px; color: var(--cyan); text-transform: uppercase; letter-spacing: .05em; }
        .knowledge-source-category > div { display: grid; gap: 8px; }
        .knowledge-source-category article { border: 1px solid var(--border); border-radius: 12px; padding: 12px; display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
        .knowledge-source-category article p { margin: 5px 0 0; color: var(--text-soft); white-space: pre-wrap; }
        .knowledge-source-category article > div:last-child { display: grid; gap: 7px; justify-items: end; min-width: 110px; }


        .evidence-health.healthy { border-color: rgba(52, 211, 153, .28) !important; color: #7ee7bd !important; }
        .evidence-health.warning { border-color: rgba(251, 191, 36, .35) !important; color: #f6c95f !important; }
        .evidence-health.unlinked { border-color: rgba(248, 113, 113, .32) !important; color: #fb8f9d !important; }
        .knowledge-supporting-sources { position: relative; }
        .knowledge-supporting-sources > summary { cursor: pointer; list-style: none; }
        .knowledge-supporting-sources > summary::-webkit-details-marker { display: none; }
        .knowledge-supporting-sources > div { display: grid; gap: 5px; margin-top: 6px; padding: 9px 10px; border-radius: 10px; background: rgba(7, 22, 38, .92); border: 1px solid rgba(148, 163, 184, .16); min-width: 220px; }
        .knowledge-supporting-sources > div span { color: #9fb4c8; font-size: .76rem; }

        @media (max-width: 850px) {
          :global(.knowledge-spaces-layout.sidebar-collapsed) {
            grid-template-columns: 54px minmax(0, 1fr);
          }

          :global(.knowledge-spaces-layout.sidebar-collapsed .knowledge-project-collapse) {
            left: 39px;
          }
        }
      `}</style>

      {selectedSourceGroup && (
        <div className="knowledge-preview-backdrop knowledge-source-backdrop" role="presentation" onMouseDown={() => setSelectedSourceGroup(null)}>
          <section className="knowledge-preview knowledge-source-preview" role="dialog" aria-modal="true" aria-label="Source knowledge" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><span>▤</span><div><small>Business Intelligence source</small><h2>{selectedSourceGroup.filename}</h2></div></div>
              <button type="button" onClick={() => setSelectedSourceGroup(null)}>×</button>
            </header>
            <div className="knowledge-source-content">
              <div className="knowledge-source-summary"><strong>{selectedSourceGroup.items.length} reusable facts</strong><span>Structured Knowledge stays linked to the original evidence rather than duplicating the whole file.</span></div>
              <details className="knowledge-source-why">
                <summary>Why GrowthOS captured this</summary>
                <p>GrowthOS kept durable business facts that can be compared with future evidence. The original document remains in Business Intelligence.</p>
                <div className="knowledge-source-why-stats">
                  <span>{selectedSourceGroup.items.length} reusable facts</span>
                  <span>Average confidence {Math.round(selectedSourceGroup.items.reduce((sum, item) => sum + (confidenceFromItem(item) ?? 0), 0) / Math.max(1, selectedSourceGroup.items.filter((item) => confidenceFromItem(item) !== null).length))}%</span>
                  <span>{selectedSourceGroup.items.filter((item) => itemTags(item).includes("calendar-candidate")).length} calendar candidates</span>
                </div>
                <div>{[...new Set(selectedSourceGroup.items.map((item) => TYPE_META[item.item_type]?.label ?? item.item_type))].map((type) => <span key={type}>{type}</span>)}</div>
              </details>
              {(Object.entries(
                selectedSourceGroup.items.reduce<Record<string, KnowledgeItem[]>>((acc, item) => {
                  const key = item.item_type || "fact";
                  acc[key] = [...(acc[key] ?? []), item];
                  return acc;
                }, {}),
              ) as Array<[string, KnowledgeItem[]]>).map(([type, groupItems]) => (
                <section className="knowledge-source-category" key={type}>
                  <h3>{TYPE_META[type]?.icon ?? "•"} {TYPE_META[type]?.label ?? type}</h3>
                  <div>
                    {groupItems.map((item) => (
                      <article key={item.id}>
                        <div className="knowledge-source-fact-main">
                          <strong>{item.title}</strong>
                          <p>{currentItemContent(item)}</p>
                          {previousValuesFromItem(item).length > 0 && (
                            <div className="knowledge-history-inline"><small>Previous values</small>{previousValuesFromItem(item).slice(-4).map((value) => <span key={value}>{value}</span>)}</div>
                          )}
                          <details className="knowledge-item-explanation">
                            <summary>Why / evidence</summary>
                            <div>
                              {reasonsFromItem(item).length > 0 ? <ul>{reasonsFromItem(item).map((reason) => <li key={reason}>{reason}</li>)}</ul> : <p>This structured fact was extracted from the linked Business Intelligence source.</p>}
                              {evidenceFromItem(item) && <p><strong>Source evidence:</strong> {evidenceFromItem(item)}</p>}
                              {itemTags(item).includes("calendar-candidate") && <p><strong>Calendar candidate:</strong> {calendarReasonFromItem(item) ?? "This appears to be a dated business event or deadline."}</p>}
                              <p><strong>Source quality:</strong> {sourceQualityFromItem(item)}</p>
                            </div>
                          </details>
                        </div>
                        <div>
                          {confidenceFromItem(item) !== null && <span className="calendar-chip">Confidence {confidenceFromItem(item)}%</span>}
                          <details className="knowledge-supporting-sources">
                            <summary className={`calendar-chip evidence-health ${evidenceHealthFromItem(item).status}`}>{evidenceHealthFromItem(item).label}</summary>
                            <div>
                              {sourceDocumentMetas(item).length > 0 ? sourceDocumentMetas(item).map((source) => (
                                <span key={source.id}>▤ {source.filename ?? `Document #${source.id}`}</span>
                              )) : <span>No active source document is currently linked.</span>}
                              {itemTags(item).some((tag) => tag.startsWith("source-deleted-document:")) && <span>⚠ Original source was deleted; retained Knowledge is historical.</span>}
                              {itemTags(item).some((tag) => tag.startsWith("evidence-unlinked-document:")) && <span>⚠ One source was explicitly unlinked from this fact.</span>}
                            </div>
                          </details>
                          {itemTags(item).includes("calendar-candidate") && <span className="calendar-chip">◷ Calendar candidate</span>}
                          <button type="button" onClick={() => { setSelectedSourceGroup(null); openItem(item); }}>Open / edit</button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <footer><div /><div><button type="button" onClick={() => setSelectedSourceGroup(null)}>Close</button></div></footer>
          </section>
        </div>
      )}

      {selected && (
        <div className="knowledge-preview-backdrop" role="presentation" onMouseDown={() => setSelected(null)}>
          <section className="knowledge-preview" role="dialog" aria-modal="true" aria-label="Knowledge item preview" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><span>{TYPE_META[selected.item_type]?.icon ?? "▤"}</span><div><small>{TYPE_META[selected.item_type]?.label ?? selected.item_type}</small><h2>{selected.title}</h2></div></div><button type="button" onClick={() => setSelected(null)}>×</button></header>
            {editing ? (
              <div className="knowledge-edit-form">
                <label>Title<input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} /></label>
                <div className="knowledge-edit-row"><label>Type<select value={editType} onChange={(event) => setEditType(event.target.value)}>{Object.entries(TYPE_META).map(([type, meta]) => <option key={type} value={type}>{meta.label}</option>)}</select></label><label>Move to<select value={editSpaceId ?? ""} onChange={(event) => setEditSpaceId(Number(event.target.value))}>{spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}</select></label></div>
                <label>Content<textarea value={editContent} onChange={(event) => setEditContent(event.target.value)} /></label>
              </div>
            ) : <div className="knowledge-preview-content">{selected.content}</div>}
            <footer>
              <div><button type="button" onClick={() => navigator.clipboard.writeText(selected.content)}>Copy</button><button type="button" onClick={() => downloadWord(selected)}>Word</button><button type="button" onClick={() => printItem(selected)}>Print / PDF</button><button type="button" onClick={() => emailItem(selected)}>Email</button></div>
              <div>{editing ? <><button type="button" className="subtle" onClick={() => setEditing(false)}>Cancel</button><button type="button" onClick={() => void saveItem()} disabled={saving}>{saving ? "Saving…" : "Save"}</button></> : <><button type="button" className="danger" onClick={() => void removeItem()}>Delete</button><button type="button" onClick={() => setEditing(true)}>Edit / Move</button></>}</div>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
