"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  searchWorkspaceSemantically,
  type Company,
  type WorkspaceSemanticSearchResult,
} from "@/lib/api";

type SearchScope = "knowledge" | "chat";
type DialogMode = "normal" | "fullscreen" | "minimized";
type ChatMode =
  | "summaries"
  | "current"
  | "recent_5"
  | "recent_20"
  | "saved"
  | "full_history";
type PerformanceMode = "safe" | "balanced" | "deep";

const CHAT_MODE_LABELS: Record<ChatMode, string> = {
  summaries: "Conversation summaries",
  current: "Most recent conversation",
  recent_5: "Recent 5 conversations",
  recent_20: "Recent 20 conversations",
  saved: "Saved conversations",
  full_history: "Full history summaries",
};

export default function SemanticWorkspaceSearch({
  company,
  activeSpaceId,
  onError,
}: {
  company: Company;
  activeSpaceId: number | null;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>("normal");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("knowledge");
  const [currentSpaceOnly, setCurrentSpaceOnly] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>("summaries");
  const [performanceMode, setPerformanceMode] = useState<PerformanceMode>("safe");
  const [showSettings, setShowSettings] = useState(false);
  const [results, setResults] = useState<WorkspaceSemanticSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [selected, setSelected] = useState<WorkspaceSemanticSearchResult | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestNumberRef = useRef(0);

  useEffect(() => {
    if (!open || dialogMode === "minimized") return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open, dialogMode]);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (selected) return setSelected(null);
      if (loading) return cancelSearch();
      close();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, selected, loading]);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  function resetResults() {
    setResults([]);
    setSearched(false);
    setCancelled(false);
  }

  function chooseScope(nextScope: SearchScope) {
    if (loading || nextScope === scope) return;
    setScope(nextScope);
    setCurrentSpaceOnly(false);
    resetResults();
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function cancelSearch() {
    requestNumberRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setLoading(false);
    setCancelled(true);
    setSearched(false);
  }

  function close() {
    cancelSearch();
    setOpen(false);
    setSelected(null);
    setDialogMode("normal");
    setQuery("");
    setScope("knowledge");
    setCurrentSpaceOnly(false);
    setShowSettings(false);
    resetResults();
  }

  async function runSearch(event?: FormEvent) {
    event?.preventDefault();
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 3 || loading) return;

    const controller = new AbortController();
    const requestNumber = requestNumberRef.current + 1;
    requestNumberRef.current = requestNumber;
    abortControllerRef.current = controller;
    setLoading(true);
    setCancelled(false);
    setSearched(false);
    setResults([]);

    try {
      const response = await searchWorkspaceSemantically(
        {
          company_id: company.id,
          query: trimmedQuery,
          active_space_id: activeSpaceId,
          scope,
          current_space_only:
            scope === "knowledge" && currentSpaceOnly && activeSpaceId !== null,
          chat_mode: chatMode,
          performance_mode: performanceMode,
          limit: 8,
          minimum_score: 0.32,
        },
        controller.signal,
      );
      if (controller.signal.aborted || requestNumberRef.current !== requestNumber) return;
      setResults(response.results);
      setSearched(true);
    } catch (error) {
      if (controller.signal.aborted || requestNumberRef.current !== requestNumber) return;
      onError(error instanceof Error ? error.message : "Search could not be completed.");
      setSearched(true);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setLoading(false);
      }
    }
  }

  const scopeLabel = scope === "knowledge" ? "Knowledge" : "Executive Team";

  return (
    <>
      <button
        type="button"
        className="semantic-search-launch"
        onClick={() => setOpen(true)}
        data-tooltip="Search saved information by meaning"
      >
        <span>⌕</span> Semantic search
      </button>

      {open && dialogMode === "minimized" && (
        <button
          type="button"
          className="semantic-search-minibar"
          onClick={() => setDialogMode("normal")}
          aria-label="Restore semantic search"
        >
          <span>⌕</span>
          <strong>Semantic search</strong>
          <small>{loading ? `Searching ${scopeLabel}…` : query || "Ready"}</small>
          <em>Restore</em>
        </button>
      )}

      {open && dialogMode !== "minimized" && (
        <div className="semantic-search-backdrop" role="presentation" onMouseDown={close}>
          <section
            className={`semantic-search-dialog ${dialogMode === "fullscreen" ? "is-fullscreen" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label="Semantic workspace search"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="semantic-search-mark">⌕</span>
                <div>
                  <small>Semantic search</small>
                  <h2>Search by meaning</h2>
                </div>
              </div>
              <div className="semantic-search-window-actions">
                <button type="button" onClick={() => setDialogMode("minimized")} aria-label="Minimise search">—</button>
                <button
                  type="button"
                  onClick={() => setDialogMode(dialogMode === "fullscreen" ? "normal" : "fullscreen")}
                  aria-label={dialogMode === "fullscreen" ? "Restore search window" : "Open search full screen"}
                >
                  {dialogMode === "fullscreen" ? "❐" : "□"}
                </button>
                <button type="button" onClick={close} aria-label="Close search">×</button>
              </div>
            </header>

            <div className="semantic-search-toolbar">
              <div className="semantic-search-scope" role="tablist" aria-label="Search area">
                <button type="button" role="tab" aria-selected={scope === "knowledge"} className={scope === "knowledge" ? "active" : ""} onClick={() => chooseScope("knowledge")} disabled={loading}>Knowledge</button>
                <button type="button" role="tab" aria-selected={scope === "chat"} className={scope === "chat" ? "active" : ""} onClick={() => chooseScope("chat")} disabled={loading}>Executive Team</button>
              </div>
              <button type="button" className="semantic-search-settings-button" onClick={() => setShowSettings((value) => !value)} disabled={loading}>⚙ Settings</button>
            </div>

            {showSettings && (
              <div className="semantic-search-settings">
                {scope === "knowledge" ? (
                  <label>
                    <input type="checkbox" checked={currentSpaceOnly} onChange={(event) => { setCurrentSpaceOnly(event.target.checked); resetResults(); }} disabled={loading || activeSpaceId === null} />
                    Search only the current Knowledge Space
                  </label>
                ) : (
                  <>
                    <label>
                      Search source
                      <select value={chatMode} onChange={(event) => { setChatMode(event.target.value as ChatMode); resetResults(); }} disabled={loading}>
                        {Object.entries(CHAT_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label>
                      Performance
                      <select value={performanceMode} onChange={(event) => { setPerformanceMode(event.target.value as PerformanceMode); resetResults(); }} disabled={loading}>
                        <option value="safe">Safe — recommended</option>
                        <option value="balanced">Balanced</option>
                        <option value="deep">Deep summaries</option>
                      </select>
                    </label>
                    <p>Executive Team search uses compact conversation summaries. It never creates embeddings from full chat history during a search.</p>
                  </>
                )}
              </div>
            )}

            <form className="semantic-search-form" onSubmit={runSearch}>
              <div className="semantic-search-input-wrap">
                <span>⌕</span>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => { setQuery(event.target.value); resetResults(); }}
                  placeholder={scope === "knowledge" ? "Describe the Knowledge item you remember…" : "Describe the Executive Team discussion you remember…"}
                  disabled={loading}
                />
              </div>
              <div className="semantic-search-actions">
                <span>{loading ? `Searching ${scopeLabel}…` : cancelled ? "Search cancelled" : query.trim().length < 3 ? "Enter at least 3 characters" : "Press Enter or click Search"}</span>
                {loading ? (
                  <button type="button" className="semantic-search-cancel" onClick={cancelSearch}>Cancel</button>
                ) : (
                  <button type="submit" className="semantic-search-submit" disabled={query.trim().length < 3}>Search</button>
                )}
              </div>
            </form>

            <div className="semantic-search-status">
              <span>{searched ? `${results.length} relevant ${results.length === 1 ? "result" : "results"}` : scope === "chat" ? `${CHAT_MODE_LABELS[chatMode]} · ${performanceMode}` : `Searching ${scopeLabel} only`}</span>
              <strong>Maximum 8 results</strong>
            </div>

            <div className="semantic-search-results">
              {!searched && !loading ? (
                <div className="semantic-search-empty"><strong>{cancelled ? "Search cancelled" : "Search only when you are ready"}</strong><p>{scope === "chat" ? "Executive Team search uses safe summaries so long conversations do not overload your computer." : "GrowthOS will search one area at a time and will not start while you type."}</p></div>
              ) : loading ? (
                <div className="semantic-search-empty semantic-search-working"><span className="semantic-search-spinner" aria-hidden="true" /><strong>Searching {scopeLabel}</strong><p>Click Cancel to stop waiting immediately.</p></div>
              ) : results.length === 0 ? (
                <div className="semantic-search-empty"><strong>No strong match found</strong><p>Try a broader description, another source, or a different phrase.</p></div>
              ) : (
                results.map((result) => (
                  <button key={`${result.source_type}-${result.source_id}`} type="button" onClick={() => setSelected(result)}>
                    <div className="semantic-result-icon">{result.source_type === "knowledge" ? "▦" : "◫"}</div>
                    <div className="semantic-result-copy">
                      <div><span>{result.source_type === "knowledge" ? result.space_name ?? "Knowledge" : "Executive Team"}</span><em>{Math.round(result.similarity_score * 100)}% match</em></div>
                      <strong>{result.title}</strong>
                      <p>{result.snippet}</p>
                      <small>{result.source_type === "knowledge" ? `${result.item_type ?? "note"} · ${new Date(result.created_at).toLocaleDateString()}` : `Conversation summary · ${new Date(result.created_at).toLocaleDateString()}`}</small>
                    </div>
                    <span className="semantic-result-open">Open</span>
                  </button>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {selected && (
        <div className="knowledge-preview-backdrop" role="presentation" onMouseDown={() => setSelected(null)}>
          <section className="knowledge-preview" role="dialog" aria-modal="true" aria-label={selected.title} onMouseDown={(event) => event.stopPropagation()}>
            <header><div><span>{selected.source_type === "knowledge" ? "▦" : "◫"}</span><div><small>{selected.source_type === "knowledge" ? selected.space_name ?? "Knowledge" : "Executive Team result"}</small><h2>{selected.title}</h2></div></div><button type="button" onClick={() => setSelected(null)} aria-label="Close preview">×</button></header>
            <div className="knowledge-preview-content">{selected.content}</div>
            <footer><span>{Math.round(selected.similarity_score * 100)}% relevance match</span><div><button type="button" className="subtle" onClick={() => setSelected(null)}>Back to results</button></div></footer>
          </section>
        </div>
      )}
    </>
  );
}
