"use client";

import type {
  DocumentClassification,
  DocumentRecord,
} from "@/lib/api";


export type ComposerAttachment = {
  clientId: string;
  fileName: string;
  status: "uploading" | "ready" | "error";
  document?: DocumentRecord;
  classification?: DocumentClassification;
  error?: string;
};


export default function AttachmentBar({
  attachments,
  attaching,
  disabled,
  onChooseFiles,
  onRemove,
}: {
  attachments: ComposerAttachment[];
  attaching: boolean;
  disabled: boolean;
  onChooseFiles: () => void;
  onRemove: (clientId: string) => void;
}) {
  return (
    <section className="composer-attachment-section">
      <div className="composer-attachment-toolbar">
        <button
          type="button"
          className="smart-attachment-button"
          disabled={disabled || attaching}
          onClick={onChooseFiles}
        >
          {attaching
            ? "Processing…"
            : "📎 Attach PDFs"}
        </button>

        <small>
          Select or drop up to six PDFs. Every attached
          document is included when the message is sent.
        </small>
      </div>

      {attachments.length > 0 && (
        <div className="smart-attachment-list">
          {attachments
            .filter(Boolean)
            .map((attachment) => (
            <article
              className={[
                "smart-attachment-card",
                attachment.status,
              ].join(" ")}
              key={attachment.clientId}
            >
              <div>
                <strong>
                  {attachment.fileName ||
                    attachment.document?.original_filename ||
                    "Untitled PDF"}
                </strong>

                {attachment.status === "uploading" && (
                  <>
                    <small>Uploading and processing…</small>
                    <em>Preparing document</em>
                  </>
                )}

                {attachment.status === "error" && (
                  <>
                    <small>Could not process</small>
                    <em>
                      {attachment.error ??
                        "Unknown attachment error"}
                    </em>
                  </>
                )}

                {attachment.status === "ready" &&
                  attachment.document &&
                  attachment.classification && (
                    <>
                      <small>
                        {attachment.classification.category} ·{" "}
                        {attachment.classification.confidence}% ·{" "}
                        {attachment.classification
                          .suggested_executive.toUpperCase()}
                      </small>

                      <em>
                        {attachment.document.page_count
                          ? `${attachment.document.page_count} pages`
                          : "Processed"}
                      </em>
                    </>
                  )}
              </div>

              <button
                type="button"
                aria-label={`Remove ${attachment.fileName}`}
                onClick={() =>
                  onRemove(attachment.clientId)
                }
              >
                ×
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
