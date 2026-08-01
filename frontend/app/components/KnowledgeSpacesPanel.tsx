"use client";

import { useEffect, useState } from "react";
import { createKnowledgeSpace, getKnowledgeItems, getKnowledgeSpaces, type Company, type KnowledgeItem, type KnowledgeSpace } from "@/lib/api";

export default function KnowledgeSpacesPanel({ company, onError, onSuccess }: { company: Company | null; onError: (message: string) => void; onSuccess: (message: string) => void }) {
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [active, setActive] = useState<KnowledgeSpace | null>(null);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!company) { setSpaces([]); setActive(null); return; }
    getKnowledgeSpaces(company.id).then((result) => { setSpaces(result); setActive((current) => current ?? result[0] ?? null); }).catch((error) => onError(error instanceof Error ? error.message : "Knowledge spaces could not be loaded."));
  }, [company?.id]);

  useEffect(() => {
    if (!active) { setItems([]); return; }
    getKnowledgeItems(active.id, search).then(setItems).catch((error) => onError(error instanceof Error ? error.message : "Knowledge could not be loaded."));
  }, [active?.id, search]);

  async function addSpace() {
    if (!company || name.trim().length < 2) return;
    try {
      const created = await createKnowledgeSpace({ company_id: company.id, name: name.trim(), description: null, color: "cyan" });
      setSpaces((current) => [created, ...current]); setActive(created); setName(""); onSuccess("Knowledge space created.");
    } catch (error) { onError(error instanceof Error ? error.message : "Knowledge space could not be created."); }
  }

  return <section className="knowledge-spaces-page">
    <header className="knowledge-spaces-hero"><div><span>Company brain</span><h1>Knowledge Spaces</h1><p>Organise useful messages, decisions, emails, research, and notes by subject instead of by chat.</p></div><div><input value={name} onChange={(e) => setName(e.target.value)} placeholder="New subject, e.g. Meat Farm" /><button type="button" onClick={() => void addSpace()}>Create space</button></div></header>
    {!company ? <div className="empty-panel">Select a workspace first.</div> : <div className="knowledge-spaces-layout"><aside>{spaces.length === 0 ? <p>No spaces yet. Capture a message from Executive Team or create one above.</p> : spaces.map((space) => <button key={space.id} type="button" className={active?.id === space.id ? "active" : ""} onClick={() => setActive(space)}><span>▦</span><div><strong>{space.name}</strong><small>{space.description ?? "Saved business knowledge"}</small></div></button>)}</aside><main>{active ? <><header><div><span>{active.color}</span><h2>{active.name}</h2></div><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search this space…" /></header>{items.length === 0 ? <div className="empty-panel">Nothing has been captured here yet.</div> : <div className="knowledge-item-list">{items.map((item) => <article key={item.id}><header><span>{item.item_type}</span><time>{new Date(item.created_at).toLocaleDateString()}</time></header><h3>{item.title}</h3><p>{item.summary}</p></article>)}</div>}</> : <div className="empty-panel">Create or select a knowledge space.</div>}</main></div>}
  </section>;
}
