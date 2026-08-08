"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  getBusinessEntityDetail,
  getBusinessGraph,
  type BusinessEntityDetail,
  type BusinessGraphInsight,
  type BusinessGraphResponse,
  type Company,
} from "@/lib/api";

const kindLabels: Record<string, string> = {
  workspace: "Workspace",
  knowledge_space: "Knowledge Space",
  knowledge: "Knowledge",
  document: "Business source",
  decision: "Decision",
  memory: "Executive memory",
  research: "Research task",
  entity: "Business entity",
};

const metricKindMap: Record<string, string> = {
  knowledge_spaces: "knowledge_space",
  knowledge_items: "knowledge",
  documents: "document",
  decisions: "decision",
  memories: "memory",
  research_tasks: "research",
  entities: "entity",
};

const metricLabels: Record<string, string> = {
  knowledge_spaces: "Knowledge Spaces",
  knowledge_items: "Knowledge Items",
  documents: "Documents",
  decisions: "Decisions",
  memories: "Memories",
  research_tasks: "Research Tasks",
  entities: "AI Entities",
};

function healthTone(score: number): string {
  if (score >= 80) return "strong";
  if (score >= 60) return "stable";
  if (score >= 40) return "attention";
  return "risk";
}

function insightPriority(insight: BusinessGraphInsight): number {
  if (insight.level === "risk") return 4;
  if (insight.level === "attention") return 3;
  if (insight.level === "pattern") return 2;
  return 1;
}

function confidenceLabel(value: number): string {
  if (value >= 0.9) return "Very high";
  if (value >= 0.75) return "High";
  if (value >= 0.55) return "Medium";
  return "Low";
}

