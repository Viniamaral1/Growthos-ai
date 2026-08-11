"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getOpportunities,
  refreshOpportunities,
  updateOpportunityStatus,
  type Company,
  type OpportunityRecord,
  type OpportunityStatus,
} from "@/lib/api";

function statusLabel(status: OpportunityStatus): string {
  if (status === "confirmed") return "Confirmed";
  if (status === "dismissed") return "Dismissed";
  return "Needs review";
}

export default function OpportunityIntelligencePanel({
  company,
  activeSpaceId,
  onError,
  onSuccess,
}: {
  company: Company | null;
  activeSpaceId: number | null;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}) {
  const [items, setItems] = useState<OpportunityRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<OpportunityStatus | "all">("detected");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const companyId = company?.id ?? null;

  const load = useCallback(async () => {
    if (companyId === null) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const result = await getOpportunities(companyId, activeSpaceId, null);
      setItems(result);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Opportunity Intelligence could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [activeSpaceId, companyId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => items.filter((item) => filter === "all" || item.status === filter),
    [filter, items],
  );

  async function runRefresh() {
    if (companyId === null || refreshing) return;
    setRefreshing(true);
    try {
      const result = await refreshOpportunities(companyId, activeSpaceId);
      setItems(result);
      onSuccess(result.length === 0 ? "No material opportunities detected yet." : `GrowthOS reviewed current Knowledge and found ${result.length} opportunity signal${result.length === 1 ? "" : "s"}.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Opportunity analysis failed.");
    } finally {
      setRefreshing(false);
    }
  }

  async function changeStatus(item: OpportunityRecord, status: OpportunityStatus) {
    if (workingId !== null) return;
    setWorkingId(item.id);
    try {
      const updated = await updateOpportunityStatus(item.id, status);
      setItems((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
      onSuccess(status === "confirmed" ? "Opportunity confirmed." : status === "dismissed" ? "Opportunity dismissed." : "Opportunity returned to review.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Opportunity status could not be updated.");
    } finally {
      setWorkingId(null);
    }
  }

  if (!company) {
    return <section className="opportunity-empty"><h2>Opportunity Intelligence</h2><p>Select a workspace first.</p></section>;
  }

  return (
    <section className="opportunity-shell">
      <header className="opportunity-hero">
        <div>
          <span className="eyebrow">Intelligence layer · Phase 1</span>
          <h1>Opportunity Detection</h1>
          <p>GrowthOS compares current Knowledge with historical evidence and surfaces material changes worth reviewing. v1 uses internal evidence only.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => void runRefresh()} disabled={refreshing || loading}>
          {refreshing ? "Reviewing Knowledge…" : "Run opportunity review"}
        </button>
      </header>

      <div className="opportunity-controls">
        {(["detected", "confirmed", "dismissed", "all"] as const).map((value) => (
          <button key={value} type="button" className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
            {value === "all" ? "All" : statusLabel(value)}
            <strong>{value === "all" ? items.length : items.filter((item) => item.status === value).length}</strong>
          </button>
        ))}
        <span>{activeSpaceId === null ? "All project Knowledge" : "Active project only"}</span>
      </div>

      {loading ? <div className="opportunity-loading">Comparing historical Knowledge…</div> : null}

      {!loading && visible.length === 0 ? (
        <div className="opportunity-empty">
          <h2>No opportunity signals in this view</h2>
          <p>Capture an older and newer version of the same commercial fact, then run the review. GrowthOS will not invent an opportunity when evidence is insufficient.</p>
        </div>
      ) : null}

      <div className="opportunity-list">
        {visible.map((item) => {
          const expanded = expandedId === item.id;
          const working = workingId === item.id;
          return (
            <article key={item.id} className={`opportunity-card severity-${item.severity}`}>
              <div className="opportunity-card-head">
                <div>
                  <div className="opportunity-meta">
                    <span>{item.space_name ?? "Workspace"}</span>
                    <span>{item.confidence}% confidence</span>
                    <span>{statusLabel(item.status)}</span>
                  </div>
                  <h2>{item.title}</h2>
                  <p>{item.summary}</p>
                </div>
                {item.delta_display ? <strong className="opportunity-delta">{item.delta_display}</strong> : null}
              </div>

              {(item.previous_value || item.current_value) ? (
                <div className="opportunity-compare">
                  <div><span>Previous</span><strong>{item.previous_value ?? "—"}</strong></div>
                  <span>→</span>
                  <div><span>Current</span><strong>{item.current_value ?? "—"}</strong></div>
                </div>
              ) : null}

              <div className="opportunity-recommendation">
                <span>Recommended action</span>
                <p>{item.recommended_action}</p>
              </div>

              <div className="opportunity-actions">
                <button type="button" onClick={() => setExpandedId(expanded ? null : item.id)}>{expanded ? "Hide evidence" : "Why / evidence"}</button>
                {item.status !== "confirmed" ? <button type="button" disabled={working} onClick={() => void changeStatus(item, "confirmed")}>{working ? "Saving…" : "Confirm"}</button> : null}
                {item.status !== "dismissed" ? <button type="button" disabled={working} onClick={() => void changeStatus(item, "dismissed")}>{working ? "Saving…" : "Dismiss"}</button> : null}
                {item.status !== "detected" ? <button type="button" disabled={working} onClick={() => void changeStatus(item, "detected")}>Return to review</button> : null}
              </div>

              {expanded ? (
                <div className="opportunity-evidence">
                  <section>
                    <h3>Why GrowthOS surfaced this</h3>
                    <ul>{item.explanation.map((reason, index) => <li key={`${item.id}-reason-${index}`}>{reason}</li>)}</ul>
                  </section>
                  <section>
                    <h3>Supporting evidence</h3>
                    {item.evidence.map((source, index) => (
                      <div className="opportunity-source" key={`${item.id}-source-${source.document_id ?? index}`}>
                        <strong>{source.document_name ?? "Captured Knowledge"}</strong>
                        <span>{source.label}</span>
                        <p>{source.value}</p>
                        <small>{source.source_quality?.replaceAll("_", " ") ?? "Knowledge source"}</small>
                      </div>
                    ))}
                  </section>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
