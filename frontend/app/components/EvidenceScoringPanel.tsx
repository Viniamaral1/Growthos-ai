"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ConfidenceRing from "@/app/components/ConfidenceRing";
import {
  getEvidenceScoring,
  getKnowledgeSpaces,
  type Company,
  type EvidenceScoreItem,
  type EvidenceScoreSummary,
  type KnowledgeSpace,
} from "@/lib/api";

type Props = {
  company: Company | null;
  activeSpaceId: number | null;
  onActiveSpaceChange: (spaceId: number | null) => void;
  onError?: (message: string) => void;
};

function levelLabel(value: EvidenceScoreItem["level"]) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function EvidenceScoringPanel({ company, activeSpaceId, onActiveSpaceChange, onError }: Props) {
  const [summary, setSummary] = useState<EvidenceScoreSummary | null>(null);
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [openFactor, setOpenFactor] = useState<Record<string, boolean>>({});
  const onErrorRef = useRef(onError);

  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    if (!company) {
      setSummary(null);
      setSpaces([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getEvidenceScoring(company.id, activeSpaceId),
      getKnowledgeSpaces(company.id),
    ])
      .then(([nextSummary, nextSpaces]) => {
        if (cancelled) return;
        setSummary(nextSummary);
        setSpaces(nextSpaces.filter((space) => !space.is_archived));
      })
      .catch((error) => {
        if (!cancelled) onErrorRef.current?.(error instanceof Error ? error.message : "Evidence scoring could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [company?.id, activeSpaceId]);

  const projectName = useMemo(
    () => activeSpaceId === null ? "All projects" : spaces.find((space) => space.id === activeSpaceId)?.name ?? "Current project",
    [activeSpaceId, spaces],
  );

  return (
    <section className="evidence-score-panel">
      <header className="evidence-score-header">
        <div>
          <p className="eyebrow">Evidence Intelligence</p>
          <h1>How trustworthy is the business evidence?</h1>
          <p>GrowthOS scores evidence quality separately from AI confidence and business impact.</p>
          <small>Project: <b>{projectName}</b></small>
        </div>
        <label className="evidence-project-select">
          <span>Project</span>
          <select
            value={activeSpaceId ?? "all"}
            onChange={(event) => onActiveSpaceChange(event.target.value === "all" ? null : Number(event.target.value))}
            disabled={!company || loading}
          >
            <option value="all">All projects</option>
            {spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
          </select>
        </label>
      </header>

      {!company ? (
        <div className="empty-state">Select a workspace first.</div>
      ) : loading ? (
        <div className="empty-state">Scoring evidence…</div>
      ) : !summary ? (
        <div className="empty-state">Evidence scoring is unavailable.</div>
      ) : summary.total_items === 0 ? (
        <div className="evidence-empty">
          <strong>No Knowledge evidence to score yet.</strong>
          <p>Capture reusable Knowledge first. Evidence Intelligence will then score the strength of its supporting sources.</p>
        </div>
      ) : (
        <>
          <div className="evidence-score-summary">
            <div className="evidence-score-overall">
              <ConfidenceRing value={summary.average_score ?? 0} label="Evidence" size={68} />
              <div><strong>{summary.average_score ?? 0}% average evidence strength</strong><span>{summary.total_items} Knowledge facts reviewed</span></div>
            </div>
            <div><strong>{summary.strong_items}</strong><span>Strong</span></div>
            <div><strong>{summary.moderate_items}</strong><span>Moderate</span></div>
            <div><strong>{summary.weak_items}</strong><span>Weak</span></div>
            <div><strong>{summary.multi_source_items}</strong><span>Multi-source</span></div>
            <div><strong>{summary.active_contradictions}</strong><span>Open conflicts</span></div>
          </div>

          <p className="evidence-score-explainer">{summary.explanation}</p>

          <div className="evidence-score-list">
            {summary.items.map((item) => {
              const isOpen = Boolean(expanded[item.knowledge_item_id]);
              return (
                <article key={item.knowledge_item_id} className={`evidence-score-card evidence-level-${item.level}`}>
                  <div className="evidence-score-card-main">
                    <ConfidenceRing
                      value={item.overall_score}
                      label="Evidence"
                      size={62}
                      onClick={() => setExpanded((current) => ({ ...current, [item.knowledge_item_id]: !isOpen }))}
                      title={`Why is this evidence ${item.overall_score}%?`}
                    />
                    <div className="evidence-score-card-copy">
                      <div className="evidence-score-card-title">
                        <div><small>Knowledge fact #{item.knowledge_item_id}</small><h3>{item.title}</h3></div>
                        <span className={`evidence-level-badge ${item.level}`}>{levelLabel(item.level)}</span>
                      </div>
                      <p className="evidence-score-value">{item.value}</p>
                      <div className="evidence-score-meta">
                        <span>{item.source_count} source{item.source_count === 1 ? "" : "s"}</span>
                        <span>{item.active_contradictions} active contradiction{item.active_contradictions === 1 ? "" : "s"}</span>
                        <span>{item.age_days === null ? "Age unknown" : `${item.age_days} day${item.age_days === 1 ? "" : "s"} since latest evidence`}</span>
                      </div>
                      <p className="evidence-score-recommendation">{item.recommendation}</p>
                    </div>
                    <button type="button" className="evidence-review-toggle" onClick={() => setExpanded((current) => ({ ...current, [item.knowledge_item_id]: !isOpen }))}>
                      {isOpen ? "Hide score" : "Show score"}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="evidence-score-details">
                      <div className="evidence-score-factor-grid">
                        {item.factors.map((factor) => {
                          const key = `${item.knowledge_item_id}:${factor.key}`;
                          const factorOpen = Boolean(openFactor[key]);
                          return (
                            <button key={factor.key} type="button" className="evidence-factor" onClick={() => setOpenFactor((current) => ({ ...current, [key]: !factorOpen }))}>
                              <span><strong>{factor.label}</strong><em>{factor.score}/{factor.maximum}</em></span>
                              <div className="evidence-factor-track"><i style={{ width: `${Math.round((factor.score / factor.maximum) * 100)}%` }} /></div>
                              {factorOpen && <small>{factor.detail}</small>}
                            </button>
                          );
                        })}
                      </div>

                      <div className="evidence-score-columns">
                        <section><h4>Why GrowthOS trusts this</h4>{item.strengths.length ? item.strengths.map((entry) => <p key={entry}>✓ {entry}</p>) : <p>No additional strengths recorded.</p>}</section>
                        <section><h4>What needs attention</h4>{item.cautions.length ? item.cautions.map((entry) => <p key={entry}>⚠ {entry}</p>) : <p>No evidence caveats currently identified.</p>}</section>
                      </div>

                      <section className="evidence-source-list">
                        <h4>Supporting sources</h4>
                        {item.sources.length ? item.sources.map((source, index) => (
                          <div key={`${item.knowledge_item_id}:${source.document_id ?? "none"}:${index}`} className="evidence-source-row">
                            <div><strong>{source.document_name ?? "Unknown source"}</strong><small>{source.source_type}</small></div>
                            <span>{source.authority_score}/100 authority</span>
                            <span className={source.is_superseded ? "source-superseded" : "source-current"}>{source.is_superseded ? "Superseded" : "Current"}</span>
                          </div>
                        )) : <p>No direct document source is linked.</p>}
                      </section>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