export default function BusinessGraphPanel({
  company,
  onError,
}: {
  company: Company | null;
  onError: (message: string) => void;
}) {
  const [graph, setGraph] = useState<BusinessGraphResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedKind, setSelectedKind] = useState("all");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const [entityDetail, setEntityDetail] = useState<BusinessEntityDetail | null>(null);
  const [entityDetailLoading, setEntityDetailLoading] = useState(false);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    async function load() {
      if (!company) {
        setGraph(null);
        return;
      }

      setLoading(true);
      setSelectedKind("all");
      setSelectedNodeId(null);
      setSelectedDocumentId(null);
      setEntityDetail(null);
      try {
        setGraph(await getBusinessGraph(company.id));
      } catch (error) {
        onErrorRef.current(error instanceof Error ? error.message : "The business graph could not be loaded.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [company?.id]);

  async function refreshGraphData() {
    if (!company) return;
    setLoading(true);
    try {
      const nextGraph = await getBusinessGraph(company.id);
      setGraph(nextGraph);
      setSelectedNodeId((current) =>
        current && nextGraph.nodes.some((node) => node.id === current) ? current : null,
      );
      setSelectedKind((current) =>
        current === "all" || nextGraph.nodes.some((node) => node.kind === current) ? current : "all",
      );
      setSelectedDocumentId((current) =>
        current && nextGraph.nodes.some((node) => node.kind === "document" && node.source_id === current)
          ? current
          : null,
      );
    } catch (error) {
      onErrorRef.current(error instanceof Error ? error.message : "The business graph could not be refreshed.");
    } finally {
      setLoading(false);
    }
  }

  const kinds = useMemo(() => {
    if (!graph) return [];
    return Array.from(new Set(graph.nodes.map((node) => node.kind)));
  }, [graph]);

  const mappedDocumentOptions = useMemo(() => {
    if (!graph) return [];
    const entityNodes = graph.nodes.filter((node) => node.kind === "entity");
    const counts = new Map<number, number>();
    for (const entity of entityNodes) {
      for (const documentId of entity.source_document_ids ?? []) {
        counts.set(documentId, (counts.get(documentId) ?? 0) + 1);
      }
    }
    return graph.nodes
      .filter((node) => node.kind === "document" && node.source_id !== null && counts.has(node.source_id))
      .map((node) => ({
        id: node.source_id as number,
        label: node.label,
        count: counts.get(node.source_id as number) ?? 0,
      }));
  }, [graph]);

  const visibleNodes = useMemo(() => {
    if (!graph) return [];
    return graph.nodes.filter((node) => {
      if (selectedKind !== "all" && node.kind !== selectedKind) return false;
      if (selectedKind === "entity" && selectedDocumentId !== null) {
        return node.source_document_ids?.includes(selectedDocumentId) ?? false;
      }
      return true;
    });
  }, [graph, selectedKind, selectedDocumentId]);

  const orderedInsights = useMemo(() => {
    if (!graph) return [];
    return [...graph.insights].sort((a, b) => insightPriority(b) - insightPriority(a));
  }, [graph]);

  const selectedNode = graph?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedConnections = selectedNode && graph
    ? graph.edges
        .filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id)
        .slice(0, 12)
    : [];

  useEffect(() => {
    let cancelled = false;
    async function loadEntityDetail() {
      if (!company || !selectedNode || selectedNode.kind !== "entity" || selectedNode.source_id === null) {
        setEntityDetail(null);
        setEntityDetailLoading(false);
        return;
      }
      setEntityDetailLoading(true);
      try {
        const detail = await getBusinessEntityDetail(company.id, selectedNode.source_id);
        if (!cancelled) setEntityDetail(detail);
      } catch (error) {
        if (!cancelled) {
          setEntityDetail(null);
          onErrorRef.current(error instanceof Error ? error.message : "Entity evidence could not be loaded.");
        }
      } finally {
        if (!cancelled) setEntityDetailLoading(false);
      }
    }
    void loadEntityDetail();
    return () => {
      cancelled = true;
    };
  }, [company?.id, selectedNode?.id]);

  function applyKindFilter(kind: string) {
    setSelectedKind((current) => current === kind ? "all" : kind);
    if (kind !== "entity") setSelectedDocumentId(null);
    setSelectedNodeId(null);
  }

  function selectRelatedEntity(entityId: number) {
    const node = graph?.nodes.find((candidate) => candidate.id === `entity:${entityId}`);
    if (!node) return;
    setSelectedKind("entity");
    setSelectedDocumentId(null);
    setSelectedNodeId(node.id);
  }

  function selectEvidenceSource(sourceKind: string, sourceId: number) {
    const node = graph?.nodes.find((candidate) => candidate.id === `${sourceKind}:${sourceId}`);
    if (!node) return;
    setSelectedKind("all");
    setSelectedDocumentId(null);
    setSelectedNodeId(node.id);
  }

  if (!company) {
    return (
      <section className="panel business-graph-empty">
        <h2>Select a workspace</h2>
        <p>Executive Intelligence is built separately for each business workspace.</p>
      </section>
    );
  }

  return (
    <div className="business-graph-page">
      <header className="page-heading business-graph-heading">
        <div>
          <span>Executive Intelligence Engine</span>
          <h1>Business Intelligence Map</h1>
          <p>
            A grounded view of the sources, Knowledge, decisions, memories, entities, and evidence shaping {company.name}.
          </p>
        </div>
        <div className="business-graph-heading-actions">
          <button type="button" onClick={() => void refreshGraphData()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh data"}
          </button>
          <small>AI entity mapping is managed per asset in Business Intelligence.</small>
        </div>
      </header>

      {graph && (
        <section className="business-graph-readonly-note" aria-label="Business Graph entity information">
          <div>
            <strong>Read-only intelligence map</strong>
            <span>
              {graph.generated_from.entities ?? 0} mapped business entit{(graph.generated_from.entities ?? 0) === 1 ? "y" : "ies"} are currently connected to this workspace.
            </span>
          </div>
          <span>Every entity can now be traced back to its evidence.</span>
        </section>
      )}

      {loading && !graph && (
        <section className="panel business-graph-loading">
          <span>◎</span>
          <div>
            <strong>Reading the current business state</strong>
            <p>This is a bounded read-only view and does not reprocess your documents.</p>
          </div>
        </section>
      )}

      {graph && (
        <>
          <section className={`panel business-graph-brief tone-${healthTone(graph.health_score)}`}>
            <div className="business-graph-health">
              <span>Business health</span>
              <strong>{graph.health_score}</strong>
              <small>{graph.health_label}</small>
            </div>
            <div className="business-graph-brief-copy">
              <small>Executive overview</small>
              <h2>{graph.executive_summary}</h2>
              <p>Based only on records currently stored in this workspace.</p>
            </div>
            {orderedInsights[0]?.recommended_action && (
              <div className="business-graph-next-action">
                <small>Recommended next action</small>
                <strong>{orderedInsights[0].recommended_action}</strong>
                {orderedInsights[0].target_kind && (
                  <button type="button" onClick={() => applyKindFilter(orderedInsights[0].target_kind ?? "all")}>
                    Review {kindLabels[orderedInsights[0].target_kind] ?? orderedInsights[0].target_kind}
                  </button>
                )}
              </div>
            )}
          </section>

          <section className="business-graph-metrics" aria-label="Business object filters">
            {Object.entries(graph.generated_from).map(([key, value]) => {
              const kind = metricKindMap[key] ?? "all";
              const active = selectedKind === kind;
              return (
                <button
                  type="button"
                  key={key}
                  className={active ? "active" : ""}
                  onClick={() => applyKindFilter(kind)}
                  aria-pressed={active}
                >
                  <strong>{value}</strong>
                  <span>{metricLabels[key] ?? key.replaceAll("_", " ")}</span>
                  <small>{active ? "Showing only" : "Click to filter"}</small>
                </button>
              );
            })}
          </section>

          <section className="business-graph-layout">
            <div className="panel business-graph-map">
              <div className="business-graph-toolbar">
                <div>
                  <strong>{selectedKind === "all" ? "Business relationships" : kindLabels[selectedKind]}</strong>
                  <small>{visibleNodes.length} visible object{visibleNodes.length === 1 ? "" : "s"}</small>
                </div>
                <div className="business-graph-toolbar-actions">
                  {selectedKind === "entity" && mappedDocumentOptions.length > 0 && (
                    <label className="business-graph-source-filter">
                      <span>Evidence source</span>
                      <select
                        value={selectedDocumentId ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          setSelectedDocumentId(value ? Number(value) : null);
                          setSelectedNodeId(null);
                        }}
                      >
                        <option value="">All mapped assets</option>
                        {mappedDocumentOptions.map((document) => (
                          <option value={document.id} key={document.id}>
                            {document.label} ({document.count})
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {selectedKind !== "all" && (
                    <button type="button" onClick={() => applyKindFilter("all")}>Clear filter</button>
                  )}
                  <select value={selectedKind} onChange={(event) => {
                    setSelectedKind(event.target.value);
                    if (event.target.value !== "entity") setSelectedDocumentId(null);
                    setSelectedNodeId(null);
                  }}>
                    <option value="all">All business objects</option>
                    {kinds.map((kind) => (
                      <option value={kind} key={kind}>{kindLabels[kind] ?? kind}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="business-graph-node-list">
                {visibleNodes.length === 0 ? (
                  <div className="business-graph-no-results">
                    <strong>No objects in this category yet</strong>
                    <p>Add or capture relevant business information to grow the map.</p>
                  </div>
                ) : visibleNodes.map((node) => (
                  <button
                    type="button"
                    key={node.id}
                    className={`business-graph-node kind-${node.kind} ${selectedNodeId === node.id ? "selected" : ""}`}
                    onClick={() => setSelectedNodeId(node.id)}
                  >
                    <span className="business-graph-node-dot" />
                    <span className="business-graph-node-copy">
                      <small>{kindLabels[node.kind] ?? node.kind}</small>
                      <strong>{node.label}</strong>
                      {node.subtitle && <p>{node.subtitle}</p>}
                      {node.kind === "entity" && node.source_count > 0 && (
                        <span className="business-graph-source-badge">
                          {node.source_count} source{node.source_count === 1 ? "" : "s"}
                        </span>
                      )}
                    </span>
                    {node.status && <em>{node.status.replaceAll("_", " ")}</em>}
                  </button>
                ))}
              </div>
            </div>

            <aside className="business-graph-side">
              <section className="panel business-graph-insights">
                <div className="business-graph-section-title">
                  <strong>What GrowthOS notices</strong>
                  <small>Prioritised and grounded in workspace records</small>
                </div>
                {orderedInsights.length === 0 ? (
                  <p className="business-graph-muted">Add more sources, Knowledge, decisions, or research to reveal patterns.</p>
                ) : orderedInsights.map((insight, insightIndex) => (
                  <article className={`business-graph-insight level-${insight.level}`} key={`${insight.level}-${insightIndex}-${insight.title}`}>
                    <small>{insight.level}</small>
                    <strong>{insight.title}</strong>
                    <p>{insight.summary}</p>
                    {insight.evidence.length > 0 && (
                      <ul>{insight.evidence.map((item, evidenceIndex) => (
                        <li key={`${insight.title}-${evidenceIndex}-${item}`}>{item}</li>
                      ))}</ul>
                    )}
                    {insight.recommended_action && (
                      <div className="business-graph-insight-action">
                        <small>Next action</small>
                        <span>{insight.recommended_action}</span>
                      </div>
                    )}
                  </article>
                ))}
              </section>

              <section className="panel business-graph-details">
                <div className="business-graph-section-title">
                  <strong>{selectedNode?.kind === "entity" ? "Entity evidence" : "Selected object"}</strong>
                  <small>{selectedNode?.kind === "entity" ? "Trace this entity back to its business sources" : "Choose an item to inspect its relationships"}</small>
                </div>
                {!selectedNode ? (
                  <p className="business-graph-muted">Select an object from the map to see how it connects to the workspace.</p>
                ) : (
                  <>
                    <span className={`business-graph-type kind-${selectedNode.kind}`}>
                      {kindLabels[selectedNode.kind] ?? selectedNode.kind}
                    </span>
                    <h2>{selectedNode.label}</h2>
                    {selectedNode.subtitle && <p>{selectedNode.subtitle}</p>}

                    {selectedNode.kind === "entity" && (
                      <div className="business-entity-detail-shell">
                        {entityDetailLoading ? (
                          <p className="business-graph-muted">Loading grounded evidence…</p>
                        ) : entityDetail ? (
                          <>
                            <div className="business-entity-confidence">
                              <div><span>Confidence</span><strong>{Math.round(entityDetail.confidence * 100)}%</strong></div>
                              <small>{confidenceLabel(entityDetail.confidence)} confidence · {entityDetail.source_count} supporting source{entityDetail.source_count === 1 ? "" : "s"}</small>
                            </div>

                            <div className="business-entity-evidence">
                              <strong>Evidence</strong>
                              {entityDetail.evidence_sources.length === 0 ? (
                                <p className="business-graph-muted">No source evidence is available for this entity yet.</p>
                              ) : entityDetail.evidence_sources.map((source) => (
                                <button
                                  type="button"
                                  key={`${source.source_kind}-${source.source_id}`}
                                  onClick={() => selectEvidenceSource(source.source_kind, source.source_id)}
                                >
                                  <span>{source.source_kind.replaceAll("_", " ")}</span>
                                  <strong>{source.title}</strong>
                                  {source.evidence && <p>{source.evidence}</p>}
                                  <small>{Math.round(source.confidence * 100)}% evidence confidence</small>
                                </button>
                              ))}
                            </div>

                            {entityDetail.related_entities.length > 0 && (
                              <div className="business-entity-related">
                                <strong>Related entities</strong>
                                <div>
                                  {entityDetail.related_entities.map((related) => (
                                    <button type="button" key={related.id} onClick={() => selectRelatedEntity(related.id)}>
                                      <span>{related.entity_type}</span>
                                      <strong>{related.name}</strong>
                                      <small>{related.shared_source_count} shared source{related.shared_source_count === 1 ? "" : "s"}</small>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="business-graph-muted">Evidence details are unavailable for this entity.</p>
                        )}
                      </div>
                    )}

                    {selectedNode.kind !== "entity" && selectedConnections.length > 0 ? (
                      <div className="business-graph-connections">
                        <strong>Connections</strong>
                        {selectedConnections.map((edge, index) => {
                          const otherId = edge.source === selectedNode.id ? edge.target : edge.source;
                          const other = graph.nodes.find((node) => node.id === otherId);
                          return (
                            <button
                              type="button"
                              key={`${edge.source}-${edge.target}-${index}`}
                              onClick={() => other && setSelectedNodeId(other.id)}
                            >
                              <span>{edge.relationship}</span>
                              <strong>{other?.label ?? otherId}</strong>
                            </button>
                          );
                        })}
                      </div>
                    ) : selectedNode.kind !== "entity" ? (
                      <p className="business-graph-muted">No additional relationships are stored for this object yet.</p>
                    ) : null}
                  </>
                )}
              </section>
            </aside>
          </section>
        </>
      )}
    </div>
  );
}
