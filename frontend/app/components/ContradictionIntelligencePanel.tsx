"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deleteContradiction,
  getContradictionLifecycleImpact,
  getContradictions,
  getKnowledgeSpaces,
  refreshContradictions,
  updateContradictionStatus,
  type Company,
  type ContradictionDeleteMode,
  type ContradictionLifecycleImpact,
  type ContradictionRecord,
  type ContradictionStatus,
  type KnowledgeSpace,
} from "@/lib/api";

type Props = {
  company: Company | null;
  activeSpaceId: number | null;
  onActiveSpaceChange: (spaceId: number | null) => void;
  onError?: (message: string) => void;
  onSuccess?: (message: string) => void;
};

type ResolutionChoice =
  | "confirm_contradiction"
  | "source_a_authoritative"
  | "source_b_authoritative"
  | "different_contexts"
  | "need_more_evidence"
  | "dismiss_false_positive";

const RESOLUTION_OPTIONS: Array<{ value: ResolutionChoice; label: string; detail: string; status: ContradictionStatus }> = [
  { value: "confirm_contradiction", label: "Confirm contradiction", detail: "Both sources are active and the conflict needs attention.", status: "confirmed" },
  { value: "source_a_authoritative", label: "Source A is authoritative", detail: "Keep Source A as the trusted position and preserve Source B as conflicting evidence.", status: "resolved" },
  { value: "source_b_authoritative", label: "Source B is authoritative", detail: "Keep Source B as the trusted position and preserve Source A as conflicting evidence.", status: "resolved" },
  { value: "different_contexts", label: "Both are valid in different contexts", detail: "The values differ because they apply to different time periods, scopes or situations.", status: "resolved" },
  { value: "need_more_evidence", label: "Need more evidence", detail: "Keep this contradiction open until another source confirms the business position.", status: "detected" },
  { value: "dismiss_false_positive", label: "Dismiss false positive", detail: "GrowthOS matched the records incorrectly or the difference is not a real conflict.", status: "dismissed" },
];

