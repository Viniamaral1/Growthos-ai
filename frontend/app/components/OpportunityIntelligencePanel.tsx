"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  deleteOpportunity,
  getOpportunityLifecycleImpact,
  getKnowledgeSpaces,
  getOpportunities,
  getOpportunityReviewState,
  refreshOpportunities,
  updateOpportunityStatus,
  type Company,
  type KnowledgeSpace,
  type OpportunityRecord,
  type OpportunityStatus,
  type OpportunityReviewState,
  type OpportunityLifecycleImpact,
} from "@/lib/api";

function statusLabel(status: OpportunityStatus): string {
  if (status === "confirmed") return "Confirmed";
  if (status === "dismissed") return "Dismissed";
  if (status === "resolved") return "Resolved";
  if (status === "expired") return "Expired";
  return "Needs review";
}

function statusExplanation(status: OpportunityStatus): string {
  if (status === "confirmed") return "A user confirmed this finding is worth tracking or acting on.";
  if (status === "dismissed") return "A user dismissed this finding. GrowthOS keeps the decision in history rather than resurfacing it as new.";
  if (status === "resolved") return "The opportunity was reviewed and marked complete.";
  if (status === "expired") return "The opportunity is no longer current because its timing or evidence has expired.";
  return "GrowthOS found a supported signal, but a user has not confirmed or dismissed it yet.";
}

function evidenceRoleLabel(role: "current" | "historical" | "supporting") {
  if (role === "current") return "Current evidence";
  if (role === "historical") return "Historical evidence";
  return "Additional supporting evidence";
}

function impactLabel(severity: OpportunityRecord["severity"]): string {
  if (severity === "warning") return "High attention";
  if (severity === "positive") return "Positive opportunity";
  return "Review impact";
}

function impactLevel(item: OpportunityRecord): { label: "Low" | "Medium" | "High" | "Critical"; reason: string } {
  if (item.opportunity_type === "contract_renewal_review" && item.delta_display?.includes("past")) {
    const days = Number(item.delta_display.match(/\d+/)?.[0] ?? "0");
    if (days >= 60) return { label: "Critical", reason: "A contract milestone is substantially overdue and may leave GrowthOS using an outdated agreement." };
    return { label: "High", reason: "A contract milestone has passed and needs status confirmation." };
  }
  if (item.severity === "warning") return { label: "High", reason: "The finding could increase cost, risk, or require a near-term decision." };
  if (item.severity === "positive") return { label: "Medium", reason: "The finding may create measurable value if the underlying commercial terms are confirmed." };
  return { label: "Low", reason: "The finding is useful context but does not currently indicate urgent financial or operational exposure." };
}

function whyThisMatters(item: OpportunityRecord): string {
  if (item.opportunity_type === "contract_renewal_review") {
    return "Until the agreement status is confirmed, later pricing, renewal and supplier recommendations may be based on an agreement that is no longer current.";
  }
  if (item.opportunity_type === "supplier_price_reduction") {
    return "A lower unit price can reduce procurement cost, but the saving should be checked against volume, quality, delivery and contract commitments.";
  }
  if (item.opportunity_type === "supplier_price_increase") {
    return "A higher unit price can reduce margin or increase annual spend, so the change may justify negotiation or supplier comparison.";
  }
  if (item.opportunity_type === "better_payment_terms") {
    return "A longer payment window can improve working-capital flexibility if the revised terms are reflected in the final agreement.";
  }
  if (item.opportunity_type === "worsening_payment_terms") {
    return "Earlier payment can create additional cash-flow pressure and may need negotiation before approval.";
  }
  if (item.opportunity_type === "superseded_reference") {
    return "Confirming the latest commercial reference prevents future decisions from linking to an obsolete quotation or contract version.";
  }
  if (item.opportunity_type === "volume_price_tradeoff") {
    return "A lower unit price is not necessarily a lower total cost when committed volume also increases.";
  }
  return item.delta_percent !== null
    ? `The measured change is ${Math.abs(item.delta_percent).toFixed(1)}%, which may affect future commercial decisions.`
    : "This change can affect later comparisons, planning or decisions if it becomes part of the current business position.";
}

