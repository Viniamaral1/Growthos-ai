"use client";

import { useEffect, useMemo, useState } from "react";
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

export default function KnowledgeSpacesPanel({
  company,
  onError,
  onSuccess,
}: {
  company: Company | null;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}) {
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [active, setActive] = useState<KnowledgeSpace | null>(null);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [activeType, setActiveType] = useState<string>("all");
  const [selected, setSelected] = useState<KnowledgeItem | null>(null);
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

  useEffect(() => {
    if (!company) {
      setSpaces([]);
      setActive(null);
      return;
    }
    getKnowledgeSpaces(company.id)
      .then((result) => {
        setSpaces(result);
        setActive((current) => result.find((space) => space.id === current?.id) ?? result[0] ?? null);
      })
      .catch((error) => onError(error instanceof Error ? error.message : "Knowledge spaces could not be loaded."));
  }, [company?.id]);

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
        <div className="knowledge-spaces-layout">
          <aside className="knowledge-space-sidebar">
            <div className="knowledge-space-sidebar-title">Subjects</div>
            {spaces.length === 0 ? <p>No spaces yet. Capture a message from Executive Team or create one above.</p> : spaces.map((space) => (
              <button key={space.id} type="button" className={active?.id === space.id ? "active" : ""} onClick={() => { setActive(space); setActiveType("all"); setSelected(null); }}>
                <span>▦</span><div><strong>{space.name}</strong><small>{space.description ?? "Saved business knowledge"}</small></div>
              </button>
            ))}
          </aside>

          <main className="knowledge-browser">
            {active ? (
              <>
                <header className="knowledge-browser-header">
                  <div><span className="knowledge-space-color" aria-hidden="true" /><div><small>Knowledge space</small><h2>{active.name}</h2></div></div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                    <label className="knowledge-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search titles, content, tags…" /></label>
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

                <nav className="knowledge-type-tabs" aria-label="Knowledge categories">
                  <button type="button" className={activeType === "all" ? "active" : ""} onClick={() => setActiveType("all")}><span>▦</span><strong>All</strong><small>{items.length}</small></button>
                  {Object.entries(TYPE_META).map(([type, meta]) => (
                    <button key={type} type="button" className={activeType === type ? "active" : ""} onClick={() => setActiveType(type)}><span>{meta.icon}</span><strong>{meta.label}</strong><small>{grouped.get(type)?.length ?? 0}</small></button>
                  ))}
                </nav>

                {visibleItems.length === 0 ? <div className="empty-panel">Nothing has been captured in this category yet.</div> : (
                  <div className="knowledge-item-grid">
                    {visibleItems.map((item) => (
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