function severityLabel(value: ContradictionRecord["severity"]) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function ContradictionIntelligencePanel({
  company,
  activeSpaceId,
  onActiveSpaceChange,
  onError,
  onSuccess,
}: Props) {
  const [items, setItems] = useState<ContradictionRecord[]>([]);
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [lastReviewedAt, setLastReviewedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [resolutionTarget, setResolutionTarget] = useState<ContradictionRecord | null>(null);
  const [resolutionStep, setResolutionStep] = useState(0);
  const [resolutionChoice, setResolutionChoice] = useState<ResolutionChoice>("confirm_contradiction");
  const [resolutionNote, setResolutionNote] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ContradictionRecord | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<ContradictionLifecycleImpact | null>(null);
  const [deleteMode, setDeleteMode] = useState<ContradictionDeleteMode>("contradiction_only");
  const [deleteReason, setDeleteReason] = useState<string>("duplicate");
  const [deleteNote, setDeleteNote] = useState("");
  const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState<number[]>([]);
  const [deleteBusy, setDeleteBusy] = useState(false);

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

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, activeSpaceId]);

  async function runReview() {
    if (!company || refreshing) return;
    setRefreshing(true);
    try {
      const reviewed = await refreshContradictions(company.id, activeSpaceId);
      await load();
      const reviewedAt = new Date().toISOString();
      setLastReviewedAt(reviewedAt);
      onSuccess?.(
        reviewed.length === 0
          ? "Contradiction review completed. No supported active conflicts were detected."
          : `Contradiction review completed. GrowthOS found ${reviewed.length} supported conflict${reviewed.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Contradiction review failed.");
    } finally {
      setRefreshing(false);
    }
  }

  async function setStatus(item: ContradictionRecord, status: ContradictionStatus) {
    if (workingId !== null) return;
    setWorkingId(item.id);
    try {
      const updated = await updateContradictionStatus(item.id, status);
      setItems((current) => current.map((row) => (row.id === item.id ? updated : row)));
      onSuccess?.(`Contradiction marked ${status}.`);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Status could not be updated.");
    } finally {
      setWorkingId(null);
    }
  }

  function toggleSection(itemId: number, name: string) {
    const key = `${itemId}:${name}`;
    setOpenSections((current) => ({ ...current, [key]: !current[key] }));
  }

  function openResolution(item: ContradictionRecord) {
    setResolutionTarget(item);
    setResolutionStep(0);
    setResolutionChoice("confirm_contradiction");
    setResolutionNote("");
  }

  async function applyResolution() {
    if (!resolutionTarget || workingId !== null) return;
    const option = RESOLUTION_OPTIONS.find((entry) => entry.value === resolutionChoice) ?? RESOLUTION_OPTIONS[0];
    setWorkingId(resolutionTarget.id);
    try {
      const updated = await updateContradictionStatus(
        resolutionTarget.id,
        option.status,
        resolutionChoice,
        resolutionNote.trim() || null,
      );
      setItems((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      setResolutionTarget(null);
      onSuccess?.("Contradiction decision recorded with its resolution context.");
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Resolution could not be applied.");
    } finally {
      setWorkingId(null);
    }
  }

  async function openDelete(item: ContradictionRecord) {
    if (deleteBusy) return;
    setDeleteTarget(item);
    setDeleteImpact(null);
    setDeleteMode("contradiction_only");
    setDeleteReason("duplicate");
    setDeleteNote("");
    setSelectedKnowledgeIds([]);
    setDeleteBusy(true);
    try {
      const impact = await getContradictionLifecycleImpact(item.id);
      setDeleteImpact(impact);
    } catch (error) {
      setDeleteTarget(null);
      onError?.(error instanceof Error ? error.message : "Deletion impact could not be loaded.");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true);
    try {
      await deleteContradiction(
        deleteTarget.id,
        deleteMode,
        selectedKnowledgeIds,
        deleteReason || null,
        deleteNote.trim() || null,
      );
      setItems((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteImpact(null);
      onSuccess?.(
        deleteMode === "contradiction_only"
          ? "Contradiction deleted. Knowledge and Business Intelligence evidence were preserved."
          : "Contradiction deleted with the selected Knowledge scope. Original Business Intelligence documents were preserved.",
      );
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Contradiction could not be deleted.");
    } finally {
      setDeleteBusy(false);
    }
  }

  const currentProjectName = useMemo(
    () => (activeSpaceId === null ? "All projects" : spaces.find((space) => space.id === activeSpaceId)?.name ?? "Current project"),
    [activeSpaceId, spaces],
  );

  return (
    <section className="contradiction-panel">
      <header className="contradiction-header">
        <div>
          <p className="eyebrow">Contradiction Intelligence</p>
          <h1>Conflicting business evidence</h1>
          <p>GrowthOS checks whether two active business sources describe the same fact with incompatible values.</p>
          <small className="contradiction-context-line">
            Project: <b>{currentProjectName}</b>
            {lastReviewedAt && <> · Last reviewed {formatTimestamp(lastReviewedAt)}</>}
          </small>
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
            {refreshing ? "Analysing contradictions…" : "Run contradiction review"}
          </button>
        </div>
      </header>

      {!company ? (
        <div className="empty-state">Select a workspace first.</div>
      ) : loading ? (
        <div className="empty-state">Loading contradictions...</div>
      ) : items.length === 0 ? (
        <div className="contradiction-empty">
          <strong>No supported contradictions detected.</strong>
          <p>
            Project reviewed: <b>{currentProjectName}</b>. GrowthOS only surfaces supported active conflicts; proposals and superseded historical changes stay out of this list.
          </p>
          {lastReviewedAt && <small>Last reviewed {formatTimestamp(lastReviewedAt)}</small>}
        </div>
      ) : (
        <div className="contradiction-list">
          {items.map((item) => {
            const isBusy = workingId === item.id;
            return (
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
                    <div className="contradiction-timestamps">
                      <span>Created {formatTimestamp(item.detected_at)}</span>
                      <span>Updated {formatTimestamp(item.updated_at)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setExpanded((value) => ({ ...value, [item.id]: !value[item.id] }))}
                    disabled={isBusy}
                  >
                    {expanded[item.id] ? "Hide analysis" : "Review conflict"}
                  </button>
                </div>

                <div className="contradiction-values">
                  <div><small>Statement A</small><strong>{item.statement_a}</strong></div>
                  <span className="conflict-mark">≠</span>
                  <div><small>Statement B</small><strong>{item.statement_b}</strong></div>
                </div>

                {expanded[item.id] && (
                  <div className="contradiction-details contradiction-details-collapsible">
                    {[
                      ["why", "Why GrowthOS flagged this", item.reason],
                      ["impact", "Business impact", item.business_impact],
                      ["verification", "Recommended verification", item.recommended_verification],
                    ].map(([name, label, value]) => {
                      const key = `${item.id}:${name}`;
                      return (
                        <section key={name} className="contradiction-collapsible-section">
                          <button type="button" onClick={() => toggleSection(item.id, name)} aria-expanded={Boolean(openSections[key])}>
                            <span>{label}</span><b>{openSections[key] ? "−" : "+"}</b>
                          </button>
                          {openSections[key] && <p>{value}</p>}
                        </section>
                      );
                    })}

                    <section className="contradiction-collapsible-section">
                      <button type="button" onClick={() => toggleSection(item.id, "evidence")} aria-expanded={Boolean(openSections[`${item.id}:evidence`])}>
                        <span>Evidence ({item.evidence.length})</span><b>{openSections[`${item.id}:evidence`] ? "−" : "+"}</b>
                      </button>
                      {openSections[`${item.id}:evidence`] && (
                        <div className="contradiction-evidence-grid">
                          {item.evidence.map((evidence, index) => (
                            <article
                              key={`${item.id}-${evidence.role}-${evidence.document_id ?? "none"}-${evidence.knowledge_item_id ?? "none"}-${index}`}
                              className="contradiction-evidence-card"
                            >
                              <small>{evidence.role === "statement_a" ? "Source A" : evidence.role === "statement_b" ? "Source B" : "Supporting"}</small>
                              <strong>{evidence.document_name || "Captured Knowledge"}</strong>
                              <span>{evidence.label}: {evidence.value}</span>
                              {evidence.source_quality && <em>{evidence.source_quality.replaceAll("_", " ")}</em>}
                              <details>
                                <summary>Inspect source details</summary>
                                <span>Knowledge item #{evidence.knowledge_item_id ?? "—"}</span>
                                <span>Business Intelligence source #{evidence.document_id ?? "—"}</span>
                              </details>
                            </article>
                          ))}
                        </div>
                      )}
                    </section>

                    {item.resolution?.choice && (
                      <section className="contradiction-resolution-history">
                        <strong>Recorded decision</strong>
                        <span>{item.resolution.choice.replaceAll("_", " ")}</span>
                        {item.resolution.note && <p>{item.resolution.note}</p>}
                      </section>
                    )}

                    <div className="contradiction-actions">
                      <button disabled={isBusy} type="button" onClick={() => openResolution(item)}>
                        {isBusy ? "Processing…" : "Review / Resolve"}
                      </button>
                      <button disabled={isBusy} type="button" onClick={() => void setStatus(item, "confirmed")}>Confirm</button>
                      <button disabled={isBusy} type="button" onClick={() => void setStatus(item, "dismissed")}>Dismiss</button>
                      <button disabled={isBusy || deleteBusy} type="button" className="danger" onClick={() => void openDelete(item)}>
                        {deleteBusy && deleteTarget?.id === item.id ? "Checking impact…" : "Delete"}
                      </button>
                    </div>
                    {isBusy && <div className="contradiction-processing">Processing your request…</div>}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {resolutionTarget && (
        <div className="contradiction-wizard-backdrop" role="presentation">
          <section className="contradiction-wizard" role="dialog" aria-modal="true" aria-label="Contradiction resolution wizard">
            <header>
              <div><small>Contradiction Resolution Wizard</small><h2>{resolutionTarget.title}</h2></div>
              <button type="button" disabled={workingId === resolutionTarget.id} onClick={() => setResolutionTarget(null)}>×</button>
            </header>

            <nav className="contradiction-wizard-steps">
              {["Understand", "Evidence", "Decide", "Impact", "Apply"].map((label, index) => (
                <button key={label} type="button" className={resolutionStep === index ? "active" : ""} onClick={() => setResolutionStep(index)}>{index + 1}. {label}</button>
              ))}
            </nav>

            <div className="contradiction-wizard-body">
              {resolutionStep === 0 && (
                <>
                  <h3>Understand the conflict</h3>
                  <div className="contradiction-values">
                    <div><small>Statement A</small><strong>{resolutionTarget.statement_a}</strong></div>
                    <span className="conflict-mark">≠</span>
                    <div><small>Statement B</small><strong>{resolutionTarget.statement_b}</strong></div>
                  </div>
                  <p>{resolutionTarget.reason}</p>
                </>
              )}
              {resolutionStep === 1 && (
                <>
                  <h3>Inspect evidence</h3>
                  <div className="contradiction-evidence-grid">
                    {resolutionTarget.evidence.map((evidence, index) => (
                      <article key={`resolution-${resolutionTarget.id}-${index}`} className="contradiction-evidence-card">
                        <small>{evidence.role === "statement_a" ? "Source A" : "Source B"}</small>
                        <strong>{evidence.document_name || "Captured Knowledge"}</strong>
                        <span>{evidence.label}: {evidence.value}</span>
                        <em>{evidence.source_quality?.replaceAll("_", " ") ?? "captured evidence"}</em>
                      </article>
                    ))}
                  </div>
                </>
              )}
              {resolutionStep === 2 && (
                <>
                  <h3>Decide what the evidence means</h3>
                  <div className="contradiction-resolution-options">
                    {RESOLUTION_OPTIONS.map((option) => (
                      <label key={option.value} className={resolutionChoice === option.value ? "selected" : ""}>
                        <input type="radio" name="resolution-choice" checked={resolutionChoice === option.value} onChange={() => setResolutionChoice(option.value)} />
                        <span><strong>{option.label}</strong><small>{option.detail}</small></span>
                      </label>
                    ))}
                  </div>
                  <label className="contradiction-note-field">
                    Optional decision note
                    <textarea value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} placeholder="Record why this decision was made…" />
                  </label>
                </>
              )}
              {resolutionStep === 3 && (
                <>
                  <h3>Impact preview</h3>
                  <p>GrowthOS will record the decision on this contradiction without deleting either source document.</p>
                  <div className="contradiction-impact-preview">
                    <span>✓ Source A remains in Business Intelligence</span>
                    <span>✓ Source B remains in Business Intelligence</span>
                    <span>✓ Supporting Knowledge remains unless separately edited/deleted</span>
                    <span>✓ Resolution reason is preserved for audit/history</span>
                  </div>
                </>
              )}
              {resolutionStep === 4 && (
                <>
                  <h3>Apply reviewed decision</h3>
                  <p><strong>{RESOLUTION_OPTIONS.find((option) => option.value === resolutionChoice)?.label}</strong></p>
                  <p>{RESOLUTION_OPTIONS.find((option) => option.value === resolutionChoice)?.detail}</p>
                  {resolutionNote && <blockquote>{resolutionNote}</blockquote>}
                </>
              )}
            </div>

            <footer>
              <button type="button" className="secondary-button" disabled={resolutionStep === 0 || workingId === resolutionTarget.id} onClick={() => setResolutionStep((step) => Math.max(0, step - 1))}>Back</button>
              {resolutionStep < 4 ? (
                <button type="button" className="primary-button" onClick={() => setResolutionStep((step) => Math.min(4, step + 1))}>Continue</button>
              ) : (
                <button type="button" className="primary-button" disabled={workingId === resolutionTarget.id} onClick={() => void applyResolution()}>
                  {workingId === resolutionTarget.id ? "Applying decision…" : "Apply decision"}
                </button>
              )}
            </footer>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="contradiction-wizard-backdrop" role="presentation">
          <section className="contradiction-wizard contradiction-delete-wizard" role="dialog" aria-modal="true" aria-label="Contradiction deletion wizard">
            <header>
              <div><small>Contradiction lifecycle</small><h2>Delete this contradiction?</h2></div>
              <button type="button" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>×</button>
            </header>
            <div className="contradiction-wizard-body">
              {!deleteImpact ? (
                <div className="contradiction-processing">Checking linked evidence and dependencies…</div>
              ) : (
                <>
                  <p><strong>{deleteTarget.title}</strong></p>
                  <div className="contradiction-delete-impact">
                    <div><strong>{deleteImpact.knowledge_facts}</strong><span>Knowledge facts</span></div>
                    <div><strong>{deleteImpact.source_documents}</strong><span>Source documents</span></div>
                    <div><strong>{deleteImpact.linked_opportunities}</strong><span>Linked opportunities</span></div>
                    <div><strong>{deleteImpact.calendar_candidates}</strong><span>Calendar candidates</span></div>
                  </div>

                  <details open>
                    <summary>Inspect evidence before deleting</summary>
                    <div className="contradiction-evidence-grid">
                      {deleteImpact.evidence.map((evidence, index) => (
                        <article key={`delete-${deleteTarget.id}-${index}`} className="contradiction-evidence-card">
                          <small>{evidence.role === "statement_a" ? "Source A" : "Source B"}</small>
                          <strong>{evidence.document_name || "Captured Knowledge"}</strong>
                          <span>{evidence.label}: {evidence.value}</span>
                          <span>Knowledge #{evidence.knowledge_item_id ?? "—"} · Document #{evidence.document_id ?? "—"}</span>
                        </article>
                      ))}
                    </div>
                  </details>

                  <fieldset className="contradiction-delete-options">
                    <legend>What should GrowthOS remove?</legend>
                    <label><input type="radio" checked={deleteMode === "contradiction_only"} onChange={() => setDeleteMode("contradiction_only")} /> Delete contradiction only <small>Recommended. Keeps Knowledge and source documents.</small></label>
                    <label><input type="radio" checked={deleteMode === "contradiction_and_knowledge"} onChange={() => setDeleteMode("contradiction_and_knowledge")} /> Delete contradiction + selected Knowledge <small>Use only if the captured facts themselves are wrong.</small></label>
                    <label><input type="radio" checked={deleteMode === "remove_evidence"} onChange={() => setDeleteMode("remove_evidence")} /> Remove incorrect captured evidence <small>Removes selected Knowledge evidence, but preserves original Business Intelligence documents.</small></label>
                  </fieldset>

                  {deleteMode !== "contradiction_only" && (
                    <div className="contradiction-knowledge-selection">
                      <strong>Select Knowledge to remove</strong>
                      {deleteImpact.evidence.filter((entry) => entry.knowledge_item_id).map((evidence, index) => {
                        const id = Number(evidence.knowledge_item_id);
                        return (
                          <label key={`knowledge-delete-${id}-${index}`}>
                            <input
                              type="checkbox"
                              checked={selectedKnowledgeIds.includes(id)}
                              onChange={(event) => setSelectedKnowledgeIds((current) => event.target.checked ? [...new Set([...current, id])] : current.filter((value) => value !== id))}
                            />
                            <span>{evidence.label}: {evidence.value}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  <div className="contradiction-delete-reason">
                    <label>
                      Reason
                      <select value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)}>
                        <option value="duplicate">Duplicate</option>
                        <option value="incorrect_extraction">Incorrect extraction</option>
                        <option value="wrong_source">Wrong source</option>
                        <option value="no_longer_relevant">No longer relevant</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label>
                      Optional note
                      <textarea value={deleteNote} onChange={(event) => setDeleteNote(event.target.value)} placeholder="Why are you deleting this record?" />
                    </label>
                  </div>

                  <div className="contradiction-impact-preview">
                    <span>✓ Original Business Intelligence documents remain</span>
                    {deleteMode === "contradiction_only" ? <span>✓ Knowledge remains</span> : <span>⚠ Selected Knowledge will be removed</span>}
                    <span>✕ This contradiction record will be deleted</span>
                  </div>
                </>
              )}
            </div>
            <footer>
              <button type="button" className="secondary-button" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button
                type="button"
                className="danger"
                disabled={deleteBusy || !deleteImpact || (deleteMode !== "contradiction_only" && selectedKnowledgeIds.length === 0)}
                onClick={() => void confirmDelete()}
              >
                {deleteBusy ? "Processing deletion…" : deleteMode === "contradiction_only" ? "Delete contradiction only" : "Apply selected deletion"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
