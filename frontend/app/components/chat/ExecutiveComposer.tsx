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
  canContinue,
  onContinue,
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
  canContinue: boolean;
  onContinue: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function selectFiles() {
    inputRef.current?.click();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape" && sending) {
      event.preventDefault();
      onStop();
      return;
    }

    if (event.key === "Enter" && !event.shiftKey && !sending) {
      event.preventDefault();
      onSend();
    }
  }

  const canSend = draft.trim().length >= 2 || attachments.length > 0;

  return (
    <form
      className="cofounder-composer executive-composer"
      onSubmit={(event) => {
        event.preventDefault();
        sending ? onStop() : onSend();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        event.preventDefault();
        const files = Array.from(event.dataTransfer.files);
        if (files.length > 0) onAttachFiles(files);
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
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) onAttachFiles(files);
          event.currentTarget.value = "";
        }}
      />

      {attachments.length > 0 && (
        <AttachmentBar
          attachments={attachments}
          attaching={attaching}
          disabled={sending}
          onChooseFiles={selectFiles}
          onRemove={onRemoveAttachment}
        />
      )}

      {canContinue && !sending && (
        <div className="composer-resume-row" role="status">
          <span>The previous reply was stopped.</span>
          <button type="button" onClick={onContinue}>Continue response</button>
        </div>
      )}

      <textarea
        id="cofounder-message"
        name="cofounder-message"
        autoComplete="off"
        value={draft}
        onChange={(event) => {
          onDraftChange(event.target.value);
          event.currentTarget.style.height = "auto";
          event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 200)}px`;
        }}
        onKeyDown={handleKeyDown}
        placeholder={
          attachments.length > 0
            ? "Ask about the attached documents…"
            : researchMode
              ? "Describe the idea or answer the current question…"
              : "Message GrowthOS…"
        }
        rows={3}
      />

      <footer>
        <div className="composer-left-actions">
          <button
            type="button"
            className="composer-icon-button"
            disabled={sending || attaching}
            onClick={selectFiles}
            aria-label="Attach PDFs"
            title="Attach PDFs"
          >
            ⎘
          </button>
          <button
            type="button"
            className={researchMode ? "research-mode-toggle active" : "research-mode-toggle"}
            aria-pressed={researchMode}
            disabled={sending}
            onClick={() => onResearchModeChange(!researchMode)}
            title="Guided research"
          >
            ⌕ <span>{researchMode ? "Research" : "Explore"}</span>
          </button>
          {researchMode && (
            <button
              type="button"
              className="exit-research-button"
              disabled={sending}
              onClick={() => onResearchModeChange(false)}
            >
              Exit
            </button>
          )}
        </div>

        <div className="composer-send-area">
          <span>Enter to send · Shift+Enter for a new line</span>
          <button
            type={sending ? "button" : "submit"}
            className={sending ? "stop-generation-button" : "send-message-button"}
            disabled={!sending && !canSend}
            onClick={sending ? onStop : undefined}
          >
            {sending ? "■ Stop" : "Send ↑"}
          </button>
        </div>
      </footer>
    </form>
  );
}
