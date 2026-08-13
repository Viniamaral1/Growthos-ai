"use client";

import { useEffect, useState } from "react";
import {
  getContradictions,
  getKnowledgeSpaces,
  refreshContradictions,
  updateContradictionStatus,
  type Company,
  type KnowledgeSpace,
  type ContradictionRecord,
  type ContradictionStatus,
} from "@/lib/api";

type Props = {
  company: Company | null;
  activeSpaceId: number | null;
  onActiveSpaceChange: (spaceId: number | null) => void;
  onError?: (message: string) => void;
  onSuccess?: (message: string) => void;
};

function severityLabel(value: ContradictionRecord["severity"]) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function ContradictionIntelligencePanel({ company, activeSpaceId, onActiveSpaceChange, onError, onSuccess }: Props) {
  const [items, setItems] = useState<ContradictionRecord[]>([]);
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [lastReviewedAt, setLastReviewedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [workingId, setWorkingId] = useState<number | null>(null);

  async function load() {
    if (!company) return;
    setLoading(true);
    try {
      const [contradictions, projectSpaces] = await Promise.all([
        getContradictions(company.id, activeSpaceId),
        getKnowledgeSpaces(company.id),
      ]);
      setItems(contradictions);
      setSpaces(projectSpaces.filter((space) => !space.is_archived));
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Contradictions could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [company?.id, activeSpaceId]);

  async function runReview() {
    if (!company || refreshing) return;
    setRefreshing(true);
    try {
      const reviewed = await refreshContradictions(company.id, activeSpaceId);
      await load();
      setLastReviewedAt(new Date().toISOString());
      onSuccess?.(reviewed.length === 0
        ? "Contradiction review completed. No supported active conflicts were detected."
        : `Contradiction review completed. GrowthOS found ${reviewed.length} supported conflict${reviewed.length === 1 ? "" : "s"}.`);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Contradiction review failed.");
    } finally {
      setRefreshing(false);
    }
  }

  async function setStatus(item: ContradictionRecord, status: ContradictionStatus) {
    setWorkingId(item.id);
    try {
      const updated = await updateContradictionStatus(item.id, status);
      setItems(current => current.map(row => row.id === item.id ? updated : row));
      onSuccess?.(`Contradiction marked ${status}.`);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Status could not be updated.");
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <section className="contradiction-panel">
      <header className="contradiction-header">
        <div>
          <p className="eyebrow">Contradiction Intelligence</p>
          <h1>Conflicting business evidence</h1>
          <p>GrowthOS checks whether two active business sources describe the same fact with incompatible values.</p>
        </div>
        <div className="contradiction-controls">
          <label>
            <span>Project</span>
            <select
              value={activeSpaceId ?? "all"}
              onChange={(event) => onActiveSpaceChange(event.target.value === "all" ? null : Number(event.target.value))}
              disabled={!company || loading || refreshing}
            >
              <option value="all">All projects</option>
              {spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
            </select>
          </label>
          <button type="button" className="primary-button" disabled={!company || refreshing} onClick={() => void runReview()}>
            {refreshing ? "Checking evidence..." : "Run contradiction review"}
          </button>
        </div>
      </header>

      {!company ? <div className="empty-state">Select a workspace first.</div> : loading ? <div className="empty-state">Loading contradictions...</div> : items.length === 0 ? (
        <div className="contradiction-empty">
          <strong>No supported contradictions detected.</strong>
          <p>
            Project reviewed: <b>{activeSpaceId === null ? "All projects" : spaces.find((space) => space.id === activeSpaceId)?.name ?? "Current project"}</b>.
            GrowthOS only surfaces supported active conflicts; proposals and superseded historical changes stay out of this list.
          </p>
          {lastReviewedAt && <small>Last reviewed {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(lastReviewedAt))}</small>}
        </div>
      ) : (
        <div className="contradiction-list">
          {items.map(item => (
            <article key={item.id} className={`contradiction-card severity-${item.severity}`}>
              <div className="contradiction-card-top">
                <div>
                  <div className="contradiction-badges">
                    <span className={`impact-badge ${item.severity}`}>{severityLabel(item.severity)}</span>
                    <span className="confidence-badge">{item.confidence}% confidence</span>
                    <span className="status-badge">{item.status.replace("detected", "Needs review")}</span>
                  </div>
                  <h2>{item.title}</h2>
                  <p>{item.summary}</p>
                </div>
                <button type="button" className="secondary-button" onClick={() => setExpanded(v => ({ ...v, [item.id]: !v[item.id] }))}>
                  {expanded[item.id] ? "Hide details" : "Review conflict"}
                </button>
              </div>

              <div className="contradiction-values">
                <div><small>Statement A</small><strong>{item.statement_a}</strong></div>
                <span className="conflict-mark">≠</span>
                <div><small>Statement B</small><strong>{item.statement_b}</strong></div>
              </div>

              {expanded[item.id] && (
                <div className="contradiction-details">
                  <section><h3>Why GrowthOS flagged this</h3><p>{item.reason}</p></section>
                  <section><h3>Business impact</h3><p>{item.business_impact}</p></section>
                  <section><h3>Recommended verification</h3><p>{item.recommended_verification}</p></section>
                  <section>
                    <h3>Evidence</h3>
                    <div className="contradiction-evidence-grid">
                      {item.evidence.map((evidence, index) => (
                        <div key={`${item.id}-${evidence.role}-${evidence.document_id ?? "none"}-${evidence.knowledge_item_id ?? "none"}-${index}`} className="contradiction-evidence-card">
                          <small>{evidence.role === "statement_a" ? "Source A" : evidence.role === "statement_b" ? "Source B" : "Supporting"}</small>
                          <strong>{evidence.document_name || "Captured Knowledge"}</strong>
                          <span>{evidence.label}: {evidence.value}</span>
                          {evidence.source_quality && <em>{evidence.source_quality.replaceAll("_", " ")}</em>}
                        </div>
                      ))}
                    </div>
                  </section>
                  <div className="contradiction-actions">
                    <button disabled={workingId === item.id} type="button" onClick={() => void setStatus(item, "confirmed")}>Confirm conflict</button>
                    <button disabled={workingId === item.id} type="button" onClick={() => void setStatus(item, "resolved")}>Mark resolved</button>
                    <button disabled={workingId === item.id} type="button" onClick={() => void setStatus(item, "dismissed")}>Dismiss</button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
