"use client";

import {
  useRef,
  type KeyboardEvent,
} from "react";

import AttachmentBar, {
  type ComposerAttachment,
} from "@/app/components/chat/AttachmentBar";


export default function ExecutiveComposer({
  draft,
  sending,
  attaching,
  attachments,
  onDraftChange,
  onAttachFiles,
  onRemoveAttachment,
  onSend,
  onStop,
  researchMode,
  onResearchModeChange,
}: {
  draft: string;
  sending: boolean;
  attaching: boolean;
  attachments: ComposerAttachment[];
  onDraftChange: (value: string) => void;
  onAttachFiles: (files: File[]) => void;
  onRemoveAttachment: (documentId: number) => void;
  onSend: () => void;
  onStop: () => void;
  researchMode: boolean;
  onResearchModeChange: (value: boolean) => void;
}) {
  const inputRef =
    useRef<HTMLInputElement | null>(null);

  function selectFiles() {
    inputRef.current?.click();
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (event.key === "Escape" && sending) {
      event.preventDefault();
      onStop();
      return;
    }

    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !sending
    ) {
      event.preventDefault();
      onSend();
    }
  }

  const canSend =
    draft.trim().length >= 2 ||
    attachments.length > 0;

  return (
    <form
      className="cofounder-composer executive-composer"
      onSubmit={(event) => {
        event.preventDefault();

        if (sending) {
          onStop();
          return;
        }

        onSend();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        event.preventDefault();

        const files = Array.from(
          event.dataTransfer.files,
        );

        if (files.length > 0) {
          onAttachFiles(files);
        }
      }}
    >
      <input
        ref={inputRef}
        id="cofounder-attachment"
        name="cofounder-attachment"
        type="file"
        accept=".pdf,application/pdf"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(
            event.target.files ?? [],
          );

          if (files.length > 0) {
            onAttachFiles(files);
          }

          event.currentTarget.value = "";
        }}
      />

      <AttachmentBar
        attachments={attachments}
        attaching={attaching}
        disabled={sending}
        onChooseFiles={selectFiles}
        onRemove={onRemoveAttachment}
      />

      <div className="composer-intent-tools">
        <button
          type="button"
          className={researchMode ? "research-mode-toggle active" : "research-mode-toggle"}
          aria-pressed={researchMode}
          disabled={sending}
          onClick={() => onResearchModeChange(!researchMode)}
          title="Turn an early idea or open question into a guided research project"
        >
          <span>⌕</span>
          {researchMode ? "Research discovery on" : "Explore an idea"}
        </button>
        {researchMode && (
          <span className="research-mode-hint">
            No finished idea or document required. GrowthOS will ask what matters.
          </span>
        )}
      </div>

      <textarea
        id="cofounder-message"
        name="cofounder-message"
        autoComplete="off"
        value={draft}
        onChange={(event) =>
          onDraftChange(event.target.value)
        }
        onKeyDown={handleKeyDown}
        placeholder={
          attachments.length > 0
            ? "Ask a question about the attached documents, or press Send for an automatic review..."
            : researchMode
              ? "Describe an idea, opportunity, question, or problem — even if it is still vague..."
              : "Message your Executive Team..."
        }
        rows={3}
        disabled={false}
      />

      <footer>
        <span>
          Enter to send · Shift + Enter for a new line
          {sending ? " · Esc to stop" : ""}
        </span>

        <button
          type={sending ? "button" : "submit"}
          className={
            sending
              ? "stop-generation-button"
              : undefined
          }
          disabled={!sending && !canSend}
          onClick={
            sending
              ? onStop
              : undefined
          }
        >
          {sending ? "■ Stop" : "Send →"}
        </button>
      </footer>
    </form>
  );
}