function lifecycleRoleLabel(role: "current" | "historical" | "supporting") {
  if (role === "current") return "Current";
  if (role === "historical") return "Historical";
  return "Supporting";
}

function formatWhen(value: string | null | undefined): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function OpportunityIntelligencePanel({
  company,
  activeSpaceId,
  onActiveSpaceChange,
  onError,
  onSuccess,
}: {
  company: Company | null;
  activeSpaceId: number | null;
  onActiveSpaceChange: (spaceId: number | null) => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}) {
  const [items, setItems] = useState<OpportunityRecord[]>([]);
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [reviewState, setReviewState] = useState<OpportunityReviewState | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<OpportunityStatus | "all">("detected");
  const [analysisOpen, setAnalysisOpen] = useState<Record<number, boolean>>({});
  const [confidenceOpen, setConfidenceOpen] = useState<Record<number, boolean>>({});
  const [impactOpen, setImpactOpen] = useState<Record<number, boolean>>({});
  const [statusOpen, setStatusOpen] = useState<Record<number, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<OpportunityRecord | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<OpportunityLifecycleImpact | null>(null);
  const [deleteImpactLoading, setDeleteImpactLoading] = useState(false);
  const [moveTarget, setMoveTarget] = useState<OpportunityRecord | null>(null);
  const [selectedMoveSpaceId, setSelectedMoveSpaceId] = useState<number | null>(null);
  const [lifecycleInspect, setLifecycleInspect] = useState<OpportunityLifecycleImpact["sources"][number] | null>(null);

  const companyId = company?.id ?? null;

  const load = useCallback(async () => {
    if (companyId === null) {
      setItems([]);
      setSpaces([]);
      setReviewState(null);
      return;
    }
    setLoading(true);
    try {
      const [result, state, projectSpaces] = await Promise.all([
        getOpportunities(companyId, activeSpaceId, null),
        getOpportunityReviewState(companyId, activeSpaceId),
        getKnowledgeSpaces(companyId),
      ]);
      setItems(result);
      setReviewState(state);
      setSpaces(projectSpaces.filter((space) => !space.is_archived));
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
      const state = await getOpportunityReviewState(companyId, activeSpaceId);
      setItems(result);
      setReviewState(state);
      onSuccess(result.length === 0
        ? "Opportunity review completed. No material opportunity was supported by the current evidence."
        : `Opportunity review completed. GrowthOS found ${result.length} supported signal${result.length === 1 ? "" : "s"}.`);
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
      onSuccess(status === "confirmed" ? "Opportunity confirmed."
        : status === "dismissed" ? "Opportunity dismissed and retained in history."
        : status === "resolved" ? "Opportunity marked resolved."
        : status === "expired" ? "Opportunity marked expired."
        : "Opportunity returned to review.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Opportunity status could not be updated.");
    } finally {
      setWorkingId(null);
    }
  }

  async function confirmMove() {
    if (!moveTarget || selectedMoveSpaceId === null || workingId !== null) return;
    setWorkingId(moveTarget.id);
    try {
      const updated = await updateOpportunityStatus(moveTarget.id, null, selectedMoveSpaceId);
      setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
      setMoveTarget(null);
      setSelectedMoveSpaceId(null);
      onSuccess(`Opportunity moved to ${updated.space_name ?? "the selected project"}. Source Knowledge was not moved.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Opportunity could not be moved.");
    } finally {
      setWorkingId(null);
    }
  }

  async function openDeleteWizard(item: OpportunityRecord) {
    if (workingId !== null) return;
    setDeleteTarget(item);
    setDeleteImpact(null);
    setLifecycleInspect(null);
    setDeleteImpactLoading(true);
    try {
      setDeleteImpact(await getOpportunityLifecycleImpact(item.id));
    } catch (error) {
      onError(error instanceof Error ? error.message : "Opportunity dependencies could not be inspected.");
    } finally {
      setDeleteImpactLoading(false);
    }
  }

  async function dismissFromDeleteWizard() {
    if (!deleteTarget || workingId !== null) return;
    const target = deleteTarget;
    await changeStatus(target, "dismissed");
    setDeleteTarget(null);
    setDeleteImpact(null);
  }

  async function confirmDelete() {
    if (!deleteTarget || workingId !== null) return;
    setWorkingId(deleteTarget.id);
    try {
      await deleteOpportunity(deleteTarget.id);
      setItems((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteImpact(null);
      setLifecycleInspect(null);
      onSuccess("Opportunity deleted. Supporting Knowledge and source documents were preserved.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Opportunity could not be deleted.");
    } finally {
      setWorkingId(null);
    }
  }

  if (!company) {
    return <section className="opportunity-empty"><h2>Opportunity Intelligence</h2><p>Select a workspace first.</p></section>;
  }

  const filters: (OpportunityStatus | "all")[] = ["detected", "confirmed", "dismissed", "resolved", "expired", "all"];
  const activeSpaceName = activeSpaceId === null ? "All projects" : spaces.find((space) => space.id === activeSpaceId)?.name ?? "Current project";

  return (
    <section className="opportunity-shell">
      <header className="opportunity-hero">
        <div>
          <span className="eyebrow">Intelligence layer · Opportunity Detection</span>
          <h1>Opportunity Detection</h1>
          <p>GrowthOS compares current Knowledge with historical evidence and surfaces changes that may deserve a business decision. This review uses internal evidence only.</p>
        </div>
        <div className="opportunity-hero-actions">
          <label>
            <span>Project</span>
            <select value={activeSpaceId ?? "all"} onChange={(event) => onActiveSpaceChange(event.target.value === "all" ? null : Number(event.target.value))} disabled={loading || refreshing}>
              <option value="all">All projects</option>
              {spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
            </select>
          </label>
          <button className="primary-button" type="button" onClick={() => void runRefresh()} disabled={refreshing || loading}>
            {refreshing ? "Reviewing Knowledge…" : "Run opportunity review"}
          </button>
        </div>
      </header>

      <div className="opportunity-review-state">
        <div><span>Scope</span><strong>{activeSpaceName}</strong></div>
        <div><span>Last reviewed</span><strong>{formatWhen(reviewState?.last_reviewed_at)}</strong></div>
        <div><span>Latest Knowledge</span><strong>{formatWhen(reviewState?.latest_knowledge_at)}</strong></div>
      </div>

      {reviewState?.needs_review ? (
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
      </div>

      {loading ? <div className="opportunity-loading">Loading opportunity history…</div> : null}

      {!loading && visible.length === 0 ? (
        <div className="opportunity-empty opportunity-empty-rich">
          <h2>{reviewState?.last_reviewed_at ? "No opportunity signals in this view" : "Opportunity review has not been run for this scope"}</h2>
          <p>GrowthOS only saves an opportunity when the available Knowledge supports a meaningful business change, renewal milestone, or commercial signal.</p>
          <div className="opportunity-empty-details">
            <span>Last review: <strong>{formatWhen(reviewState?.last_reviewed_at)}</strong></span>
            <span>Latest Knowledge: <strong>{formatWhen(reviewState?.latest_knowledge_at)}</strong></span>
            <span>Current scope: <strong>{activeSpaceName}</strong></span>
          </div>
          <button type="button" className="secondary-button" onClick={() => void runRefresh()} disabled={refreshing || loading}>{refreshing ? "Reviewing…" : "Run opportunity review"}</button>
        </div>
      ) : null}

      <div className="opportunity-list">
        {visible.map((item) => {
          const analysisExpanded = Boolean(analysisOpen[item.id]);
          const confidenceExpanded = Boolean(confidenceOpen[item.id]);
          const impactExpanded = Boolean(impactOpen[item.id]);
          const statusExpanded = Boolean(statusOpen[item.id]);
          const working = workingId === item.id;
          const impact = impactLevel(item);
          const groupedEvidence = ["current", "historical", "supporting"].map((role) => ({
            role: role as "current" | "historical" | "supporting",
            sources: item.evidence.filter((source) => source.role === role),
          })).filter((group) => group.sources.length > 0);

          return (
            <article key={item.id} className={`opportunity-card severity-${item.severity} impact-${impact.label.toLowerCase()}`}>
              <div className="opportunity-card-head">
                <div>
                  <div className="opportunity-meta">
                    <span>{item.space_name ?? "Workspace"}</span>
                    <button type="button" className="opportunity-chip-button" onClick={() => setConfidenceOpen((current) => ({ ...current, [item.id]: !confidenceExpanded }))}>{item.confidence}% confidence</button>
                    <button type="button" className="opportunity-chip-button" onClick={() => setStatusOpen((current) => ({ ...current, [item.id]: !statusExpanded }))}>{statusLabel(item.status)}</button>
                  </div>
                  <h2>{item.title}</h2>
                  <p>{item.summary}</p>
                  <small className="opportunity-created">Created {formatWhen(item.detected_at)} · Last analysed {formatWhen(item.updated_at)}</small>
                </div>
                {item.delta_display ? <strong className="opportunity-delta">{item.delta_display}</strong> : null}
              </div>

              {confidenceExpanded ? (
                <div className="opportunity-inline-detail">
                  <strong>Why {item.confidence}% confidence?</strong>
                  {item.confidence_factors.map((factor, index) => (
                    <p key={`${item.id}-compact-factor-${index}`}><span>{factor.label}</span><b>+{factor.contribution}%</b><small>{factor.detail}</small></p>
                  ))}
                </div>
              ) : null}

              {statusExpanded ? (
                <div className="opportunity-inline-detail">
                  <strong>{statusLabel(item.status)}</strong>
                  <p>{statusExplanation(item.status)}</p>
                  <small>Last updated {formatWhen(item.updated_at)}</small>
                </div>
              ) : null}

              {(item.previous_value || item.current_value) ? (
                <div className="opportunity-compare">
                  <div><span>Previous</span><strong>{item.previous_value ?? "—"}</strong></div>
                  <span>→</span>
                  <div><span>Current</span><strong>{item.current_value ?? "—"}</strong></div>
                </div>
              ) : null}

              <button type="button" className={`opportunity-impact severity-${item.severity}`} onClick={() => setImpactOpen((current) => ({ ...current, [item.id]: !impactExpanded }))}>
                <span>Business impact · {impact.label}</span>
                <p>{item.business_impact}</p>
                <small>{impactExpanded ? "Hide context" : "Show why this matters"}</small>
              </button>

              {impactExpanded ? (
                <div className="opportunity-inline-detail">
                  <strong>Why this matters</strong>
                  <p>{whyThisMatters(item)}</p>
                  <small>{impact.reason}</small>
                  {item.delta_percent !== null ? <small>Measured change: {item.delta_percent > 0 ? "+" : ""}{item.delta_percent.toFixed(1)}%</small> : null}
                </div>
              ) : null}

              <div className="opportunity-recommendation">
                <span>Recommended action</span>
                <p>{item.recommended_action}</p>
              </div>

              <div className="opportunity-actions">
                <button type="button" onClick={() => setAnalysisOpen((current) => ({ ...current, [item.id]: !analysisExpanded }))}>{analysisExpanded ? "Hide analysis" : "Why / evidence"}</button>
                {item.status !== "confirmed" ? <button type="button" disabled={working} onClick={() => void changeStatus(item, "confirmed")}>{working ? "Saving…" : "Confirm"}</button> : null}
                {item.status !== "dismissed" ? <button type="button" disabled={working} onClick={() => void changeStatus(item, "dismissed")}>{working ? "Saving…" : "Dismiss"}</button> : null}
                {item.status === "confirmed" ? <button type="button" disabled={working} onClick={() => void changeStatus(item, "resolved")}>{working ? "Saving…" : "Mark resolved"}</button> : null}
                {item.status !== "detected" ? <button type="button" disabled={working} onClick={() => void changeStatus(item, "detected")}>{working ? "Saving…" : "Return to review"}</button> : null}
                <button type="button" disabled={working} onClick={() => { setMoveTarget(item); setSelectedMoveSpaceId(item.space_id); }}>Move</button>
                <button type="button" className="danger-button" disabled={working} onClick={() => void openDeleteWizard(item)}>Delete</button>
              </div>

              {analysisExpanded ? (
                <div className="opportunity-evidence">
                  <section>
                    <h3>Why GrowthOS surfaced this</h3>
                    <ul>{item.explanation.map((reason, index) => <li key={`${item.id}-reason-${index}`}>{reason}</li>)}</ul>

                    <details className="opportunity-confidence-box">
                      <summary className="opportunity-confidence-head"><strong>Why this confidence?</strong><span>{item.confidence}%</span></summary>
                      {item.confidence_factors.map((factor, index) => (
                        <div className="opportunity-confidence-factor" key={`${item.id}-factor-${index}`}>
                          <div><strong>{factor.label}</strong><span>+{factor.contribution}%</span></div>
                          {factor.detail ? <small>{factor.detail}</small> : null}
                        </div>
                      ))}
                    </details>
                  </section>

                  <section>
                    <h3>Supporting evidence</h3>
                    {groupedEvidence.map((group) => (
                      <details className="opportunity-evidence-group" key={`${item.id}-${group.role}`} open={group.role === "current"}>
                        <summary><h4>{evidenceRoleLabel(group.role)} <span>{group.sources.length}</span></h4></summary>
                        {group.sources.map((source, index) => (
                          <div className="opportunity-source" key={`${item.id}-${group.role}-${source.document_id ?? "no-doc"}-${source.knowledge_item_id ?? "no-fact"}-${index}`}>
                            <strong>{source.document_name ?? "Captured Knowledge"}</strong>
                            <span>{source.label}</span>
                            <p>{source.value}</p>
                            <small>{source.source_quality?.replaceAll("_", " ") ?? "Knowledge source"}</small>
                          </div>
                        ))}
                      </details>
                    ))}
                  </section>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {moveTarget ? (
        <div className="opportunity-dialog-backdrop" role="presentation">
          <section className="opportunity-dialog" role="dialog" aria-modal="true" aria-label="Move opportunity">
            <header><div><span className="eyebrow">Opportunity management</span><h2>Move this opportunity</h2></div><button type="button" onClick={() => setMoveTarget(null)} disabled={workingId !== null}>×</button></header>
            <p>This moves the opportunity record only. The source document and captured Knowledge stay in their existing projects.</p>
            <label><span>Destination project</span><select value={selectedMoveSpaceId ?? ""} onChange={(event) => setSelectedMoveSpaceId(Number(event.target.value))}>{spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}</select></label>
            <footer><button type="button" onClick={() => setMoveTarget(null)} disabled={workingId !== null}>Cancel</button><button type="button" className="primary-button" onClick={() => void confirmMove()} disabled={workingId !== null || selectedMoveSpaceId === null}>{workingId !== null ? "Moving…" : "Move opportunity"}</button></footer>
          </section>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="opportunity-dialog-backdrop" role="presentation">
          <section className="opportunity-dialog opportunity-lifecycle-dialog" role="dialog" aria-modal="true" aria-label="Opportunity lifecycle">
            <header><div><span className="eyebrow">Opportunity lifecycle</span><h2>Before deleting, check what this finding depends on</h2><p>{deleteTarget.title}</p></div><button type="button" onClick={() => { setDeleteTarget(null); setDeleteImpact(null); setLifecycleInspect(null); }} disabled={workingId !== null}>×</button></header>
            {deleteImpactLoading ? <div className="opportunity-lifecycle-loading">Checking source Knowledge and evidence…</div> : null}
            {deleteImpact ? (
              <div className="opportunity-lifecycle-body">
                <div className="opportunity-lifecycle-stats">
                  <button type="button" onClick={() => document.getElementById("opportunity-lifecycle-evidence")?.scrollIntoView({ behavior: "smooth", block: "start" })}><strong>{deleteImpact.knowledge_facts}</strong><span>Knowledge facts</span><small>Inspect</small></button>
                  <button type="button" onClick={() => document.getElementById("opportunity-lifecycle-evidence")?.scrollIntoView({ behavior: "smooth", block: "start" })}><strong>{deleteImpact.source_documents}</strong><span>Source documents</span><small>Inspect</small></button>
                  <button type="button" onClick={() => document.getElementById("opportunity-lifecycle-dependencies")?.scrollIntoView({ behavior: "smooth", block: "start" })}><strong>{deleteImpact.calendar_candidates}</strong><span>Calendar candidates</span><small>Inspect</small></button>
                  <button type="button" onClick={() => document.getElementById("opportunity-lifecycle-dependencies")?.scrollIntoView({ behavior: "smooth", block: "start" })}><strong>{deleteImpact.graph_entities}</strong><span>Direct graph links</span><small>Inspect</small></button>
                </div>
                <details id="opportunity-lifecycle-evidence" className="opportunity-lifecycle-sources" open>
                  <summary>Inspect supporting evidence <span>{deleteImpact.sources.length}</span></summary>
                  {deleteImpact.sources.map((source, index) => (
                    <button
                      type="button"
                      className="opportunity-lifecycle-source-button"
                      key={`${deleteTarget.id}-lifecycle-${source.role}-${source.document_id ?? "no-doc"}-${source.knowledge_item_id ?? "no-fact"}-${index}`}
                      onClick={() => setLifecycleInspect(source)}
                    >
                      <strong>{source.document_name ?? "Captured Knowledge"}</strong>
                      <span>{lifecycleRoleLabel(source.role)} evidence · {source.label}</span>
                      <p>{source.value}</p>
                      <small>Open evidence details</small>
                    </button>
                  ))}
                </details>
                {lifecycleInspect ? (
                  <section className="opportunity-lifecycle-inspector" aria-live="polite">
                    <div>
                      <span className="eyebrow">Evidence inspection</span>
                      <h3>{lifecycleInspect.document_name ?? "Captured Knowledge"}</h3>
                    </div>
                    <button type="button" onClick={() => setLifecycleInspect(null)}>Close details</button>
                    <dl>
                      <div><dt>Evidence role</dt><dd>{lifecycleRoleLabel(lifecycleInspect.role)}</dd></div>
                      <div><dt>Business fact</dt><dd>{lifecycleInspect.label}</dd></div>
                      <div><dt>Captured value</dt><dd>{lifecycleInspect.value}</dd></div>
                      <div><dt>Project</dt><dd>{deleteTarget.space_name ?? "Workspace"}</dd></div>
                      <div><dt>Document ID</dt><dd>{lifecycleInspect.document_id ?? "Not linked"}</dd></div>
                      <div><dt>Knowledge fact ID</dt><dd>{lifecycleInspect.knowledge_item_id ?? "Not linked"}</dd></div>
                    </dl>
                    <p>This preview shows exactly which evidence supports the opportunity. Deleting the opportunity does not delete this source or captured Knowledge.</p>
                  </section>
                ) : null}
                <div id="opportunity-lifecycle-dependencies" className="opportunity-lifecycle-dependency-summary">
                  <strong>Other linked dependencies</strong>
                  <p>{deleteImpact.calendar_candidates} calendar candidate{deleteImpact.calendar_candidates === 1 ? "" : "s"} and {deleteImpact.graph_entities} direct graph link{deleteImpact.graph_entities === 1 ? "" : "s"} are associated with this finding.</p>
                  <small>These remain preserved when you delete the opportunity only.</small>
                </div>
                <div className="opportunity-lifecycle-guidance">
                  <strong>What deletion means</strong>
                  {deleteImpact.guidance.map((line, index) => <p key={`${deleteTarget.id}-guidance-${index}`}>{line}</p>)}
                </div>
              </div>
            ) : null}
            <footer>
              <button type="button" onClick={() => { setDeleteTarget(null); setDeleteImpact(null); setLifecycleInspect(null); }} disabled={workingId !== null}>Cancel</button>
              <button type="button" onClick={() => void dismissFromDeleteWizard()} disabled={workingId !== null}>{workingId !== null ? "Saving…" : "Dismiss instead"}</button>
              <button type="button" className="danger-button" onClick={() => void confirmDelete()} disabled={workingId !== null || deleteImpactLoading}>{workingId !== null ? "Deleting…" : "Delete opportunity only"}</button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
