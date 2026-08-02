"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import ExecutiveComposer from "@/app/components/chat/ExecutiveComposer";
import type {
  ComposerAttachment,
} from "@/app/components/chat/AttachmentBar";
import {
  ChatStreamController,
} from "@/lib/chat-stream-controller";

import {
  readStoredBoolean,
  readStoredNumber,
  removeStoredValue,
  uiStorageKeys,
  writeStoredBoolean,
  writeStoredNumber,
} from "@/lib/ui-storage";

import {
  cancelConversationGeneration,
  createConversation,
  createExecutiveMemory,
  createDecision,
  createKnowledgeSpace,
  captureKnowledgeItem,
  getKnowledgeSpaces,
  deleteConversation,
  editConversationMessage,
  getConversation,
  getConversations,
  getDocumentClassification,
  renameConversation,
  streamCofounderMessage,
  submitResponseFeedback,
  uploadDocument,
  processDocument,
  type AnswerSource,
  type ChatMessage,
  type Company,
  type ConversationDetail,
  type ConversationSummary,
  type DocumentRecord,
  type DocumentClassification,
  type ExecutiveMemoryProposal,
  type ExecutiveMemoryType,
  type ExecutiveRole,
  type KnowledgeSpace,
} from "@/lib/api";


function isImmediateTask(message: string): boolean {
  const cleaned = message.toLowerCase().replace(/\s+/g, " ").trim();
  return [
    /\b(write|draft|rewrite|compose|create)\b.{0,40}\b(email|letter|message|reply|proposal|summary|caption|post)\b/,
    /\b(send|email)\b.{0,40}\b(supplier|customer|client|team|manager|landlord|courier)\b/,
    /\b(summarise|summarize|translate|proofread|correct|edit)\b/,
    /\b(new question|different question|another task|change topic|stop research|exit research)\b/,
  ].some((pattern) => pattern.test(cleaned));
}


const CONTINUE_INSTRUCTION =
  "Continue the previous response from exactly where it stopped. Do not repeat completed sections.";

function inferKnowledgeType(content: string): string {
  const text = content.toLowerCase();
  if (/\b(subject:|dear |kind regards|sincerely|email|letter)\b/.test(text)) return "email";
  if (/\b(decided|decision|approved|we will|we chose)\b/.test(text)) return "decision";
  if (/\b(research|evidence|findings|assumption|market analysis)\b/.test(text)) return "research";
  if (/\b(strategy|positioning|roadmap|objective|priority)\b/.test(text)) return "strategy";
  if (/\b(next action|task|todo|to-do|owner|deadline)\b/.test(text)) return "task";
  if (/\b(idea|concept|opportunity|what if)\b/.test(text)) return "idea";
  return "note";
}

function suggestKnowledgeSpaceId(content: string, spaces: KnowledgeSpace[]): number | null {
  const text = content.toLowerCase();
  const exact = spaces.find((space) => text.includes(space.name.toLowerCase()));
  if (exact) return exact.id;
  const words = new Set(text.split(/[^a-z0-9]+/).filter((word) => word.length > 3));
  const scored = spaces.map((space) => ({
    id: space.id,
    score: space.name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).filter((word) => words.has(word)).length,
  })).sort((a, b) => b.score - a.score);
  return scored[0]?.score ? scored[0].id : spaces[0]?.id ?? null;
}

function normalizeConversationMessages(messages: ChatMessage[]): ChatMessage[] {
  const normalized: ChatMessage[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (
      message.role === "user" &&
      message.content.trim() === CONTINUE_INSTRUCTION
    ) {
      const continuation = messages[index + 1];
      const previous = normalized[normalized.length - 1];
      if (
        continuation?.role === "assistant" &&
        previous?.role === "assistant"
      ) {
        normalized[normalized.length - 1] = {
          ...previous,
          content: `${previous.content.trimEnd()}${previous.content.trim() ? "\n\n" : ""}${continuation.content.trimStart()}`,
          created_at: continuation.created_at,
        };
        index += 1;
      }
      continue;
    }
    normalized.push(message);
  }
  return normalized;
}

function normalizeConversation(detail: ConversationDetail): ConversationDetail {
  return {
    ...detail,
    messages: normalizeConversationMessages(detail.messages),
  };
}


function mergeConversation(
  conversations: ConversationSummary[],
  conversation: ConversationSummary,
): ConversationSummary[] {
  return [
    conversation,
    ...conversations.filter(
      (item) => item.id !== conversation.id,
    ),
  ];
}


function SourceCards({
  sources,
}: {
  sources: AnswerSource[];
}) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="cofounder-sources">
      {sources.map((source) => (
        <article key={`${source.chunk_id}-${source.source_id}`}>
          <header>
            <strong>{source.source_id}</strong>
            <span>
              {source.document_name}
              {source.page_number
                ? ` · page ${source.page_number}`
                : ""}
            </span>
          </header>
          <p>{source.text}</p>
        </article>
      ))}
    </div>
  );
}





function MemoryProposalCard({
  proposal,
  companyId,
  onSaved,
  onDismissed,
  onError,
}: {
  proposal: ExecutiveMemoryProposal;
  companyId: number;
  onSaved: () => void;
  onDismissed: () => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    executive_role: proposal.executive_role,
    memory_type: proposal.memory_type,
    title: proposal.title,
    summary: proposal.summary,
    details: proposal.details ?? "",
    importance: proposal.importance,
  });

  async function saveMemory() {
    setSaving(true);
    try {
      await createExecutiveMemory({
        company_id: companyId,
        executive_role: draft.executive_role,
        memory_type: draft.memory_type,
        title: draft.title.trim(),
        summary: draft.summary.trim(),
        details: draft.details.trim() || null,
        importance: draft.importance,
        source_conversation_id: proposal.source_conversation_id,
        source_message_id: proposal.source_message_id,
      });
      onSaved();
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "The proposed memory could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="memory-proposal-card">
      <header>
        <div>
          <span>Memory suggestion</span>
          <strong>GrowthOS thinks this may be worth remembering</strong>
        </div>
        <b>{draft.importance}/10</b>
      </header>

      {editing ? (
        <div className="memory-proposal-editor">
          <div>
            <label>
              Executive
              <select
                value={draft.executive_role}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    executive_role:
                      event.target.value as ExecutiveRole,
                  }))
                }
              >
                {["ceo", "cfo", "cmo", "coo", "research", "board"].map(
                  (role) => (
                    <option key={role} value={role}>
                      {role.toUpperCase()}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              Type
              <select
                value={draft.memory_type}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    memory_type:
                      event.target.value as ExecutiveMemoryType,
                  }))
                }
              >
                {[
                  "decision", "fact", "preference", "goal", "risk",
                  "customer", "competitor", "strategy", "meeting", "task",
                ].map((memoryType) => (
                  <option key={memoryType} value={memoryType}>
                    {memoryType}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            Title
            <input
              value={draft.title}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
          </label>

          <label>
            Summary
            <textarea
              rows={3}
              value={draft.summary}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  summary: event.target.value,
                }))
              }
            />
          </label>

          <label>
            Importance: {draft.importance}/10
            <input
              type="range"
              min={1}
              max={10}
              value={draft.importance}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  importance: Number(event.target.value),
                }))
              }
            />
          </label>
        </div>
      ) : (
        <div className="memory-proposal-preview">
          <small>
            {draft.executive_role.toUpperCase()} · {draft.memory_type}
          </small>
          <h4>{draft.title}</h4>
          <p>{draft.summary}</p>
          <em>{proposal.reason}</em>
        </div>
      )}

      <footer>
        <button
          type="button"
          onClick={() => void saveMemory()}
          disabled={
            saving ||
            draft.title.trim().length < 2 ||
            draft.summary.trim().length < 2
          }
        >
          {saving ? "Saving…" : "Save memory"}
        </button>
        <button
          type="button"
          onClick={() => setEditing((current) => !current)}
        >
          {editing ? "Preview" : "Edit"}
        </button>
        <button type="button" className="subtle" onClick={onDismissed}>
          Dismiss
        </button>
      </footer>
    </section>
  );
}


