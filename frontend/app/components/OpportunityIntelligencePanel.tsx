"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getOpportunities,
  getOpportunityReviewState,
  refreshOpportunities,
  updateOpportunityStatus,
  type Company,
  type OpportunityRecord,
  type OpportunityStatus,
} from "@/lib/api";

function statusLabel(status: OpportunityStatus): string {
  if (status === "confirmed") return "Confirmed";
  if (status === "dismissed") return "Dismissed";
  if (status === "resolved") return "Resolved";
  if (status === "expired") return "Expired";
  return "Needs review";
}

function evidenceRoleLabel(role: "current" | "historical" | "supporting") {
  if (role === "current") return "Current evidence";
  if (role === "historical") return "Historical evidence";
  return "Additional supporting evidence";
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
  const [needsReview, setNeedsReview] = useState(false);

  const companyId = company?.id ?? null;

  const load = useCallback(async () => {
    if (companyId === null) {
      setItems([]);
      setNeedsReview(false);
      return;
    }
    setLoading(true);
    try {
      const [result, reviewState] = await Promise.all([
        getOpportunities(companyId, activeSpaceId, null),
        getOpportunityReviewState(companyId, activeSpaceId),
      ]);
      setItems(result);
      setNeedsReview(reviewState.needs_review);
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
      setNeedsReview(false);
      onSuccess(result.length === 0
        ? "Opportunity review completed. No material opportunities were supported by the current evidence."
        : `GrowthOS reviewed current Knowledge and found ${result.length} opportunity signal${result.length === 1 ? "" : "s"}.`);
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
      const message = status === "confirmed" ? "Opportunity confirmed."
        : status === "dismissed" ? "Opportunity dismissed."
        : status === "resolved" ? "Opportunity marked resolved."
        : status === "expired" ? "Opportunity marked expired."
        : "Opportunity returned to review.";
      onSuccess(message);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Opportunity status could not be updated.");
    } finally {
      setWorkingId(null);
    }
  }

  if (!company) {
    return <section className="opportunity-empty"><h2>Opportunity Intelligence</h2><p>Select a workspace first.</p></section>;
  }

  const filters: (OpportunityStatus | "all")[] = ["detected", "confirmed", "dismissed", "resolved", "expired", "all"];

  return (
    <section className="opportunity-shell">
      <header className="opportunity-hero">
        <div>
          <span className="eyebrow">Intelligence layer · Opportunity Detection</span>
          <h1>Opportunity Detection</h1>
          <p>GrowthOS compares current Knowledge with historical evidence and surfaces changes that may deserve a business decision. This review uses internal evidence only.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => void runRefresh()} disabled={refreshing || loading}>
          {refreshing ? "Reviewing Knowledge…" : "Run opportunity review"}
        </button>
      </header>

      {needsReview ? (
        <div className="opportunity-review-reminder">
          <div>
            <strong>New Knowledge has been added since your last opportunity review.</strong>
            <span>Run a new review to check whether the latest evidence changes any commercial opportunity.</span>
          </div>
          <button type="button" onClick={() => void runRefresh()} disabled={refreshing || loading}>
            {refreshing ? "Reviewing…" : "Run review"}
          </button>
        </div>
      ) : null}

      <div className="opportunity-controls">
        {filters.map((value) => (
          <button key={value} type="button" className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
            {value === "all" ? "All" : statusLabel(value)}
            <strong>{value === "all" ? items.length : items.filter((item) => item.status === value).length}</strong>
          </button>
        ))}
        <span>{activeSpaceId === null ? "All project Knowledge" : "Active project only"}</span>
      </div>

      {loading ? <div className="opportunity-loading">Loading opportunity history…</div> : null}

      {!loading && visible.length === 0 ? (
        <div className="opportunity-empty">
          <h2>No opportunity signals in this view</h2>
          <p>GrowthOS will only surface an opportunity when the available evidence supports one. An uploaded or captured document does not automatically become an opportunity.</p>
        </div>
      ) : null}

      <div className="opportunity-list">
        {visible.map((item) => {
          const expanded = expandedId === item.id;
          const working = workingId === item.id;
          const groupedEvidence = ["current", "historical", "supporting"].map((role) => ({
            role: role as "current" | "historical" | "supporting",
            sources: item.evidence.filter((source) => source.role === role),
          })).filter((group) => group.sources.length > 0);

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

              <div className="opportunity-impact">
                <span>Business impact</span>
                <p>{item.business_impact}</p>
              </div>

              <div className="opportunity-recommendation">
                <span>Recommended action</span>
                <p>{item.recommended_action}</p>
              </div>

              <div className="opportunity-actions">
                <button type="button" onClick={() => setExpandedId(expanded ? null : item.id)}>{expanded ? "Hide analysis" : "Why / evidence"}</button>
                {item.status !== "confirmed" ? <button type="button" disabled={working} onClick={() => void changeStatus(item, "confirmed")}>{working ? "Saving…" : "Confirm"}</button> : null}
                {item.status !== "dismissed" ? <button type="button" disabled={working} onClick={() => void changeStatus(item, "dismissed")}>{working ? "Saving…" : "Dismiss"}</button> : null}
                {item.status === "confirmed" ? <button type="button" disabled={working} onClick={() => void changeStatus(item, "resolved")}>{working ? "Saving…" : "Mark resolved"}</button> : null}
                {item.status !== "detected" ? <button type="button" disabled={working} onClick={() => void changeStatus(item, "detected")}>{working ? "Saving…" : "Return to review"}</button> : null}
              </div>

              {expanded ? (
                <div className="opportunity-evidence">
                  <section>
                    <h3>Why GrowthOS surfaced this</h3>
                    <ul>{item.explanation.map((reason, index) => <li key={`${item.id}-reason-${index}`}>{reason}</li>)}</ul>

                    <div className="opportunity-confidence-box">
                      <div className="opportunity-confidence-head">
                        <strong>Why this confidence?</strong>
                        <span>{item.confidence}%</span>
                      </div>
                      {item.confidence_factors.map((factor, index) => (
                        <div className="opportunity-confidence-factor" key={`${item.id}-factor-${index}`}>
                          <div><strong>{factor.label}</strong><span>+{factor.contribution}%</span></div>
                          {factor.detail ? <small>{factor.detail}</small> : null}
                        </div>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3>Supporting evidence</h3>
                    {groupedEvidence.map((group) => (
                      <div className="opportunity-evidence-group" key={`${item.id}-${group.role}`}>
                        <h4>{evidenceRoleLabel(group.role)}</h4>
                        {group.sources.map((source, index) => (
                          <div className="opportunity-source" key={`${item.id}-${group.role}-${source.document_id ?? index}`}>
                            <strong>{source.document_name ?? "Captured Knowledge"}</strong>
                            <span>{source.label}</span>
                            <p>{source.value}</p>
                            <small>{source.source_quality?.replaceAll("_", " ") ?? "Knowledge source"}</small>
                          </div>
                        ))}
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
