"use client";

import {
  useEffect,
  useMemo,
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
  type ExecutiveRole,
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
  onCopy,
  onRegenerate,
  executiveName,
}: {
  message: ChatMessage;
  streaming?: boolean;
  onCopy: (message: ChatMessage) => void;
  onRegenerate?: () => void;
  executiveName: string;
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
              : `GrowthOS ${executiveName}`}
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

        <div className="cofounder-message-content">
          {message.content || (
            <span className="professional-reasoning">
              <span className="reasoning-orbit">
                <i />
              </span>

              <span className="reasoning-copy">
                <strong>
                  GrowthOS is reasoning…
                </strong>
                <small>
                  Selecting business context and checking
                  available evidence
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

              {onRegenerate && (
                <button
                  type="button"
                  onClick={onRegenerate}
                  title="Prepare the previous prompt again"
                >
                  <span aria-hidden="true">↻</span>
                  <strong>Regenerate</strong>
                </button>
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
  const [conversationSearch, setConversationSearch] =
    useState("");
  const [executiveRole, setExecutiveRole] =
    useState<ExecutiveRole>("ceo");
  const [copiedMessageId, setCopiedMessageId] =
    useState<number | null>(null);

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
  const shouldAutoScrollRef = useRef(true);
  const copyTimerRef = useRef<
    ReturnType<typeof setTimeout> | null
  >(null);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const companyId = company?.id ?? null;

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

    const distanceFromBottom =
      maximumScroll - container.scrollTop;

    setCanScrollUp(container.scrollTop > 90);
    setCanScrollDown(distanceFromBottom > 90);

    shouldAutoScrollRef.current =
      distanceFromBottom < 110;
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

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }


  useEffect(() => {
    if (
      sending &&
      shouldAutoScrollRef.current
    ) {
      bottomRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
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
      shouldAutoScrollRef.current = true;

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

    shouldAutoScrollRef.current = true;
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
        executiveRole,
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
          : `The GrowthOS ${executiveIdentity.name} could not reply.`,
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
          Your GrowthOS executive team needs a business workspace
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
        Select a leadership perspective
      </strong>
    </div>
  </div>

  <div className="executive-role-grid">
    {(
      [
        {
          role: "ceo",
          icon: "◆",
          name: "CEO",
          description:
            "Strategy, priorities, and company-wide decisions",
        },
        {
          role: "cfo",
          icon: "$",
          name: "CFO",
          description:
            "Pricing, runway, margins, and financial risk",
        },
        {
          role: "cmo",
          icon: "↗",
          name: "CMO",
          description:
            "Positioning, customers, campaigns, and growth",
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
          ]
            .filter(Boolean)
            .join(" ")}
          aria-pressed={active}
          key={executive.role}
          onClick={() =>
            setExecutiveRole(
              executive.role,
            )
          }
        >
          <span>{executive.icon}</span>

          <div>
            <strong>{executive.name}</strong>
            <small>
              {executive.description}
            </small>
          </div>

          <i>
            {active ? "Active" : "Open"}
          </i>
        </button>
      );
    })}

    {[
      {
        icon: "⚙",
        name: "COO",
        description:
          "Operations and execution",
      },
      {
        icon: "⌕",
        name: "Research",
        description:
          "Evidence and validation",
      },
    ].map((executive) => (
      <div
        className="executive-role locked"
        key={executive.name}
        aria-label={`${executive.name} coming soon`}
      >
        <span>{executive.icon}</span>

        <div>
          <strong>{executive.name}</strong>
          <small>
            {executive.description}
          </small>
        </div>

        <i>Coming soon</i>
      </div>
    ))}
  </div>
</section>

        <header className="cofounder-chat-header">
          <div>
            <small>GrowthOS Executive Team</small>
            <h1>
              {activeConversation?.title ??
                "Start a new conversation"}
            </h1>
            <p>
              {executiveIdentity.name} guidance powered by the
              shared Business Brain, Smart Context Builder, and
              selected evidence.
            </p>
          </div>

          <div className="cofounder-scope-controls">
            <label>
              <input
                id="cofounder-search-all"
                name="cofounder-search-all"
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
                id="cofounder-document-scope"
                name="cofounder-document-scope"
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
                  executiveName={
                    executiveIdentity.name
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
            disabled={!canScrollDown}
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

        <form
          className="cofounder-composer"
          onSubmit={sendMessage}
        >
          <textarea
            id="cofounder-message"
            name="cofounder-message"
            autoComplete="off"
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
              {sending ? "Reasoning…" : "Send →"}
            </button>
          </footer>
        </form>
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