function MessageBubble({
  message,
  streaming,
  onCopy,
  onEdit,
  editing,
  editValue,
  onEditValueChange,
  onSaveEdit,
  onCancelEdit,
  onRegenerate,
  onSaveDecision,
  onSaveMemory,
  onCaptureKnowledge,
  onFeedback,
  onRetryOption,
  retryMenuOpen,
  onToggleRetryMenu,
  executiveName,
  messageExecutiveRole,
  companyId,
  onMemorySaved,
  onMemoryDismissed,
  onMemoryError,
}: {
  message: ChatMessage;
  streaming?: boolean;
  onCopy: (message: ChatMessage) => void;
  onEdit?: () => void;
  editing?: boolean;
  editValue?: string;
  onEditValueChange?: (value: string) => void;
  onSaveEdit?: () => void;
  onCancelEdit?: () => void;
  onRegenerate?: () => void;
  onSaveDecision?: () => void;
  onSaveMemory?: () => void;
  onCaptureKnowledge?: () => void;
  onFeedback?: (
    rating: "useful" | "not_useful",
  ) => void;
  onRetryOption?: (
    option:
      | "shorter"
      | "detailed"
      | "evidence"
      | "challenge"
      | "different_executive",
  ) => void;
  retryMenuOpen?: boolean;
  onToggleRetryMenu?: () => void;
  executiveName: string;
  messageExecutiveRole?: ExecutiveRole | null;
  companyId: number;
  onMemorySaved: () => void;
  onMemoryDismissed: () => void;
  onMemoryError: (message: string) => void;
}) {
  const assistant = message.role === "assistant";

  return (
    <article
      className={`cofounder-message ${message.role}`}
    >
      <div className="cofounder-message-avatar">
        {message.role === "user" ? "You" : "✦"}
      </div>

      <div className="cofounder-message-body">
        <header>
          <strong>
            {message.role === "user"
              ? "You"
              : `GrowthOS ${
                  messageExecutiveRole
                    ? {
                        auto: "CEO",
                        ceo: "CEO",
                        cfo: "CFO",
                        cmo: "CMO",
                        coo: "COO",
                        research: "Research Lead",
                        board: "Decision Room",
                      }[messageExecutiveRole]
                    : executiveName
                }`}
          </strong>

          <small>
            {streaming
              ? "Responding live…"
              : new Date(
                  message.created_at,
                ).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
          </small>
        </header>

        <div className={`cofounder-message-content ${editing ? "editing" : ""}`}>
          {editing ? (
            <div className="inline-message-editor">
              <textarea
                value={editValue ?? ""}
                onChange={(event) => onEditValueChange?.(event.target.value)}
                rows={Math.max(3, Math.min(10, (editValue ?? "").split("\n").length + 1))}
                autoFocus
              />
              <div>
                <button type="button" onClick={onSaveEdit}>Save & regenerate</button>
                <button type="button" className="subtle" onClick={onCancelEdit}>Cancel</button>
              </div>
            </div>
          ) : message.content || (
            <span className="professional-reasoning">
              <span className="reasoning-orbit">
                <i />
              </span>

              <span className="reasoning-copy">
                <strong>
                  GrowthOS is reasoning…
                </strong>
                <small>
                  {message.context_sources?.includes(
                    "documents",
                  )
                    ? "Retrieving relevant document evidence"
                    : message.context_sources?.includes(
                          "executive_memory",
                        )
                      ? "Recalling relevant executive memory"
                      : "Selecting focused business context"}
                </small>
              </span>
            </span>
          )}

          {streaming && message.content && (
            <span className="stream-cursor" />
          )}
        </div>

        <SourceCards sources={message.sources} />

        {assistant &&
          message.confidence_level &&
          message.confidence_score !== null && (
            <section
              className={`message-confidence ${message.confidence_level}`}
              title={
                message.confidence_reason ??
                "Grounding confidence"
              }
            >
              <span>
                {message.confidence_level === "high"
                  ? "●"
                  : message.confidence_level === "medium"
                    ? "◐"
                    : "○"}
              </span>
              <strong>
                {message.confidence_level} confidence
              </strong>
              <small>
                {message.confidence_score}/100 grounding
              </small>
            </section>
          )}

        {assistant &&
          message.context_sources &&
          message.context_sources.length > 0 && (
            <section
              className="message-context-selection"
              title={
                message.context_reason ??
                "Intelligent context selection"
              }
            >
              <span>◎</span>
              <strong>
                {message.context_mode ===
                "memory_and_documents"
                  ? "Memory + documents"
                  : message.context_mode ===
                      "executive_memory"
                    ? "Executive memory"
                    : message.context_mode ===
                        "documents"
                      ? "Documents"
                      : message.context_mode ===
                          "conversation_history"
                        ? "Conversation history"
                        : "Workspace context"}
              </strong>
              <small>
                {message.context_sources
                  .map((source) =>
                    source
                      .replaceAll("_", " "),
                  )
                  .join(" · ")}
              </small>
            </section>
          )}

        {assistant &&
          !streaming &&
          message.memory_proposal && (
            <MemoryProposalCard
              proposal={message.memory_proposal}
              companyId={companyId}
              onSaved={onMemorySaved}
              onDismissed={onMemoryDismissed}
              onError={onMemoryError}
            />
          )}

        {!assistant &&
          !streaming &&
          !editing &&
          message.content &&
          onEdit && (
            <footer className="professional-message-actions">
              <button
                type="button"
                onClick={onEdit}
                title="Edit this prompt in the composer"
              >
                <span aria-hidden="true">✎</span>
                <strong>Edit prompt</strong>
              </button>
            </footer>
          )}

        {assistant &&
          !streaming &&
          message.content && (
            <footer className="professional-message-actions">
              <button
                type="button"
                onClick={() => onCopy(message)}
                title="Copy response"
              >
                <span aria-hidden="true">⧉</span>
                <strong>Copy</strong>
              </button>

              {onCaptureKnowledge && (
                <button
                  type="button"
                  onClick={onCaptureKnowledge}
                  title="Capture this message in a Knowledge Space"
                >
                  <span aria-hidden="true">▧</span>
                  <strong>Capture</strong>
                </button>
              )}

              {onSaveMemory && (
                <button
                  type="button"
                  onClick={onSaveMemory}
                  title="Save this response to Executive Memory"
                >
                  <span aria-hidden="true">✦</span>
                  <strong>Save Memory</strong>
                </button>
              )}

              {onSaveDecision && (
                <button
                  type="button"
                  onClick={onSaveDecision}
                  title="Save as a tracked decision"
                >
                  <span aria-hidden="true">◇</span>
                  <strong>Track Decision</strong>
                </button>
              )}

              {onFeedback && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      onFeedback("useful")
                    }
                    title="This answer was useful"
                    aria-label="Mark answer useful"
                  >
                    <span aria-hidden="true">👍</span>
                    <strong>Useful</strong>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onFeedback("not_useful")
                    }
                    title="This answer needs improvement"
                    aria-label="Mark answer not useful"
                  >
                    <span aria-hidden="true">👎</span>
                    <strong>Improve</strong>
                  </button>
                </>
              )}

              {onRegenerate && (
                <div className="retry-action">
                  <button
                    type="button"
                    onClick={
                      onToggleRetryMenu ??
                      onRegenerate
                    }
                    title="Try the answer again"
                  >
                    <span aria-hidden="true">↻</span>
                    <strong>Try Again</strong>
                    <i aria-hidden="true">⌄</i>
                  </button>

                  {retryMenuOpen &&
                    onRetryOption && (
                      <div className="retry-options-menu">
                        <button
                          type="button"
                          onClick={() =>
                            onRetryOption("shorter")
                          }
                        >
                          Shorter
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            onRetryOption("detailed")
                          }
                        >
                          More detailed
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            onRetryOption("evidence")
                          }
                        >
                          Use more evidence
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            onRetryOption("challenge")
                          }
                        >
                          Challenge recommendation
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            onRetryOption(
                              "different_executive",
                            )
                          }
                        >
                          Ask another executive
                        </button>
                      </div>
                    )}
                </div>
              )}

              {message.sources.length > 0 && (
                <span className="professional-grounded-badge">
                  <i>✓</i>
                  {message.sources.length} source
                  {message.sources.length === 1
                    ? ""
                    : "s"}
                </span>
              )}
            </footer>
          )}
      </div>

      <style jsx>{`

.executive-team-selector {
  border-bottom: 1px solid rgba(148, 163, 184, 0.09);
  background:
    radial-gradient(
      circle at 12% 0%,
      rgba(59, 214, 208, 0.07),
      transparent 38%
    ),
    rgba(8, 18, 31, 0.32);
  padding: 13px 15px 12px;
}

.executive-team-intro {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 9px;
}

.executive-team-mark {
  display: grid;
  width: 31px;
  height: 31px;
  place-items: center;
  border: 1px solid rgba(59, 214, 208, 0.19);
  border-radius: 9px;
  background: rgba(59, 214, 208, 0.065);
  color: var(--cyan);
  font-size: 12px;
}

.executive-team-intro small,
.executive-team-intro strong {
  display: block;
}


.executive-router-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.reset-routing-button {
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.35);
  color: var(--muted);
  padding: 6px 9px;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.reset-routing-button:hover:not(:disabled) {
  border-color: rgba(59, 214, 208, 0.45);
  color: var(--text);
}

.reset-routing-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.executive-team-intro small {
  color: var(--cyan);
  font-size: 6px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.executive-team-intro strong {
  margin-top: 3px;
  color: var(--text);
  font-size: 8px;
}

.executive-role-grid {
  display: grid;
  grid-template-columns:
    minmax(190px, 1.35fr)
    repeat(4, minmax(110px, 0.65fr));
  gap: 6px;
}

.executive-role {
  display: grid;
  min-width: 0;
  min-height: 57px;
  grid-template-columns: 27px minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  border: 1px solid rgba(148, 163, 184, 0.09);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.014);
  padding: 7px 8px;
  color: var(--text-soft);
  text-align: left;
}

.executive-role > span {
  display: grid;
  width: 27px;
  height: 27px;
  place-items: center;
  border-radius: 8px;
  background: rgba(148, 163, 184, 0.055);
  color: #7e91a8;
  font-size: 10px;
}

.executive-role strong,
.executive-role small {
  display: block;
}

.executive-role strong {
  font-size: 7px;
}

.executive-role small {
  overflow: hidden;
  margin-top: 3px;
  color: #687b92;
  font-size: 5px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.executive-role > i {
  border-radius: 999px;
  padding: 3px 5px;
  color: #60738a;
  font-size: 5px;
  font-style: normal;
  font-weight: 800;
  text-transform: uppercase;
}

.executive-role.active {
  border-color: rgba(59, 214, 208, 0.24);
  background:
    linear-gradient(
      135deg,
      rgba(59, 214, 208, 0.09),
      rgba(155, 135, 245, 0.035)
    );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.025),
    0 7px 20px rgba(0, 0, 0, 0.12);
}

.executive-role.active > span {
  background: rgba(59, 214, 208, 0.10);
  color: var(--cyan);
}

.executive-role.active > i {
  background: rgba(66, 211, 154, 0.08);
  color: var(--emerald);
}

.executive-role.locked {
  opacity: 0.48;
  cursor: default;
}

@media (max-width: 1100px) {
  .executive-role-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .executive-role.active {
    grid-column: 1 / -1;
  }
}

@media (max-width: 650px) {
  .executive-role-grid {
    grid-template-columns: 1fr;
  }

  .executive-role.active {
    grid-column: auto;
  }

  .executive-role.locked {
    display: none;
  }
}

        .professional-reasoning {
          display: inline-flex;
          min-height: 46px;
          align-items: center;
          gap: 12px;
        }

        .reasoning-orbit {
          position: relative;
          display: grid;
          width: 34px;
          height: 34px;
          flex: 0 0 auto;
          place-items: center;
          border: 1px solid
            rgba(59, 214, 208, 0.17);
          border-radius: 50%;
          background: rgba(59, 214, 208, 0.035);
        }

        .reasoning-orbit::before {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--cyan);
          box-shadow:
            0 0 0 4px rgba(59, 214, 208, 0.06),
            0 0 14px rgba(59, 214, 208, 0.42);
          content: "";
        }

        .reasoning-orbit i {
          position: absolute;
          inset: 3px;
          border-top: 1px solid var(--violet);
          border-right: 1px solid transparent;
          border-radius: 50%;
          animation: reasoning-spin 0.95s linear infinite;
        }

        .reasoning-copy strong,
        .reasoning-copy small {
          display: block;
        }

        .reasoning-copy strong {
          color: var(--text);
          font-size: 8px;
          line-height: 1.3;
        }

        .reasoning-copy small {
          margin-top: 4px;
          color: var(--muted);
          font-size: 6px;
          line-height: 1.45;
        }

        .inline-message-editor {
          display: grid;
          gap: 9px;
          width: 100%;
        }

        .inline-message-editor textarea {
          width: 100%;
          resize: vertical;
          border: 1px solid rgba(59, 214, 208, 0.28);
          border-radius: 10px;
          background: rgba(5, 14, 25, 0.78);
          padding: 11px 12px;
          color: var(--text);
          font: inherit;
          line-height: 1.55;
          outline: none;
        }

        .inline-message-editor > div {
          display: flex;
          gap: 7px;
        }

        .inline-message-editor button {
          min-height: 30px;
          border: 1px solid rgba(59, 214, 208, 0.22);
          border-radius: 8px;
          background: rgba(59, 214, 208, 0.09);
          padding: 0 10px;
          color: var(--text);
          cursor: pointer;
        }

        .inline-message-editor button.subtle {
          border-color: rgba(148, 163, 184, 0.14);
          background: rgba(255, 255, 255, 0.02);
          color: var(--muted);
        }

        .professional-message-actions {
          display: flex;
          min-height: 33px;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 11px;
          padding-top: 9px;
          border-top: 1px solid
            rgba(148, 163, 184, 0.075);
          opacity: 0.72;
          transition: opacity 0.16s ease;
        }

        :global(.cofounder-message:hover)
          .professional-message-actions,
        .professional-message-actions:focus-within {
          opacity: 1;
        }

        .professional-message-actions button {
          display: inline-flex;
          min-height: 28px;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border: 1px solid
            rgba(148, 163, 184, 0.12);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.018);
          padding: 0 9px;
          color: #7f91a7;
          cursor: pointer;
          transition:
            border-color 0.15s ease,
            background 0.15s ease,
            color 0.15s ease,
            transform 0.15s ease;
        }

.memory-proposal-card {
  display: grid;
  gap: 10px;
  margin-top: 10px;
  border: 1px solid rgba(155, 135, 245, 0.22);
  border-radius: 12px;
  background: linear-gradient(
    145deg,
    rgba(155, 135, 245, 0.08),
    rgba(59, 214, 208, 0.035)
  );
  padding: 12px;
}

.memory-proposal-card > header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.memory-proposal-card > header div,
.memory-proposal-preview,
.memory-proposal-editor {
  display: grid;
  gap: 7px;
}

.memory-proposal-card > header span {
  color: var(--violet);
  font-size: 6px;
  font-weight: 850;
  text-transform: uppercase;
}

.memory-proposal-card > header strong,
.memory-proposal-card > header b,
.memory-proposal-preview p,
.memory-proposal-preview em {
  font-size: 7px;
}

.memory-proposal-card > header b {
  color: var(--cyan);
}

.memory-proposal-preview small,
.memory-proposal-editor label {
  color: var(--muted);
  font-size: 6px;
}

.memory-proposal-preview h4,
.memory-proposal-preview p {
  margin: 0;
}

.memory-proposal-editor > div {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}

.memory-proposal-editor label {
  display: grid;
  gap: 4px;
}

.memory-proposal-editor input,
.memory-proposal-editor select,
.memory-proposal-editor textarea {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 7px;
  background: rgba(5, 14, 25, 0.62);
  padding: 7px 8px;
  color: var(--text);
  font: inherit;
}

.memory-proposal-card > footer {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.memory-proposal-card > footer button {
  min-height: 29px;
  border: 1px solid rgba(155, 135, 245, 0.2);
  border-radius: 7px;
  background: rgba(155, 135, 245, 0.08);
  padding: 0 10px;
  color: var(--text);
  font-size: 6px;
  font-weight: 750;
  cursor: pointer;
}

.memory-proposal-card > footer button.subtle {
  background: transparent;
  color: var(--muted);
}

        .professional-message-actions button:hover {
          border-color: rgba(59, 214, 208, 0.24);
          background: rgba(59, 214, 208, 0.055);
          color: var(--cyan);
          transform: translateY(-1px);
        }

        .professional-message-actions button > span {
          display: inline-grid;
          width: 14px;
          height: 14px;
          place-items: center;
          font-size: 10px;
          line-height: 1;
        }

        .professional-message-actions button > strong {
          font-size: 6px;
          font-weight: 750;
          line-height: 1;
        }

        .professional-grounded-badge {
          display: inline-flex;
          min-height: 27px;
          align-items: center;
          gap: 5px;
          margin-left: auto;
          border: 1px solid
            rgba(66, 211, 154, 0.14);
          border-radius: 999px;
          background: rgba(66, 211, 154, 0.045);
          padding: 0 8px;
          color: var(--emerald);
          font-size: 6px;
          font-weight: 700;
        }

        .message-context-selection {
          display: inline-flex;
          width: fit-content;
          min-height: 28px;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
          border: 1px solid
            rgba(155, 135, 245, 0.16);
          border-radius: 999px;
          background: rgba(155, 135, 245, 0.045);
          padding: 0 9px;
          color: #b9adff;
        }

        .message-context-selection > span {
          font-size: 8px;
        }

        .message-context-selection > strong {
          font-size: 6px;
          font-weight: 800;
        }

        .message-context-selection > small {
          color: #8192a9;
          font-size: 5px;
          text-transform: capitalize;
        }

        .professional-grounded-badge i {
          display: grid;
          width: 14px;
          height: 14px;
          place-items: center;
          border-radius: 50%;
          background: rgba(66, 211, 154, 0.10);
          font-size: 7px;
          font-style: normal;
        }

        @keyframes reasoning-spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 760px) {
          .inline-message-editor {
          display: grid;
          gap: 9px;
          width: 100%;
        }

        .inline-message-editor textarea {
          width: 100%;
          resize: vertical;
          border: 1px solid rgba(59, 214, 208, 0.28);
          border-radius: 10px;
          background: rgba(5, 14, 25, 0.78);
          padding: 11px 12px;
          color: var(--text);
          font: inherit;
          line-height: 1.55;
          outline: none;
        }

        .inline-message-editor > div {
          display: flex;
          gap: 7px;
        }

        .inline-message-editor button {
          min-height: 30px;
          border: 1px solid rgba(59, 214, 208, 0.22);
          border-radius: 8px;
          background: rgba(59, 214, 208, 0.09);
          padding: 0 10px;
          color: var(--text);
          cursor: pointer;
        }

        .inline-message-editor button.subtle {
          border-color: rgba(148, 163, 184, 0.14);
          background: rgba(255, 255, 255, 0.02);
          color: var(--muted);
        }

        .professional-message-actions {
            opacity: 1;
          }

          .professional-grounded-badge {
            width: fit-content;
            margin-left: 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .reasoning-orbit i {
            animation: none;
          }

          .professional-message-actions button {
            transition: none;
          }
        }
      `}</style>
    </article>
  );
}

