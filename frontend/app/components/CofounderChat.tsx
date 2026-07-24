"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  readStoredNumber,
  removeStoredValue,
  uiStorageKeys,
  writeStoredNumber,
} from "@/lib/ui-storage";

import {
  createConversation,
  deleteConversation,
  getConversation,
  getConversations,
  renameConversation,
  streamCofounderMessage,
  type AnswerSource,
  type ChatMessage,
  type Company,
  type ConversationDetail,
  type ConversationSummary,
  type DocumentRecord,
} from "@/lib/api";


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


function MessageBubble({
  message,
  streaming,
}: {
  message: ChatMessage;
  streaming?: boolean;
}) {
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
              : "GrowthOS Co-Founder"}
          </strong>
          <small>
            {streaming
              ? "Responding live..."
              : new Date(
                  message.created_at,
                ).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
          </small>
        </header>

        <div className="cofounder-message-content">
          {message.content || (
            <span className="cofounder-typing">
              <i />
              <i />
              <i />
            </span>
          )}
          {streaming && message.content && (
            <span className="stream-cursor" />
          )}
        </div>

        <SourceCards sources={message.sources} />
      </div>
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
  onError,
  onSuccess,
}: {
  company: Company | null;
  documents: DocumentRecord[];
  activeDocumentId: number | null;
  useAllDocuments: boolean;
  onDocumentChange: (documentId: number | null) => void;
  onScopeChange: (value: boolean) => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}) {
  const [conversations, setConversations] =
    useState<ConversationSummary[]>([]);
  const [activeConversation, setActiveConversation] =
    useState<ConversationDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [loadingList, setLoadingList] =
    useState(false);
  const [loadingConversation, setLoadingConversation] =
    useState(false);
  const [sending, setSending] = useState(false);
  const [renamingId, setRenamingId] =
    useState<number | null>(null);
  const [renameValue, setRenameValue] =
    useState("");

  const messageScrollRef =
    useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(
    null,
  );

  const [canScrollUp, setCanScrollUp] =
    useState(false);
  const [canScrollDown, setCanScrollDown] =
    useState(false);
  const [failedMessage, setFailedMessage] =
    useState<string | null>(null);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const companyId = company?.id ?? null;

  const readyDocuments = documents.filter(
    (document) =>
      document.processing_status === "processed",
  );

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

          setActiveConversation(detail);

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

    setCanScrollUp(container.scrollTop > 90);
    setCanScrollDown(
      maximumScroll - container.scrollTop > 90,
    );
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

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }


  useEffect(() => {
    if (sending) {
      bottomRef.current?.scrollIntoView({
        behavior: "smooth",
      });
    }

    const frame = window.requestAnimationFrame(
      updateScrollControls,
    );

    return () =>
      window.cancelAnimationFrame(frame);
  }, [activeConversation?.messages, sending]);

  async function startConversation() {
    if (!company) {
      onError("Select a business workspace first.");
      return;
    }

    try {
      const created = await createConversation(
        company.id,
        useAllDocuments
          ? null
          : activeDocumentId,
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
      setActiveConversation(detail);

      if (companyId !== null) {
        writeStoredNumber(
          uiStorageKeys.cofounderConversation(
            companyId,
          ),
          detail.id,
        );
      }

      if (detail.document_id !== null) {
        onDocumentChange(detail.document_id);
        onScopeChange(false);
      }
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

  async function sendMessage(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!company || sending) {
      return;
    }

    const content = draft.trim();

    if (content.length < 2) {
      onError("Enter a longer message.");
      return;
    }

    let conversation = activeConversation;

    if (!conversation) {
      try {
        conversation = await createConversation(
          company.id,
          useAllDocuments
            ? null
            : activeDocumentId,
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

    setSending(true);
    setFailedMessage(null);
    setDraft("");

    const temporaryUser: ChatMessage = {
      id: -Date.now(),
      conversation_id: conversation.id,
      role: "user",
      content,
      model: null,
      sources: [],
      created_at: new Date().toISOString(),
    };

    const temporaryAssistant: ChatMessage = {
      id: -(Date.now() + 1),
      conversation_id: conversation.id,
      role: "assistant",
      content: "",
      model: null,
      sources: [],
      created_at: new Date().toISOString(),
    };

    setActiveConversation((current) =>
      current
        ? {
            ...current,
            messages: [
              ...current.messages,
              temporaryUser,
              temporaryAssistant,
            ],
          }
        : current,
    );

    let streamedText = "";

    try {
      await streamCofounderMessage(
        conversation.id,
        content,
        useAllDocuments
          ? null
          : activeDocumentId,
        useAllDocuments,
        (streamEvent) => {
          if (streamEvent.type === "metadata") {
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
            streamedText += streamEvent.content;

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
            setActiveConversation((current) =>
              current
                ? {
                    ...current,
                    updated_at:
                      streamEvent.assistant_message
                        .created_at,
                    message_count:
                      current.message_count + 2,
                    messages: current.messages.map(
                      (message) =>
                        message.id ===
                        temporaryAssistant.id
                          ? streamEvent.assistant_message
                          : message,
                    ),
                  }
                : current,
            );

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
      );
    } catch (error) {
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
          : "The AI Co-Founder could not reply.",
      );
    } finally {
      setSending(false);
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
          Your AI Co-Founder needs a business workspace
          before starting a conversation.
        </p>
      </section>
    );
  }

  return (
    <section className="cofounder-shell">
      <aside className="cofounder-conversation-sidebar">
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

        <div className="cofounder-conversation-list">
          {loadingList ? (
            <p>Loading conversations...</p>
          ) : conversations.length === 0 ? (
            <p>
              Your first conversation will appear here.
            </p>
          ) : (
            conversations.map((conversation) => (
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
        <header className="cofounder-chat-header">
          <div>
            <small>AI Business Co-Founder</small>
            <h1>
              {activeConversation?.title ??
                "Start a new conversation"}
            </h1>
            <p>
              Uses the workspace profile, saved plan,
              conversation memory, and selected evidence.
            </p>
          </div>

          <div className="cofounder-scope-controls">
            <label>
              <input
                type="checkbox"
                checked={useAllDocuments}
                onChange={(event) =>
                  onScopeChange(
                    event.target.checked,
                  )
                }
              />
              Search all intelligence
            </label>

            {!useAllDocuments && (
              <select
                value={activeDocumentId ?? ""}
                onChange={(event) =>
                  onDocumentChange(
                    event.target.value
                      ? Number(
                          event.target.value,
                        )
                      : null,
                  )
                }
              >
                <option value="">
                  Workspace and plan only
                </option>
                {readyDocuments.map((document) => (
                  <option
                    key={document.id}
                    value={document.id}
                  >
                    {document.original_filename}
                  </option>
                ))}
              </select>
            )}
          </div>
        </header>

        <div
          className="cofounder-message-scroll"
          ref={messageScrollRef}
          onScroll={updateScrollControls}
        >
          {loadingConversation ? (
            <div className="cofounder-loading">
              Loading conversation...
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
            disabled={!canScrollDown}
            aria-label="Jump to latest message"
            title="Go to latest message"
          >
            ↓
          </button>
        </nav>

        <form
          className="cofounder-composer"
          onSubmit={sendMessage}
        >
          <textarea
            value={draft}
            onChange={(event) =>
              setDraft(event.target.value)
            }
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey
              ) {
                event.preventDefault();
                event.currentTarget.form
                  ?.requestSubmit();
              }
            }}
            placeholder="Message your AI Co-Founder..."
            rows={3}
            disabled={sending}
          />

          <footer>
            <span>
              Enter to send · Shift + Enter for a new line
            </span>
            <button
              type="submit"
              disabled={
                sending ||
                draft.trim().length < 2
              }
            >
              {sending ? "Responding..." : "Send →"}
            </button>
          </footer>
        </form>
      </div>

      <style jsx>{`
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
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
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
          opacity: 0;
          pointer-events: none;
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
