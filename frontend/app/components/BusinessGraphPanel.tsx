"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getBusinessGraph,
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
};

const metricKindMap: Record<string, string> = {
  knowledge_spaces: "knowledge_space",
  knowledge_items: "knowledge",
  documents: "document",
  decisions: "decision",
  memories: "memory",
  research_tasks: "research",
};

const metricLabels: Record<string, string> = {
  knowledge_spaces: "Knowledge Spaces",
  knowledge_items: "Knowledge Items",
  documents: "Documents",
  decisions: "Decisions",
  memories: "Memories",
  research_tasks: "Research Tasks",
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

  useEffect(() => {
    async function load() {
      if (!company) {
        setGraph(null);
        return;
      }

      setLoading(true);
      setSelectedKind("all");
      setSelectedNodeId(null);
      try {
        setGraph(await getBusinessGraph(company.id));
      } catch (error) {
        onError(error instanceof Error ? error.message : "The business graph could not be loaded.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [company, onError]);

  const kinds = useMemo(() => {
    if (!graph) return [];
    return Array.from(new Set(graph.nodes.map((node) => node.kind)));
  }, [graph]);

  const visibleNodes = useMemo(() => {
    if (!graph) return [];
    return graph.nodes.filter((node) => selectedKind === "all" || node.kind === selectedKind);
  }, [graph, selectedKind]);

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

  function applyKindFilter(kind: string) {
    setSelectedKind((current) => current === kind ? "all" : kind);
    setSelectedNodeId(null);
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
      <header className="page-heading">
        <span>Executive Intelligence Engine</span>
        <h1>Business Intelligence Map</h1>
        <p>
          A grounded view of the sources, Knowledge, decisions, memories, and evidence shaping {company.name}.
        </p>
      </header>

      {loading && (
        <section className="panel business-graph-loading">
          <span>◎</span>
          <div>
            <strong>Mapping the current business state</strong>
            <p>This is a bounded read-only view and does not reprocess your documents.</p>
          </div>
        </section>
      )}

      {!loading && graph && (
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
                  {selectedKind !== "all" && (
                    <button type="button" onClick={() => applyKindFilter("all")}>Clear filter</button>
                  )}
                  <select value={selectedKind} onChange={(event) => applyKindFilter(event.target.value)}>
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
                  <strong>Selected object</strong>
                  <small>Choose an item to inspect its relationships</small>
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
                    {selectedConnections.length > 0 ? (
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
                    ) : (
                      <p className="business-graph-muted">No additional relationships are stored for this object yet.</p>
                    )}
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