export default function CofounderChat({
  company,
  documents,
  activeDocumentId,
  useAllDocuments,
  onDocumentChange,
  onScopeChange,
  onDocumentReady,
  onError,
  onSuccess,
}: {
  company: Company | null;
  documents: DocumentRecord[];
  activeDocumentId: number | null;
  useAllDocuments: boolean;
  onDocumentChange: (documentId: number | null) => void;
  onScopeChange: (value: boolean) => void;
  onDocumentReady: (document: DocumentRecord) => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}) {
  const [conversations, setConversations] =
    useState<ConversationSummary[]>([]);
  const [activeConversation, setActiveConversation] =
    useState<ConversationDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [researchMode, setResearchMode] = useState(false);
  const [conversationSidebarCollapsed, setConversationSidebarCollapsed] = useState(true);
  const [executiveSelectorOpen, setExecutiveSelectorOpen] = useState(false);
  const [loadingList, setLoadingList] =
    useState(false);
  const [loadingConversation, setLoadingConversation] =
    useState(false);
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [canContinueAfterStop, setCanContinueAfterStop] = useState(false);
  const [renamingId, setRenamingId] =
    useState<number | null>(null);
  const [renameValue, setRenameValue] =
    useState("");
  const [conversationSearch, setConversationSearch] =
    useState("");
  const [executiveRole, setExecutiveRole] =
    useState<ExecutiveRole>("auto");
  const [resolvedExecutiveRole, setResolvedExecutiveRole] =
    useState<ExecutiveRole>("ceo");
  const [copiedMessageId, setCopiedMessageId] =
    useState<number | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [attachedDocuments, setAttachedDocuments] =
    useState<ComposerAttachment[]>([]);
  const [knowledgeSpaces, setKnowledgeSpaces] = useState<KnowledgeSpace[]>([]);
  const [captureMessage, setCaptureMessage] = useState<ChatMessage | null>(null);
  const [captureSpaceId, setCaptureSpaceId] = useState<number | null>(null);
  const [captureNewSpace, setCaptureNewSpace] = useState("");
  const [captureType, setCaptureType] = useState("note");
  const [capturingKnowledge, setCapturingKnowledge] = useState(false);
  const [retryMenuMessageId, setRetryMenuMessageId] =
    useState<number | null>(null);
  const [editingMessageId, setEditingMessageId] =
    useState<number | null>(null);
  const [editingMessageValue, setEditingMessageValue] =
    useState("");
  const [activeRequestDocumentIds, setActiveRequestDocumentIds] =
    useState<number[]>([]);
  const messageScrollRef =
    useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(
    null,
  );
  const conversationDrawerRef = useRef<HTMLElement | null>(null);
  const conversationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const executiveMenuRef = useRef<HTMLDivElement | null>(null);
  const executiveTriggerRef = useRef<HTMLButtonElement | null>(null);

  const [canScrollUp, setCanScrollUp] =
    useState(false);
  const [canScrollDown, setCanScrollDown] =
    useState(false);
  const [failedMessage, setFailedMessage] =
    useState<string | null>(null);
  const onErrorRef = useRef(onError);
  const shouldAutoScrollRef = useRef(true);
  const userInterruptedScrollRef = useRef(false);
  const streamControllerRef =
    useRef(new ChatStreamController());
  const activeStreamConversationIdRef =
    useRef<number | null>(null);
  const activeTemporaryAssistantIdRef =
    useRef<number | null>(null);
  const continueTargetMessageIdRef = useRef<number | null>(null);
  const continuationBaseTextRef = useRef("");
  const activeStreamHasTextRef = useRef(false);
  const copyTimerRef = useRef<
    ReturnType<typeof setTimeout> | null
  >(null);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setConversationSidebarCollapsed(true);
      setExecutiveSelectorOpen(false);
      setRetryMenuMessageId(null);
    }

    function closeOnOutsidePointer(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !conversationSidebarCollapsed &&
        !conversationDrawerRef.current?.contains(target) &&
        !conversationTriggerRef.current?.contains(target)
      ) {
        setConversationSidebarCollapsed(true);
      }
      if (
        executiveSelectorOpen &&
        !executiveMenuRef.current?.contains(target) &&
        !executiveTriggerRef.current?.contains(target)
      ) {
        setExecutiveSelectorOpen(false);
      }
    }

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOnOutsidePointer);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("mousedown", closeOnOutsidePointer);
    };
  }, [conversationSidebarCollapsed, executiveSelectorOpen]);

  const companyId = company?.id ?? null;

  useEffect(() => {
    if (companyId === null) {
      setKnowledgeSpaces([]);
      return;
    }
    getKnowledgeSpaces(companyId)
      .then((spaces) => {
        setKnowledgeSpaces(spaces);
        setCaptureSpaceId((current) => current ?? spaces[0]?.id ?? null);
      })
      .catch(() => {
        // Knowledge capture remains optional if the endpoint is unavailable.
      });
  }, [companyId]);

  const readyDocuments = documents.filter(
    (document) =>
      document.processing_status === "processed",
  );

  const filteredConversations = useMemo(() => {
    const query = conversationSearch
      .trim()
      .toLowerCase();

    if (!query) {
      return conversations;
    }

    return conversations.filter((conversation) =>
      [
        conversation.title,
        conversation.last_message_preview ?? "",
        conversation.document_name ?? "",
      ].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [conversationSearch, conversations]);


const executiveIdentity = {
  auto: {
    name: "Auto",
    title: "Executive Router",
    icon: "✦",
    description:
      "GrowthOS selects the best executive for each question",
  },
  ceo: {
    name: "CEO",
    title: "Chief Executive Officer",
    icon: "◆",
    description:
      "Strategy, priorities, and company-wide decisions",
  },
  cfo: {
    name: "CFO",
    title: "Chief Financial Officer",
    icon: "$",
    description:
      "Pricing, runway, margins, and financial risk",
  },
  cmo: {
    name: "CMO",
    title: "Chief Marketing Officer",
    icon: "↗",
    description:
      "Positioning, customers, campaigns, and growth",
  },
  coo: {
    name: "COO",
    title: "Chief Operating Officer",
    icon: "⚙",
    description:
      "Execution, workflows, owners, and delivery",
  },
  research: {
    name: "Research Lead",
    title: "Research Lead",
    icon: "⌕",
    description:
      "Evidence, assumptions, confidence, and validation",
  },
  board: {
    name: "Decision Room",
    title: "Executive Decision Room",
    icon: "◇",
    description:
      "CEO, CFO, and CMO perspectives with one board decision",
  },
}[executiveRole];


  useEffect(() => {
    async function loadConversationList() {
      if (companyId === null) {
        setConversations([]);
        setActiveConversation(null);
        return;
      }

      setLoadingList(true);

      try {
        const items = await getConversations(
          companyId,
        );

        setConversations(items);

        if (readStoredBoolean(uiStorageKeys.startNewCofounder)) {
          writeStoredBoolean(uiStorageKeys.startNewCofounder, false);
          const created = await createConversation(companyId, null);
          setActiveConversation(created);
          setConversations((current) => mergeConversation(current, created));
          writeStoredNumber(uiStorageKeys.cofounderConversation(companyId), created.id);
          return;
        }

        if (items.length > 0) {
          const savedConversationId =
            readStoredNumber(
              uiStorageKeys.cofounderConversation(
                companyId,
              ),
            );

          const conversationToOpen =
            items.find(
              (item) =>
                item.id === savedConversationId,
            ) ?? items[0];

          const detail = await getConversation(
            conversationToOpen.id,
          );

          setActiveConversation(normalizeConversation(detail));

          writeStoredNumber(
            uiStorageKeys.cofounderConversation(
              companyId,
            ),
            detail.id,
          );
        } else {
          removeStoredValue(
            uiStorageKeys.cofounderConversation(
              companyId,
            ),
          );
          setActiveConversation(null);
        }
      } catch (error) {
        onErrorRef.current(
          error instanceof Error
            ? error.message
            : "Conversations could not be loaded.",
        );
      } finally {
        setLoadingList(false);
      }
    }

    void loadConversationList();
  }, [companyId]);

  function updateScrollControls() {
    const container = messageScrollRef.current;

    if (!container) {
      return;
    }

    const maximumScroll =
      container.scrollHeight -
      container.clientHeight;

    const distanceFromBottom =
      maximumScroll - container.scrollTop;

    const nearBottom =
      distanceFromBottom < 110;

    setCanScrollUp(container.scrollTop > 90);
    setCanScrollDown(distanceFromBottom > 90);

    if (nearBottom) {
      shouldAutoScrollRef.current = true;
      userInterruptedScrollRef.current = false;
    } else if (sending) {
      shouldAutoScrollRef.current = false;
      userInterruptedScrollRef.current = true;
    }
  }


  function pauseAutoScroll() {
    if (!sending) {
      return;
    }

    shouldAutoScrollRef.current = false;
    userInterruptedScrollRef.current = true;
  }


  function jumpToConversationStart() {
    messageScrollRef.current?.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }


  function jumpToLatestMessage() {
    const container = messageScrollRef.current;

    if (!container) {
      return;
    }

    shouldAutoScrollRef.current = true;
    userInterruptedScrollRef.current = false;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }


  useEffect(() => {
    const container = messageScrollRef.current;

    if (
      sending &&
      shouldAutoScrollRef.current &&
      !userInterruptedScrollRef.current
    ) {
      bottomRef.current?.scrollIntoView({
        block: "end",
        behavior: "auto",
      });
    }

    const frame = window.requestAnimationFrame(
      updateScrollControls,
    );

    return () =>
      window.cancelAnimationFrame(frame);
  }, [activeConversation?.messages, sending]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);


async function copyMessage(
  message: ChatMessage,
) {
  try {
    await navigator.clipboard.writeText(
      message.content,
    );

    setCopiedMessageId(message.id);

    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
    }

    copyTimerRef.current = setTimeout(() => {
      setCopiedMessageId(null);
    }, 1800);

    onSuccess("Message copied.");
  } catch {
    onError("The message could not be copied.");
  }
}


function prepareRegeneration(
  messageIndex: number,
) {
  if (!activeConversation) {
    return;
  }

  for (
    let index = messageIndex - 1;
    index >= 0;
    index -= 1
  ) {
    const previous =
      activeConversation.messages[index];

    if (previous.role === "user") {
      setDraft(previous.content);
      setFailedMessage(null);
      shouldAutoScrollRef.current = true;
      return;
    }
  }

  onError(
    "The original user message could not be found.",
  );
}





function suggestedRoleForFile(
  filename: string,
): ExecutiveRole {
  const name = filename.toLowerCase();

  if (
    name.includes("price") ||
    name.includes("budget") ||
    name.includes("finance") ||
    name.includes("revenue") ||
    name.includes("cost")
  ) {
    return "cfo";
  }

  if (
    name.includes("campaign") ||
    name.includes("marketing") ||
    name.includes("brand") ||
    name.includes("customer")
  ) {
    return "cmo";
  }

  if (
    name.includes("research") ||
    name.includes("interview") ||
    name.includes("evidence") ||
    name.includes("survey")
  ) {
    return "research";
  }

  if (
    name.includes("process") ||
    name.includes("workflow") ||
    name.includes("sop") ||
    name.includes("operations")
  ) {
    return "coo";
  }

  return "ceo";
}


async function attachFiles(
  files: File[],
) {
  if (!company) {
    onError(
      "Select a workspace before attaching files.",
    );
    return;
  }

  const candidatePdfFiles = files.filter(
    (file) =>
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf"),
  );

  const pdfFiles: File[] = [];
  for (const file of candidatePdfFiles) {
    const duplicateInComposer = attachedDocuments.some(
      (attachment) => attachment.fileName.toLowerCase() === file.name.toLowerCase(),
    );
    const duplicateInWorkspace = documents.some(
      (document) =>
        document.original_filename.toLowerCase() === file.name.toLowerCase() &&
        document.file_size === file.size,
    );

    if (duplicateInComposer) {
      onError(`${file.name} is already attached to this message.`);
      continue;
    }

    if (duplicateInWorkspace) {
      const uploadAgain = window.confirm(
        `${file.name} already exists in this workspace with the same file size.\n\nChoose OK to upload it as another version, or Cancel to use the existing file.`,
      );
      if (!uploadAgain) {
        continue;
      }
    }

    pdfFiles.push(file);
  }

  if (candidatePdfFiles.length !== files.length) {
    onError(
      "Only PDF files are supported in this release. Unsupported files were skipped.",
    );
  }

  if (pdfFiles.length === 0) {
    return;
  }

  if (
    attachedDocuments.length +
    pdfFiles.length >
    6
  ) {
    onError(
      "Attach up to six PDFs to one conversation.",
    );
    return;
  }

  const pending = pdfFiles.map((file, index) => ({
    file,
    clientId:
      `${Date.now()}-${index}-${file.name}`,
  }));

  setAttachedDocuments((current) => [
    ...current,
    ...pending.map(({ file, clientId }) => ({
      clientId,
      fileName: file.name,
      status: "uploading" as const,
    })),
  ]);

  setAttaching(true);

  const results = await Promise.allSettled(
    pending.map(async ({ file, clientId }) => {
      const uploaded = await uploadDocument(
        company.id,
        file,
      );

      const processed = await processDocument(
        uploaded.id,
      );

      const classification =
        await getDocumentClassification(
          processed.id,
        );

      onDocumentReady(processed);

      return {
        clientId,
        document: processed,
        classification,
      };
    }),
  );

  const successful: Array<{
    clientId: string;
    document: DocumentRecord;
    classification: DocumentClassification;
  }> = [];

  results.forEach((result, index) => {
    const target = pending[index];

    if (result.status === "fulfilled") {
      successful.push(result.value);

      setAttachedDocuments((current) =>
        current.map((attachment) =>
          attachment.clientId ===
          result.value.clientId
            ? {
                ...attachment,
                status: "ready",
                document: result.value.document,
                classification:
                  result.value.classification,
              }
            : attachment,
        ),
      );

      return;
    }

    setAttachedDocuments((current) =>
      current.map((attachment) =>
        attachment.clientId === target.clientId
          ? {
              ...attachment,
              status: "error",
              error:
                result.reason instanceof Error
                  ? result.reason.message
                  : "Document processing failed.",
            }
          : attachment,
      ),
    );
  });

  const strongest = successful
    .slice()
    .sort(
      (left, right) =>
        right.classification.confidence -
        left.classification.confidence,
    )[0];

  if (strongest) {
    setExecutiveRole(
      strongest.classification
        .suggested_executive,
    );
  }

  onDocumentChange(null);
  onScopeChange(false);
  setAttaching(false);

  const failedCount =
    results.length - successful.length;

  if (successful.length > 0) {
    onSuccess(
      `${successful.length} PDF${
        successful.length === 1 ? "" : "s"
      } ready${
        failedCount > 0
          ? `; ${failedCount} failed`
          : ""
      }.`,
    );
  } else {
    onError(
      "None of the selected PDFs could be processed.",
    );
  }
}


async function rateMessage(
  message: ChatMessage,
  rating: "useful" | "not_useful",
) {
  if (
    !company ||
    !activeConversation ||
    message.id <= 0
  ) {
    onError(
      "Wait for the response to finish before rating it.",
    );
    return;
  }

  try {
    await submitResponseFeedback({
      company_id: company.id,
      conversation_id: activeConversation.id,
      message_id: message.id,
      rating,
      reason:
        rating === "not_useful"
          ? "requested_improvement"
          : null,
    });

    if (rating === "not_useful") {
      const previousUser =
        activeConversation.messages
          .slice(
            0,
            activeConversation.messages.findIndex(
              (item) => item.id === message.id,
            ),
          )
          .reverse()
          .find((item) => item.role === "user");

      if (previousUser) {
        setDraft(
          `${previousUser.content}\n\nTry again with clearer reasoning, stronger evidence, and a more practical next action.`,
        );
      }
    }

    onSuccess(
      rating === "useful"
        ? "Feedback saved."
        : "Feedback saved. An improved retry is ready in the composer.",
    );
  } catch (error) {
    onError(
      error instanceof Error
        ? error.message
        : "Feedback could not be saved.",
    );
  }
}


async function refreshConversationAfterStop(
  conversationId: number,
) {
  // Cancellation and partial-message persistence happen in the
  // streaming worker. Give it a moment to commit, then reload the
  // authoritative conversation so the interrupted answer survives.
  for (const delay of [120, 260, 500]) {
    await new Promise((resolve) =>
      window.setTimeout(resolve, delay),
    );

    try {
      const detail = await getConversation(conversationId);
      const lastMessage =
        detail.messages[detail.messages.length - 1];

      if (
        lastMessage?.role === "assistant" ||
        delay === 500
      ) {
        const normalizedDetail = normalizeConversation(detail);
        const finalAssistant = [...normalizedDetail.messages].reverse().find((message) => message.role === "assistant");
        continueTargetMessageIdRef.current = finalAssistant?.id ?? null;
        continuationBaseTextRef.current = finalAssistant?.content ?? "";
        setActiveConversation(normalizedDetail);
        setConversations((current) => {
          const selected = current.find(
            (item) => item.id === detail.id,
          );
          return selected
            ? mergeConversation(current, {
                ...selected,
                title: detail.title,
                message_count: detail.message_count,
                last_message_preview:
                  lastMessage?.content.slice(0, 120) ??
                  selected.last_message_preview,
                updated_at: detail.updated_at,
              })
            : current;
        });
        return;
      }
    } catch {
      // Retry briefly while the cancellation transaction finishes.
    }
  }
}


async function stopGenerating() {
  if (!sending || stopping) {
    return;
  }

  setStopping(true);

  const conversationId =
    activeStreamConversationIdRef.current;
  const temporaryAssistantId =
    activeTemporaryAssistantIdRef.current;
  const hasPartialText =
    activeStreamHasTextRef.current;

  // Keep the browser stream open while the backend records the partial
  // response. The backend cancellation signal ends the stream cleanly.

  if (
    temporaryAssistantId !== null &&
    !hasPartialText
  ) {
    setActiveConversation((current) =>
      current
        ? {
            ...current,
            messages: current.messages.filter(
              (message) =>
                message.id !==
                temporaryAssistantId,
            ),
          }
        : current,
    );
  }

  try {
    if (conversationId !== null) {
      await cancelConversationGeneration(
        conversationId,
      );
      await refreshConversationAfterStop(
        conversationId,
      );
      streamControllerRef.current.stop();
    }

    setCanContinueAfterStop(hasPartialText);
    onSuccess(
      hasPartialText
        ? "Generation stopped. The partial response was kept."
        : "Generation stopped.",
    );
  } catch (error) {
    onError(
      error instanceof Error
        ? error.message
        : "The backend generation could not be cancelled.",
    );
  } finally {
    activeStreamConversationIdRef.current = null;
    activeTemporaryAssistantIdRef.current = null;
    activeStreamHasTextRef.current = false;
    setActiveRequestDocumentIds([]);
    setSending(false);
    setStopping(false);
  }
}


async function saveDecisionFromMessage(
  message: ChatMessage,
) {
  if (!company || !activeConversation) {
    onError(
      "Select a workspace and open a conversation first.",
    );
    return;
  }

  const firstLine = message.content
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  const title = (
    firstLine ??
    `${message.executive_role ?? "Executive"} recommendation`
  )
    .replace(/^#+\s*/, "")
    .slice(0, 180);

  try {
    await createDecision({
      company_id: company.id,
      conversation_id: activeConversation.id,
      message_id:
        message.id > 0
          ? message.id
          : null,
      title,
      summary: message.content,
      owner_role: null,
      source_executive_role:
        message.executive_role ??
        resolvedExecutiveRole,
      confidence_level:
        message.confidence_level,
      confidence_score:
        message.confidence_score,
    });

    onSuccess(
      "Decision saved to Decision Intelligence.",
    );
  } catch (error) {
    onError(
      error instanceof Error
        ? error.message
        : "Could not save the decision.",
    );
  }
}


  async function startConversation() {
    if (!company) {
      onError("Select a business workspace first.");
      return;
    }

    try {
      const created = await createConversation(
        company.id,
        null,
      );

      setActiveConversation(created);

      writeStoredNumber(
        uiStorageKeys.cofounderConversation(
          company.id,
        ),
        created.id,
      );

      setConversations((current) =>
        mergeConversation(current, created),
      );
      setDraft("");
      setConversationSidebarCollapsed(true);
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "A new conversation could not be created.",
      );
    }
  }

  async function openConversation(
    conversationId: number,
  ) {
    setLoadingConversation(true);

    try {
      const detail = await getConversation(
        conversationId,
      );
      setActiveConversation(normalizeConversation(detail));
      shouldAutoScrollRef.current = true;
      userInterruptedScrollRef.current = false;

      window.requestAnimationFrame(() => {
        jumpToLatestMessage();
      });

      if (companyId !== null) {
        writeStoredNumber(
          uiStorageKeys.cofounderConversation(
            companyId,
          ),
          detail.id,
        );
      }

      setAttachedDocuments([]);
      setConversationSidebarCollapsed(true);
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "The conversation could not be opened.",
      );
    } finally {
      setLoadingConversation(false);
    }
  }

  async function removeConversation(
    conversationId: number,
  ) {
    try {
      await deleteConversation(conversationId);

      const remaining = conversations.filter(
        (conversation) =>
          conversation.id !== conversationId,
      );

      setConversations(remaining);

      if (
        activeConversation?.id === conversationId
      ) {
        if (remaining.length > 0) {
          await openConversation(remaining[0].id);
        } else {
          setActiveConversation(null);

          if (companyId !== null) {
            removeStoredValue(
              uiStorageKeys.cofounderConversation(
                companyId,
              ),
            );
          }
        }
      }

      onSuccess("Conversation deleted.");
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "The conversation could not be deleted.",
      );
    }
  }

  async function saveRename(
    conversationId: number,
  ) {
    if (renameValue.trim().length < 2) {
      return;
    }

    try {
      const renamed = await renameConversation(
        conversationId,
        renameValue.trim(),
      );

      setConversations((current) =>
        mergeConversation(current, renamed),
      );

      setActiveConversation((current) =>
        current?.id === renamed.id
          ? {
              ...current,
              title: renamed.title,
              updated_at: renamed.updated_at,
            }
          : current,
      );

      setRenamingId(null);
      setRenameValue("");
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "The conversation could not be renamed.",
      );
    }
  }

  function prepareRetryOption(
    message: ChatMessage,
    option:
      | "shorter"
      | "detailed"
      | "evidence"
      | "challenge"
      | "different_executive",
  ) {
    if (!activeConversation) {
      return;
    }

    const messageIndex =
      activeConversation.messages.findIndex(
        (item) => item.id === message.id,
      );

    const previousUser =
      activeConversation.messages
        .slice(0, messageIndex)
        .reverse()
        .find((item) => item.role === "user");

    if (!previousUser) {
      onError(
        "The original question could not be found.",
      );
      return;
    }

    const instructions = {
      shorter:
        "Answer again in a shorter, more direct format.",
      detailed:
        "Answer again with more detail, reasoning, and implementation steps.",
      evidence:
        "Answer again using the available attached document and retrieved evidence more explicitly. Separate evidence from assumptions.",
      challenge:
        "Challenge the previous recommendation. Identify weaknesses, risks, and a stronger alternative.",
      different_executive:
        "Answer again from a different executive perspective. Explain which executive is best suited and why.",
    };

    setDraft(
      `${previousUser.content}\n\n${instructions[option]}`,
    );

    if (option === "different_executive") {
      setExecutiveRole("auto");
    }

    setRetryMenuMessageId(null);
    setFailedMessage(null);

    onSuccess(
      "Retry instructions are ready. Review and send.",
    );
  }


  async function saveInlineEdit(message: ChatMessage) {
    if (!activeConversation || sending || stopping) {
      return;
    }

    const revised = editingMessageValue.trim();
    if (revised.length < 2) {
      onError("The edited prompt must contain at least two characters.");
      return;
    }

    try {
      const trimmedConversation = await editConversationMessage(
        activeConversation.id,
        message.id,
        revised,
      );
      setActiveConversation(normalizeConversation(trimmedConversation));
      setEditingMessageId(null);
      setEditingMessageValue("");
      await sendMessage(revised, trimmedConversation);
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "The prompt could not be edited.",
      );
    }
  }

  async function saveMemoryFromMessage(message: ChatMessage) {
    if (!company || !activeConversation) {
      return;
    }

    const firstLine = message.content
      .split("\n")
      .map((line) => line.replace(/^#+\s*/, "").trim())
      .find(Boolean);

    try {
      await createExecutiveMemory({
        company_id: company.id,
        executive_role: message.executive_role ?? resolvedExecutiveRole,
        memory_type: "strategy",
        title: (firstLine ?? "Executive guidance").slice(0, 180),
        summary: message.content,
        details: null,
        importance: 7,
        source_conversation_id: activeConversation.id,
        source_message_id: message.id > 0 ? message.id : null,
      });
      onSuccess("Saved to Executive Memory.");
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "The response could not be saved to Executive Memory.",
      );
    }
  }

  async function saveCapturedKnowledge() {
    if (!company || !activeConversation || !captureMessage) return;
    setCapturingKnowledge(true);
    try {
      let spaceId = captureSpaceId;
      if (captureNewSpace.trim()) {
        const created = await createKnowledgeSpace({
          company_id: company.id,
          name: captureNewSpace.trim(),
          description: "Created from an Executive Team conversation.",
          color: "cyan",
        });
        setKnowledgeSpaces((current) => [created, ...current]);
        spaceId = created.id;
      }
      if (!spaceId) {
        onError("Choose an existing Knowledge Space or create a new one.");
        return;
      }
      const firstLine = captureMessage.content.split("\n").map((line) => line.replace(/^#+\s*/, "").trim()).find(Boolean) ?? "Captured conversation knowledge";
      await captureKnowledgeItem(spaceId, {
        company_id: company.id,
        item_type: captureType,
        title: firstLine.slice(0, 200),
        summary: captureMessage.content.slice(0, 1200),
        content: captureMessage.content,
        tags: [],
        source_conversation_id: activeConversation.id,
        source_message_id: captureMessage.id > 0 ? captureMessage.id : null,
      });
      setCaptureMessage(null);
      setCaptureNewSpace("");
      onSuccess("Captured in Knowledge Spaces.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "The message could not be captured.");
    } finally {
      setCapturingKnowledge(false);
    }
  }

  async function sendMessage(
    contentOverride?: string,
    conversationOverride?: ConversationDetail,
    options?: { internalContinuation?: boolean },
  ) {
    if (!company || sending || stopping) {
      return;
    }

    const requestAttachments =
      attachedDocuments.filter(
        (attachment) =>
          attachment.status === "ready" &&
          attachment.document,
      );

    const requestDocumentIds =
      requestAttachments.map(
        (attachment) =>
          attachment.document!.id,
      );

    const typedContent = (contentOverride ?? draft).trim();

    const content =
      typedContent.length >= 2
        ? typedContent
        : requestDocumentIds.length > 0
          ? (
              "Review the attached document and identify the "
              + "most important findings, risks, and next action."
            )
          : "";

    if (content.length < 2) {
      onError(
        "Enter a message or attach a PDF.",
      );
      return;
    }

    const immediateTask = isImmediateTask(content);
    const effectiveResearchMode = researchMode && !immediateTask;
    if (immediateTask && researchMode) {
      setResearchMode(false);
    }

    let conversation = conversationOverride ?? activeConversation;

    if (!conversation) {
      try {
        conversation = await createConversation(
          company.id,
          null,
        );

        setActiveConversation(conversation);

        writeStoredNumber(
          uiStorageKeys.cofounderConversation(
            company.id,
          ),
          conversation.id,
        );

        setConversations((current) =>
          mergeConversation(current, conversation!),
        );
      } catch (error) {
        onError(
          error instanceof Error
            ? error.message
            : "A conversation could not be created.",
        );
        return;
      }
    }

    shouldAutoScrollRef.current = true;
    userInterruptedScrollRef.current = false;
    setConversationSidebarCollapsed(true);
    setExecutiveSelectorOpen(false);
    setSending(true);
    setFailedMessage(null);
    setDraft("");
    setActiveRequestDocumentIds(
      requestDocumentIds,
    );

    const internalContinuation = options?.internalContinuation === true;
    if (!internalContinuation) {
      setCanContinueAfterStop(false);
      continueTargetMessageIdRef.current = null;
      continuationBaseTextRef.current = "";
    }
    const temporaryUser: ChatMessage = {
      id: -Date.now(),
      conversation_id: conversation.id,
      role: "user",
      content,
      model: null,
      sources: [],
      created_at: new Date().toISOString(),
    };

    const continuationTargetId = internalContinuation ? continueTargetMessageIdRef.current : null;
    const continuationBase = internalContinuation ? continuationBaseTextRef.current : "";
    const temporaryAssistant: ChatMessage = {
      id: continuationTargetId ?? -(Date.now() + 1),
      conversation_id: conversation.id,
      role: "assistant",
      content: continuationBase,
      model: null,
      sources: [],
      created_at: new Date().toISOString(),
    };

    setActiveConversation((current) => {
      if (!current) return current;
      return {
        ...current,
        messages: internalContinuation
          ? (continuationTargetId !== null
              ? current.messages.map((message) => message.id === continuationTargetId ? temporaryAssistant : message)
              : [...current.messages, temporaryAssistant])
          : [...current.messages, temporaryUser, temporaryAssistant],
      };
    });

    let streamedText = continuationBase;

    const {
      signal: streamSignal,
      generationId,
    } = streamControllerRef.current.start();

    activeStreamConversationIdRef.current =
      conversation.id;
    activeTemporaryAssistantIdRef.current =
      temporaryAssistant.id;
    activeStreamHasTextRef.current = false;

    const requestUseAllDocuments =
      requestDocumentIds.length === 0 &&
      useAllDocuments;

    try {
      await streamCofounderMessage(
        conversation.id,
        content,
        null,
        requestDocumentIds,
        requestUseAllDocuments,
        executiveRole,
        effectiveResearchMode,
        (streamEvent) => {
          if (
            !streamControllerRef.current.isCurrent(
              generationId,
            )
          ) {
            return;
          }

          if (streamEvent.type === "metadata") {
            if (streamEvent.executive_role) {
              setResolvedExecutiveRole(
                streamEvent.executive_role,
              );
            }

            setActiveConversation((current) => {
              if (!current) {
                return current;
              }

              return {
                ...current,
                title:
                  streamEvent.conversation_title,
                messages: current.messages.map(
                  (message) => {
                    if (
                      message.id === temporaryUser.id
                    ) {
                      return streamEvent.user_message;
                    }

                    if (
                      message.id === temporaryAssistant.id
                    ) {
                      return {
                        ...message,
                        model: streamEvent.model,
                        executive_role:
                          streamEvent.executive_role ??
                          message.executive_role,
                        confidence_level:
                          streamEvent.confidence_level ??
                          message.confidence_level,
                        confidence_score:
                          streamEvent.confidence_score ??
                          message.confidence_score,
                        confidence_reason:
                          streamEvent.confidence_reason ??
                          message.confidence_reason,
                        context_mode:
                          streamEvent.context_mode,
                        context_sources:
                          streamEvent.context_sources,
                        context_reason:
                          streamEvent.context_reason,
                        sources: streamEvent.sources,
                      };
                    }

                    return message;
                  },
                ),
              };
            });

            setConversations((current) => {
              const selected = current.find(
                (item) =>
                  item.id === conversation!.id,
              );

              if (!selected) {
                return current;
              }

              return mergeConversation(current, {
                ...selected,
                title:
                  streamEvent.conversation_title,
                message_count:
                  selected.message_count + 1,
                updated_at:
                  streamEvent.user_message.created_at,
              });
            });
            return;
          }

          if (streamEvent.type === "token") {
            if (internalContinuation && streamedText === continuationBase && continuationBase.trim() && streamEvent.content.trim()) {
              streamedText += "\n\n";
            }
            streamedText += streamEvent.content;
            activeStreamHasTextRef.current =
              streamedText.trim().length > 0;

            setActiveConversation((current) =>
              current
                ? {
                    ...current,
                    messages: current.messages.map(
                      (message) =>
                        message.id ===
                        temporaryAssistant.id
                          ? {
                              ...message,
                              content: streamedText,
                            }
                          : message,
                    ),
                  }
                : current,
            );
            return;
          }

          if (streamEvent.type === "done") {
            setAttachedDocuments([]);
            setCanContinueAfterStop(false);
            continueTargetMessageIdRef.current = null;
            continuationBaseTextRef.current = "";
            if (streamEvent.research_project_id) {
              setResolvedExecutiveRole("research");
              setResearchMode(streamEvent.research_project_status !== "planned");
            }
            setActiveConversation((current) => {
              if (!current) return current;
              if (internalContinuation) {
                return {
                  ...current,
                  updated_at: streamEvent.assistant_message.created_at,
                  messages: current.messages.map((message) =>
                    message.id === temporaryAssistant.id
                      ? {
                          ...message,
                          content: `${continuationBase.trimEnd()}${continuationBase.trim() && streamEvent.assistant_message.content.trim() ? "\n\n" : ""}${streamEvent.assistant_message.content.trimStart()}`,
                          created_at: streamEvent.assistant_message.created_at,
                        }
                      : message,
                  ),
                };
              }
              return {
                ...current,
                updated_at: streamEvent.assistant_message.created_at,
                message_count: current.message_count + 2,
                messages: current.messages.map((message) =>
                  message.id === temporaryAssistant.id
                    ? {
                        ...streamEvent.assistant_message,
                        context_mode: streamEvent.context_mode,
                        context_sources: streamEvent.context_sources,
                        context_reason: streamEvent.context_reason,
                        memory_proposal: streamEvent.memory_proposal,
                      }
                    : message,
                ),
              };
            });

            setConversations((current) => {
              const selected = current.find(
                (item) =>
                  item.id === conversation!.id,
              );

              if (!selected) {
                return current;
              }

              return mergeConversation(current, {
                ...selected,
                title: selected.title,
                message_count:
                  selected.message_count + 1,
                last_message_preview:
                  streamEvent.assistant_message
                    .content.slice(0, 120),
                updated_at:
                  streamEvent.assistant_message
                    .created_at,
              });
            });
            return;
          }

          if (streamEvent.type === "cancelled") {
            setCanContinueAfterStop(true);
            if (streamEvent.assistant_message) {
              setActiveConversation((current) =>
                current
                  ? {
                      ...current,
                      messages: current.messages.map((message) =>
                        message.id === temporaryAssistant.id
                          ? streamEvent.assistant_message!
                          : message,
                      ),
                    }
                  : current,
              );
            }
            return;
          }

          if (streamEvent.type === "error") {
            setFailedMessage(content);

            if (streamEvent.assistant_message) {
              setActiveConversation((current) =>
                current
                  ? {
                      ...current,
                      messages: current.messages.map(
                        (message) =>
                          message.id ===
                          temporaryAssistant.id
                            ? streamEvent.assistant_message!
                            : message,
                      ),
                    }
                  : current,
              );
            } else {
              setActiveConversation((current) =>
                current
                  ? {
                      ...current,
                      messages: current.messages.filter(
                        (message) =>
                          message.id !==
                          temporaryAssistant.id,
                      ),
                    }
                  : current,
              );
            }

            onError(streamEvent.message);
          }
        },
        streamSignal,
      );
    } catch (error) {
      const aborted =
        (error instanceof DOMException &&
          error.name === "AbortError") ||
        (
          error instanceof Error &&
          error.name === "AbortError"
        );

      if (aborted) {
        if (!streamedText.trim()) {
          setActiveConversation((current) =>
            current
              ? {
                  ...current,
                  messages:
                    current.messages.filter(
                      (message) =>
                        message.id !==
                        temporaryAssistant.id,
                    ),
                }
              : current,
          );
        }

        return;
      }

      setFailedMessage(content);

      setActiveConversation((current) =>
        current
          ? {
              ...current,
              messages: current.messages.filter(
                (message) =>
                  message.id !==
                  temporaryAssistant.id,
              ),
            }
          : current,
      );

      onError(
        error instanceof Error
          ? error.message
          : `The GrowthOS ${executiveIdentity.name} could not reply.`,
      );
    } finally {
      if (
        streamControllerRef.current.isCurrent(
          generationId,
        )
      ) {
        streamControllerRef.current.complete(
          generationId,
        );
        activeStreamConversationIdRef.current =
          null;
        activeTemporaryAssistantIdRef.current =
          null;
        activeStreamHasTextRef.current = false;
        setActiveRequestDocumentIds([]);
        setSending(false);
        setStopping(false);
      }
    }
  }

  const prompts = [
    "What should I validate before launching?",
    "Review my current business model.",
    "What research evidence is still missing?",
    "Suggest the next three founder actions.",
  ];

  if (!company) {
    return (
      <section className="panel cofounder-empty">
        <span>✦</span>
        <h2>Select a workspace</h2>
        <p>
          Your GrowthOS executive team needs a business workspace
          before starting a conversation.
        </p>
      </section>
    );
  }

  return (
    <section className={`cofounder-shell ${conversationSidebarCollapsed ? "conversation-sidebar-collapsed" : ""}`}>
      <aside ref={conversationDrawerRef} className="cofounder-conversation-sidebar" aria-hidden={conversationSidebarCollapsed}>
        <header>
          <div>
            <small>Workspace</small>
            <strong>{company.name}</strong>
          </div>
          <button
            type="button"
            onClick={() => {
              void startConversation();
            }}
            aria-label="New conversation"
          >
            +
          </button>
        </header>

        <button
          className="cofounder-new-button"
          type="button"
          onClick={() => {
            void startConversation();
          }}
        >
          <span>✦</span>
          New conversation
        </button>

        <label className="cofounder-conversation-search">
          <span>⌕</span>
          <input
            id="cofounder-conversation-search"
            name="cofounder-conversation-search"
            type="search"
            value={conversationSearch}
            onChange={(event) =>
              setConversationSearch(
                event.target.value,
              )
            }
            placeholder="Search conversations"
            autoComplete="off"
          />
          {conversationSearch && (
            <button
              type="button"
              onClick={() =>
                setConversationSearch("")
              }
              aria-label="Clear conversation search"
            >
              ×
            </button>
          )}
        </label>

        <div className="cofounder-conversation-list">
          {loadingList ? (
            <div className="cofounder-conversation-skeletons">
              {[1, 2, 3, 4].map((item) => (
                <div key={item}>
                  <i />
                  <i />
                  <i />
                </div>
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <p>
              Your first conversation will appear here.
            </p>
          ) : filteredConversations.length === 0 ? (
            <div className="cofounder-search-empty">
              <span>⌕</span>
              <strong>No conversations found</strong>
              <small>
                Try a different title or message keyword.
              </small>
            </div>
          ) : (
            filteredConversations.map((conversation) => (
              <article
                key={conversation.id}
                className={
                  activeConversation?.id ===
                  conversation.id
                    ? "active"
                    : ""
                }
              >
                {renamingId === conversation.id ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveRename(
                        conversation.id,
                      );
                    }}
                  >
                    <input
                      id={`conversation-title-${conversation.id}`}
                      name={`conversation-title-${conversation.id}`}
                      autoComplete="off"
                      autoFocus
                      value={renameValue}
                      onChange={(event) =>
                        setRenameValue(
                          event.target.value,
                        )
                      }
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    className="cofounder-conversation-main"
                    onClick={() => {
                      void openConversation(
                        conversation.id,
                      );
                    }}
                  >
                    <strong>
                      {conversation.title}
                    </strong>
                    <small>
                      {conversation.last_message_preview ??
                        "No messages yet"}
                    </small>
                    <time>
                      {new Date(
                        conversation.updated_at,
                      ).toLocaleDateString()}
                    </time>
                  </button>
                )}

                <div className="cofounder-conversation-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingId(
                        conversation.id,
                      );
                      setRenameValue(
                        conversation.title,
                      );
                    }}
                    aria-label="Rename conversation"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void removeConversation(
                        conversation.id,
                      );
                    }}
                    aria-label="Delete conversation"
                  >
                    ×
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </aside>

      <div className="cofounder-chat-panel">
<section className="executive-team-selector">
  <div className="executive-team-intro">
    <span className="executive-team-mark">
      {executiveIdentity.icon}
    </span>

    <div>
      <small>GrowthOS Executive Team</small>
      <strong>
        Automatic routing or a chosen leadership perspective
      </strong>
    </div>

    <div className="executive-router-actions">
      <button
        type="button"
        ref={conversationTriggerRef}
        className="conversation-history-button"
        onClick={() => {
          setExecutiveSelectorOpen(false);
          setConversationSidebarCollapsed((current) => !current);
        }}
        aria-expanded={!conversationSidebarCollapsed}
        aria-label={conversationSidebarCollapsed ? "Open conversation history" : "Close conversation history"}
        title="Conversation history"
      >
        ☰
      </button>
      {executiveRole === "auto" && (
        <span className="executive-router-status">
          {resolvedExecutiveRole.toUpperCase()}
        </span>
      )}
      <button
        type="button"
        ref={executiveTriggerRef}
        className="team-selector-button"
        onClick={() => {
          setConversationSidebarCollapsed(true);
          setExecutiveSelectorOpen((current) => !current);
        }}
        aria-expanded={executiveSelectorOpen}
        title="Choose an executive perspective"
      >
        Team {executiveSelectorOpen ? "▴" : "▾"}
      </button>
      <button
        type="button"
        className="reset-routing-button"
        onClick={() => {
          setExecutiveRole("auto");
          setResolvedExecutiveRole("ceo");
          setResearchMode(false);
          onScopeChange(false);
          onDocumentChange(null);
        }}
        disabled={sending}
        aria-label="Reset routing to Auto"
        title="Reset routing, research mode, and document scope"
      >
        ↺
      </button>
    </div>
  </div>

  {executiveSelectorOpen && (
  <div ref={executiveMenuRef} className="executive-role-grid">
    {(
      [
        {
          role: "auto",
          icon: "✦",
          name: "Auto",
          description:
            "Routes each question to the best executive",
        },
        {
          role: "ceo",
          icon: "◆",
          name: "CEO",
          description:
            "Strategy and company-wide decisions",
        },
        {
          role: "cfo",
          icon: "$",
          name: "CFO",
          description:
            "Pricing, runway, margins, and risk",
        },
        {
          role: "cmo",
          icon: "↗",
          name: "CMO",
          description:
            "Positioning, customers, and growth",
        },
        {
          role: "coo",
          icon: "⚙",
          name: "COO",
          description:
            "Execution, workflows, owners, and delivery",
        },
        {
          role: "research",
          icon: "⌕",
          name: "Research Lead",
          description:
            "Evidence, assumptions, confidence, and validation",
        },
        {
          role: "board",
          icon: "◇",
          name: "Decision Room",
          description:
            "CEO, CFO, and CMO board synthesis",
        },
      ] as const
    ).map((executive) => {
      const active =
        executiveRole === executive.role;

      return (
        <button
          type="button"
          className={[
            "executive-role",
            active ? "active" : "",
            executive.role === "board"
              ? "decision-room"
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-pressed={active}
          key={executive.role}
          onClick={() => {
            setExecutiveRole(executive.role);
            setExecutiveSelectorOpen(false);
          }}
        >
          <span>{executive.icon}</span>

          <div>
            <strong>{executive.name}</strong>
            <small>{executive.description}</small>
          </div>

          <i>{active ? "Active" : "Open"}</i>
        </button>
      );
    })}
  </div>
  )}
</section>

        <header className="cofounder-chat-header">
          <div className="conversation-heading">
            <small>{executiveIdentity.name}</small>
            <h1>{activeConversation?.title ?? "New conversation"}</h1>
          </div>

          <details className="chat-context-menu">
            <summary>Context</summary>
            <div>
              <label>
                <input
                  id="cofounder-search-all"
                  name="cofounder-search-all"
                  type="checkbox"
                  checked={useAllDocuments}
                  onChange={(event) => onScopeChange(event.target.checked)}
                />
                Search all intelligence
              </label>
              {!useAllDocuments && (
                <select
                  id="cofounder-document-scope"
                  name="cofounder-document-scope"
                  value={activeDocumentId ?? ""}
                  onChange={(event) =>
                    onDocumentChange(event.target.value ? Number(event.target.value) : null)
                  }
                >
                  <option value="">Workspace only</option>
                  {readyDocuments.map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.original_filename}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </details>
        </header>

        <div
          className="cofounder-message-scroll"
          ref={messageScrollRef}
          onScroll={updateScrollControls}
          onWheel={pauseAutoScroll}
          onTouchMove={pauseAutoScroll}
          onPointerDown={pauseAutoScroll}
        >
          {loadingConversation ? (
            <div className="cofounder-message-skeletons">
              {[1, 2, 3].map((item) => (
                <article key={item}>
                  <span />
                  <div>
                    <i />
                    <i />
                    <i />
                  </div>
                </article>
              ))}
            </div>
          ) : !activeConversation ||
            activeConversation.messages.length === 0 ? (
            <div className="cofounder-welcome">
              <span>✦</span>
              <h2>
                What should we work on today?
              </h2>
              <p>
                Talk naturally with GrowthOS about your
                launch, market, customers, pricing,
                research, or next decision.
              </p>

              <div>
                {prompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() =>
                      setDraft(prompt)
                    }
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            activeConversation.messages.map(
              (message, index) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  streaming={
                    sending &&
                    index ===
                      activeConversation.messages
                        .length -
                        1 &&
                    message.role === "assistant"
                  }
                  messageExecutiveRole={
                    message.executive_role
                  }
                  companyId={company.id}
                  editing={editingMessageId === message.id}
                  editValue={editingMessageValue}
                  onEditValueChange={setEditingMessageValue}
                  onSaveEdit={
                    editingMessageId === message.id
                      ? () => void saveInlineEdit(message)
                      : undefined
                  }
                  onCancelEdit={
                    editingMessageId === message.id
                      ? () => {
                          setEditingMessageId(null);
                          setEditingMessageValue("");
                        }
                      : undefined
                  }
                  onEdit={
                    message.role === "user" && !sending
                      ? () => {
                          setEditingMessageId(message.id);
                          setEditingMessageValue(message.content);
                          setFailedMessage(null);
                          shouldAutoScrollRef.current = false;
                        }
                      : undefined
                  }
                  onCaptureKnowledge={() => {
                    setCaptureMessage(message);
                    setCaptureType(inferKnowledgeType(message.content));
                    setCaptureSpaceId(suggestKnowledgeSpaceId(message.content, knowledgeSpaces));
                  }}
                  onMemorySaved={() => {
                    setActiveConversation((current) =>
                      current
                        ? {
                            ...current,
                            messages: current.messages.map((item) =>
                              item.id === message.id
                                ? { ...item, memory_proposal: null }
                                : item,
                            ),
                          }
                        : current,
                    );
                    onSuccess("Memory saved to Executive Memory.");
                  }}
                  onMemoryDismissed={() => {
                    setActiveConversation((current) =>
                      current
                        ? {
                            ...current,
                            messages: current.messages.map((item) =>
                              item.id === message.id
                                ? { ...item, memory_proposal: null }
                                : item,
                            ),
                          }
                        : current,
                    );
                  }}
                  onMemoryError={onError}
                  executiveName={
                    executiveRole === "auto"
                      ? resolvedExecutiveRole.toUpperCase()
                      : executiveIdentity.name
                  }
                  retryMenuOpen={
                    retryMenuMessageId === message.id
                  }
                  onToggleRetryMenu={
                    message.role === "assistant" &&
                    !sending
                      ? () =>
                          setRetryMenuMessageId(
                            (current) =>
                              current === message.id
                                ? null
                                : message.id,
                          )
                      : undefined
                  }
                  onRetryOption={
                    message.role === "assistant" &&
                    !sending
                      ? (option) =>
                          prepareRetryOption(
                            message,
                            option,
                          )
                      : undefined
                  }
                  onFeedback={
                    message.role === "assistant" &&
                    !sending
                      ? (rating) =>
                          void rateMessage(
                            message,
                            rating,
                          )
                      : undefined
                  }
                  onSaveMemory={
                    message.role === "assistant" &&
                    !sending
                      ? () =>
                          void saveMemoryFromMessage(message)
                      : undefined
                  }
                  onSaveDecision={
                    message.role === "assistant" &&
                    !sending
                      ? () =>
                          void saveDecisionFromMessage(
                            message,
                          )
                      : undefined
                  }
                  onCopy={(selectedMessage) => {
                    void copyMessage(
                      selectedMessage,
                    );
                  }}
                  onRegenerate={
                    message.role === "assistant"
                      ? () =>
                          prepareRegeneration(index)
                      : undefined
                  }
                />
              ),
            )
          )}

          {failedMessage && !sending && (
            <div className="cofounder-retry-row">
              <button
                type="button"
                onClick={() => {
                  setDraft(failedMessage);
                  setFailedMessage(null);
                }}
              >
                ↻ Retry last message
              </button>
              <span>
                A new conversation may be faster if this
                thread has become very long.
              </span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <nav
          className="cofounder-scroll-controls"
          aria-label="Conversation scroll controls"
        >
          <button
            type="button"
            onClick={jumpToConversationStart}
            disabled={!canScrollUp}
            aria-label="Jump to beginning of conversation"
            title="Go to beginning"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={jumpToLatestMessage}
            disabled={
              !canScrollDown &&
              !(
                sending &&
                userInterruptedScrollRef.current
              )
            }
            aria-label="Jump to latest message"
            title="Go to latest message"
          >
            ↓
          </button>
        </nav>

        {copiedMessageId !== null && (
          <div className="cofounder-copy-confirmation">
            ✓ Copied to clipboard
          </div>
        )}


{captureMessage && (
  <div className="capture-knowledge-backdrop" role="presentation" onMouseDown={() => setCaptureMessage(null)}>
    <section className="capture-knowledge-dialog" role="dialog" aria-modal="true" aria-label="Capture knowledge" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span>▧</span><div><strong>Capture Knowledge</strong><small>Save this message by subject, not only by chat.</small></div></div><button type="button" onClick={() => setCaptureMessage(null)}>×</button></header>
      <label>Type<select value={captureType} onChange={(event) => setCaptureType(event.target.value)}><option value="note">Note</option><option value="idea">Idea</option><option value="email">Email</option><option value="research">Research</option><option value="decision">Decision</option><option value="strategy">Strategy</option><option value="task">Task</option></select></label>
      <label>Existing Knowledge Space<select value={captureSpaceId ?? ""} onChange={(event) => setCaptureSpaceId(event.target.value ? Number(event.target.value) : null)}><option value="">Choose a space…</option>{knowledgeSpaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}</select></label>
      <div className="capture-or"><span />or<span /></div>
      <label>Create new subject<input value={captureNewSpace} onChange={(event) => setCaptureNewSpace(event.target.value)} placeholder="e.g. Meat Farm" /></label>
      <blockquote>{captureMessage.content.slice(0, 420)}{captureMessage.content.length > 420 ? "…" : ""}</blockquote>
      <footer><button type="button" className="subtle" onClick={() => setCaptureMessage(null)}>Cancel</button><button type="button" onClick={() => void saveCapturedKnowledge()} disabled={capturingKnowledge || (!captureSpaceId && captureNewSpace.trim().length < 2)}>{capturingKnowledge ? "Saving…" : "Capture"}</button></footer>
    </section>
  </div>
)}

<ExecutiveComposer
  draft={draft}
  sending={sending || stopping}
  attaching={attaching}
  attachments={attachedDocuments}
  onDraftChange={setDraft}
  onAttachFiles={(files) => {
    void attachFiles(files);
  }}
  onRemoveAttachment={(clientId) => {
    setAttachedDocuments((current) =>
      current.filter(
        (item) =>
          item.clientId !== clientId,
      ),
    );
  }}
  onSend={() => {
    void sendMessage();
  }}
  onStop={() => {
          void stopGenerating();
        }}
  researchMode={researchMode}
  onResearchModeChange={setResearchMode}
  canContinue={canContinueAfterStop}
  onContinue={() => {
    void sendMessage(CONTINUE_INSTRUCTION, undefined, { internalContinuation: true });
  }}
/>
      </div>

      <style jsx>{`


.cofounder-conversation-search {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 5px;
  margin: 10px 0 11px;
  border: 1px solid rgba(148, 163, 184, 0.11);
  border-radius: 10px;
  background: rgba(4, 12, 22, 0.34);
  padding: 5px 7px;
}

.cofounder-conversation-search > span {
  color: #61758d;
  text-align: center;
}

.cofounder-conversation-search input {
  min-width: 0;
  border: 0;
  background: transparent;
  padding: 5px 2px;
  color: var(--text);
  font-size: 7px;
  outline: 0;
}

.cofounder-conversation-search input::placeholder {
  color: #596b81;
}

.cofounder-conversation-search button {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #6e8198;
}

.cofounder-conversation-search button:hover {
  background: rgba(255, 255, 255, 0.035);
  color: var(--text);
}

.cofounder-search-empty {
  display: flex;
  min-height: 150px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  color: var(--muted);
  text-align: center;
}

.cofounder-search-empty > span {
  font-size: 18px;
}

.cofounder-search-empty strong {
  margin-top: 8px;
  color: var(--text-soft);
  font-size: 8px;
}

.cofounder-search-empty small {
  max-width: 180px;
  margin-top: 5px;
  font-size: 6px;
  line-height: 1.5;
}

.cofounder-conversation-skeletons {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.cofounder-conversation-skeletons > div {
  display: flex;
  overflow: hidden;
  min-height: 70px;
  flex-direction: column;
  gap: 8px;
  border: 1px solid rgba(148, 163, 184, 0.07);
  border-radius: 10px;
  padding: 11px;
}

.cofounder-conversation-skeletons i,
.cofounder-message-skeletons i {
  display: block;
  overflow: hidden;
  border-radius: 999px;
  background:
    linear-gradient(
      90deg,
      rgba(148, 163, 184, 0.05),
      rgba(148, 163, 184, 0.12),
      rgba(148, 163, 184, 0.05)
    );
  background-size: 220% 100%;
  animation: cofounder-skeleton 1.3s ease-in-out infinite;
}

.cofounder-conversation-skeletons i:nth-child(1) {
  width: 68%;
  height: 8px;
}

.cofounder-conversation-skeletons i:nth-child(2) {
  width: 92%;
  height: 6px;
}

.cofounder-conversation-skeletons i:nth-child(3) {
  width: 38%;
  height: 5px;
}

.cofounder-message-skeletons {
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 10px 0;
}

.cofounder-message-skeletons article {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 11px;
}

.cofounder-message-skeletons article > span {
  width: 36px;
  height: 36px;
  border-radius: 11px;
  background: rgba(155, 135, 245, 0.08);
}

.cofounder-message-skeletons article > div {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding-top: 4px;
}

.cofounder-message-skeletons i:nth-child(1) {
  width: 22%;
  height: 7px;
}

.cofounder-message-skeletons i:nth-child(2) {
  width: 91%;
  height: 7px;
}

.cofounder-message-skeletons i:nth-child(3) {
  width: 67%;
  height: 7px;
}

.cofounder-reasoning {
  display: inline-flex;
  align-items: center;
  gap: 11px;
  min-height: 42px;
  color: var(--text-soft);
}

.cofounder-reasoning-orbit {
  position: relative;
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgba(59, 214, 208, 0.16);
  border-radius: 50%;
}

.cofounder-reasoning-orbit::before {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--cyan);
  box-shadow: 0 0 13px rgba(59, 214, 208, 0.45);
  content: "";
}

.cofounder-reasoning-orbit i {
  position: absolute;
  inset: 3px;
  border-top: 1px solid var(--violet);
  border-radius: 50%;
  animation: cofounder-orbit 1s linear infinite;
}

.cofounder-reasoning > span:last-child strong,
.cofounder-reasoning > span:last-child small {
  display: block;
}

.cofounder-reasoning > span:last-child strong {
  font-size: 8px;
}

.cofounder-reasoning > span:last-child small {
  margin-top: 4px;
  color: var(--muted);
  font-size: 6px;
}

.cofounder-message-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 10px;
  opacity: 0;
  transform: translateY(2px);
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

:global(.cofounder-message:hover)
  .cofounder-message-actions,
.cofounder-message-actions:focus-within {
  opacity: 1;
  transform: translateY(0);
}

.cofounder-message-actions button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid rgba(148, 163, 184, 0.10);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.016);
  padding: 5px 7px;
  color: #70839a;
  font-size: 6px;
}

.cofounder-message-actions button:hover {
  border-color: rgba(59, 214, 208, 0.19);
  color: var(--cyan);
}

.cofounder-grounded-badge {
  margin-left: auto;
  color: var(--emerald);
  font-size: 6px;
}

.cofounder-copy-confirmation {
  position: absolute;
  right: 18px;
  bottom: 105px;
  z-index: 9;
  border: 1px solid rgba(66, 211, 154, 0.18);
  border-radius: 8px;
  background: rgba(8, 23, 31, 0.95);
  padding: 7px 9px;
  color: var(--emerald);
  font-size: 6px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.24);
  animation: cofounder-copy-in 0.18s ease;
}

@keyframes cofounder-skeleton {
  from {
    background-position: 100% 0;
  }

  to {
    background-position: -120% 0;
  }
}

@keyframes cofounder-orbit {
  to {
    transform: rotate(360deg);
  }
}

@keyframes cofounder-copy-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

        .cofounder-scroll-controls {
          position: absolute;
          right: 18px;
          bottom: 112px;
          z-index: 8;
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .cofounder-scroll-controls button {
          display: grid;
          width: 36px;
          height: 36px;
          place-items: center;
          border: 1px solid rgba(59, 214, 208, 0.2);
          border-radius: 11px;
          background: rgba(8, 18, 31, 0.94);
          box-shadow:
            0 8px 24px rgba(0, 0, 0, 0.24),
            0 0 0 1px rgba(59, 214, 208, 0.03);
          color: var(--cyan);
          font-size: 16px;
          cursor: pointer;
          transition:
            opacity 0.16s ease,
            transform 0.16s ease,
            border-color 0.16s ease;
        }

        .cofounder-scroll-controls button:hover:not(:disabled) {
          border-color: rgba(59, 214, 208, 0.45);
          transform: translateY(-1px);
        }

        .cofounder-scroll-controls button:disabled {
          opacity: 0.34;
          cursor: default;
          pointer-events: none;
          filter: saturate(0.5);
        }

        .cofounder-retry-row {
          display: flex;
          max-width: 930px;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin: 0 auto 18px;
          border: 1px solid rgba(242, 186, 83, 0.15);
          border-radius: 10px;
          background: rgba(242, 186, 83, 0.04);
          padding: 9px 10px;
        }

        .cofounder-retry-row button {
          border: 1px solid rgba(242, 186, 83, 0.22);
          border-radius: 8px;
          background: rgba(242, 186, 83, 0.07);
          padding: 7px 9px;
          color: var(--amber);
          font-size: 7px;
          font-weight: 750;
          cursor: pointer;
        }

        .cofounder-retry-row span {
          color: var(--muted);
          font-size: 6px;
          line-height: 1.45;
          text-align: right;
        }

        :global(.cofounder-chat-panel) {
          position: relative;
        }

        @media (max-width: 760px) {
          .cofounder-message-actions {
            opacity: 1;
            transform: none;
          }

          .cofounder-grounded-badge {
            width: 100%;
            margin: 3px 0 0;
          }

          .cofounder-scroll-controls {
            right: 8px;
            bottom: 108px;
          }

          .cofounder-scroll-controls button {
            width: 32px;
            height: 32px;
          }

          .cofounder-retry-row {
            align-items: stretch;
            flex-direction: column;
          }

          .cofounder-retry-row span {
            text-align: left;
          }
        }
      `}</style>
    </section>
  );
}
