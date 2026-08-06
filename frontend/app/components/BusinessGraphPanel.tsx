"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getBusinessGraph,
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

  const selectedNode = graph?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedConnections = selectedNode && graph
    ? graph.edges
        .filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id)
        .slice(0, 12)
    : [];

  if (!company) {
    return (
      <section className="panel business-graph-empty">
        <h2>Select a workspace</h2>
        <p>The Business Graph is built separately for each business workspace.</p>
      </section>
    );
  }

  return (
    <div className="business-graph-page">
      <header className="page-heading">
        <span>Executive Intelligence Engine</span>
        <h1>Business Graph</h1>
        <p>
          A live map of the sources, Knowledge, decisions, memories, and evidence shaping {company.name}.
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
          <section className="business-graph-metrics">
            {Object.entries(graph.generated_from).map(([key, value]) => (
              <article key={key}>
                <strong>{value}</strong>
                <span>{key.replaceAll("_", " ")}</span>
              </article>
            ))}
          </section>

          <section className="business-graph-layout">
            <div className="panel business-graph-map">
              <div className="business-graph-toolbar">
                <div>
                  <strong>Business relationships</strong>
                  <small>{visibleNodes.length} visible nodes</small>
                </div>
                <select value={selectedKind} onChange={(event) => setSelectedKind(event.target.value)}>
                  <option value="all">All business objects</option>
                  {kinds.map((kind) => (
                    <option value={kind} key={kind}>{kindLabels[kind] ?? kind}</option>
                  ))}
                </select>
              </div>

              <div className="business-graph-node-list">
                {visibleNodes.map((node) => (
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
                  <small>Grounded in current workspace records</small>
                </div>
                {graph.insights.length === 0 ? (
                  <p className="business-graph-muted">Add more sources, Knowledge, decisions, or research to reveal patterns.</p>
                ) : graph.insights.map((insight) => (
                  <article className={`business-graph-insight level-${insight.level}`} key={`${insight.level}-${insight.title}`}>
                    <small>{insight.level}</small>
                    <strong>{insight.title}</strong>
                    <p>{insight.summary}</p>
                    {insight.evidence.length > 0 && (
                      <ul>{insight.evidence.map((item, evidenceIndex) => (
                        <li key={`${insight.title}-${evidenceIndex}-${item}`}>{item}</li>
                      ))}</ul>
                    )}
                  </article>
                ))}
              </section>

              <section className="panel business-graph-details">
                <div className="business-graph-section-title">
                  <strong>Selected object</strong>
                  <small>Choose an item from the map</small>
                </div>
                {!selectedNode ? (
                  <p className="business-graph-muted">Select a node to inspect its current relationships.</p>
                ) : (
                  <>
                    <span className={`business-graph-type kind-${selectedNode.kind}`}>
                      {kindLabels[selectedNode.kind] ?? selectedNode.kind}
                    </span>
                    <h2>{selectedNode.label}</h2>
                    {selectedNode.subtitle && <p>{selectedNode.subtitle}</p>}
                    {selectedConnections.length > 0 && (
                      <div className="business-graph-connections">
                        <strong>Connections</strong>
                        {selectedConnections.map((edge, index) => {
                          const otherId = edge.source === selectedNode.id ? edge.target : edge.source;
                          const other = graph.nodes.find((node) => node.id === otherId);
                          return (
                            <div key={`${edge.source}-${edge.target}-${index}`}>
                              <span>{edge.relationship}</span>
                              <strong>{other?.label ?? otherId}</strong>
                            </div>
                          );
                        })}
                      </div>
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
