"use client";

import { useEffect, useState } from "react";
import {
  getContradictions,
  refreshContradictions,
  updateContradictionStatus,
  type Company,
  type ContradictionRecord,
  type ContradictionStatus,
} from "@/lib/api";

type Props = {
  company: Company | null;
  activeSpaceId: number | null;
  onError?: (message: string) => void;
  onSuccess?: (message: string) => void;
};

function severityLabel(value: ContradictionRecord["severity"]) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function ContradictionIntelligencePanel({ company, activeSpaceId, onError, onSuccess }: Props) {
  const [items, setItems] = useState<ContradictionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [workingId, setWorkingId] = useState<number | null>(null);

  async function load() {
    if (!company) return;
    setLoading(true);
    try {
      setItems(await getContradictions(company.id, activeSpaceId));
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
      await refreshContradictions(company.id, activeSpaceId);
      await load();
      onSuccess?.("Contradiction review completed.");
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
          <p>GrowthOS checks whether two business sources describe the same fact with incompatible values.</p>
        </div>
        <button type="button" className="primary-button" disabled={!company || refreshing} onClick={() => void runReview()}>
          {refreshing ? "Checking evidence..." : "Run contradiction review"}
        </button>
      </header>

      {!company ? <div className="empty-state">Select a workspace first.</div> : loading ? <div className="empty-state">Loading contradictions...</div> : items.length === 0 ? (
        <div className="contradiction-empty">
          <strong>No contradictions detected.</strong>
          <p>Run a review after capturing new Knowledge. GrowthOS will only surface supported conflicts; ordinary historical changes stay out of this list.</p>
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
