"use client";

import CofounderChat from "@/app/components/CofounderChat";
import DecisionPanel from "@/app/components/DecisionPanel";
import IntelligenceDashboard from "@/app/components/IntelligenceDashboard";
import ExecutiveMemoryPanel from "@/app/components/ExecutiveMemoryPanel";
import ResearchEngine from "@/app/components/ResearchEngine";
import StartupStatus from "@/app/components/StartupStatus";
import Toast from "@/app/components/Toast";
import SettingsPanel from "@/app/components/SettingsPanel";
import KnowledgeSpacesPanel from "@/app/components/KnowledgeSpacesPanel";
import { defaultProfile, readProfile, type GrowthOSProfile } from "@/lib/profile";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import {
  readStoredBoolean,
  readStoredNumber,
  readStoredString,
  uiStorageKeys,
  writeStoredBoolean,
  writeStoredNumber,
  writeStoredString,
} from "@/lib/ui-storage";

import {
  streamGroundedQuestion,
  createCompany,
  generateMarketingCampaign,
  generateBusinessPlan,
  getBusinessPlan,
  getCompanies,
  getDocuments,
  getDocumentText,
  deleteDocument,
  processDocument,
  uploadDocument,
  type AnswerSource,
  type BusinessPlan,
  type Company,
  type DocumentRecord,
  type GroundedAnswer,
  type DevelopmentStage,
  type MarketingCampaign,
  type MarketingObjective,
  type MarketingPlatform,
} from "@/lib/api";

type View =
  | "overview"
  | "knowledge"
  | "assistant"
  | "marketing"
  | "companies"
  | "plan"
  | "cofounder"
  | "decisions"
  | "research"
  | "memory"
  | "spaces"
  | "settings";

type ThemePreference = "light" | "dark";

type UserLocation = {
  label: string;
  timezone: string;
};

type CompanyForm = {
  name: string;
  website: string;
  industry: string;
  target_audience: string;
  brand_tone: string;
  product_description: string;
  business_idea: string;
  problem_statement: string;
  proposed_solution: string;
  country: string;
  region: string;
  city: string;
  business_model: string;
  launch_budget: string;
  budget_currency: string;
  primary_goal: string;
  development_stage: DevelopmentStage;
};

type MarketingForm = {
  platform: MarketingPlatform;
  objective: MarketingObjective;
  campaign_brief: string;
  target_audience: string;
  tone: string;
  number_of_variants: number;
};

const emptyCompany: CompanyForm = {
  name: "",
  website: "",
  industry: "",
  target_audience: "",
  brand_tone: "",
  product_description: "",
  business_idea: "",
  problem_statement: "",
  proposed_solution: "",
  country: "",
  region: "",
  city: "",
  business_model: "",
  launch_budget: "",
  budget_currency: "GBP",
  primary_goal: "",
  development_stage: "idea",
};


const workspaceSteps = [
  {
    title: "Identity",
    description: "Name, industry, website, and stage",
  },
  {
    title: "Idea",
    description: "The business concept and value proposition",
  },
  {
    title: "Problem & solution",
    description: "What needs fixing and how you will solve it",
  },
  {
    title: "Market",
    description: "Audience, location, and market focus",
  },
  {
    title: "Model & budget",
    description: "How the business earns and what it can spend",
  },
  {
    title: "Brand & goal",
    description: "Positioning, offer, and primary objective",
  },
  {
    title: "Review",
    description: "Confirm the complete workspace",
  },
] as const;

const emptyMarketing: MarketingForm = {
  platform: "linkedin",
  objective: "lead_generation",
  campaign_brief: "",
  target_audience: "",
  tone: "",
  number_of_variants: 1,
};

const navItems: Array<{
  id: View;
  label: string;
  icon: string;
}> = [
  { id: "overview", label: "Intelligence Dashboard", icon: "◫" },
  { id: "knowledge", label: "Business Intelligence", icon: "▤" },
  { id: "spaces", label: "Knowledge", icon: "▧" },
  { id: "assistant", label: "AI Assistant", icon: "✦" },
  { id: "cofounder", label: "Executive Team", icon: "◉" },
  { id: "decisions", label: "Decision Intelligence", icon: "◇" },
  { id: "memory", label: "Executive Memory", icon: "◌" },
  { id: "research", label: "Research Engine", icon: "⌕" },
  { id: "marketing", label: "Marketing Studio", icon: "◈" },
  { id: "plan", label: "Business Plan", icon: "▥" },
  { id: "companies", label: "Workspaces", icon: "▦" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

function cx(
  ...values: Array<string | false | null | undefined>
) {
  return values.filter(Boolean).join(" ");
}

function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="page-heading">
      <span>{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

function ScopeSelector({
  documents,
  activeDocumentId,
  useAllDocuments,
  onActiveDocumentChange,
  onUseAllDocumentsChange,
}: {
  documents: DocumentRecord[];
  activeDocumentId: number | null;
  useAllDocuments: boolean;
  onActiveDocumentChange: (documentId: number | null) => void;
  onUseAllDocumentsChange: (value: boolean) => void;
}) {
  const processedDocuments = documents.filter(
    (document) =>
      document.processing_status === "processed",
  );

  return (
    <section className="scope-card">
      <div>
        <span className="panel-icon violet">◎</span>
        <div>
          <strong>Knowledge scope</strong>
          <p>
            Choose exactly which documents the AI may search.
          </p>
        </div>
      </div>

      <label>
        <input
          id="scope-one-document"
          type="radio"
          name="scope"
          checked={!useAllDocuments}
          onChange={() => onUseAllDocumentsChange(false)}
          disabled={processedDocuments.length === 0}
        />
        <span>
          <strong>One document</strong>
          <small>Best for precise answers.</small>
        </span>
      </label>

      <label>
        <input
          id="scope-all-documents"
          type="radio"
          name="scope"
          checked={useAllDocuments}
          onChange={() => onUseAllDocumentsChange(true)}
        />
        <span>
          <strong>All documents</strong>
          <small>Search the full company knowledge base.</small>
        </span>
      </label>

      {!useAllDocuments && (
        <select
          id="scope-document"
          name="scope-document"
          className="field"
          value={activeDocumentId ?? ""}
          onChange={(event) =>
            onActiveDocumentChange(
              event.target.value
                ? Number(event.target.value)
                : null,
            )
          }
        >
          <option value="">Select a document</option>
          {processedDocuments.map((document) => (
            <option key={document.id} value={document.id}>
              {document.original_filename}
            </option>
          ))}
        </select>
      )}
    </section>
  );
}

function KnowledgeView({
  selectedCompanyId,
  documents,
  activeDocumentId,
  selectedFile,
  uploadingDocument,
  onFileChange,
  onUpload,
  onSelectDocument,
  onAskDocument,
  onMarketingDocument,
  onDocumentsChanged,
  onError,
}: {
  selectedCompanyId: number | null;
  documents: DocumentRecord[];
  activeDocumentId: number | null;
  selectedFile: File | null;
  uploadingDocument: boolean;
  onFileChange: (file: File | null) => void;
  onUpload: (event: FormEvent<HTMLFormElement>) => void;
  onSelectDocument: (documentId: number) => void;
  onAskDocument: (document: DocumentRecord) => void;
  onMarketingDocument: (document: DocumentRecord) => void;
  onDocumentsChanged: (documents: DocumentRecord[]) => void;
  onError: (message: string) => void;
}) {
  const [formatFilter, setFormatFilter] = useState<string>("ALL");
  const [preview, setPreview] = useState<{
    document: DocumentRecord;
    text: string;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const formatDefinitions = [
    { name: "PDF", icon: "PDF", extensions: ".pdf", keys: ["PDF"] },
    { name: "Word", icon: "W", extensions: ".docx · .doc · .rtf · .txt", keys: ["DOCX", "DOC", "RTF", "TXT", "MD"] },
    { name: "Excel", icon: "X", extensions: ".xlsx · .xls", keys: ["XLSX", "XLS"] },
    { name: "CSV", icon: "CSV", extensions: ".csv · .tsv", keys: ["CSV", "TSV"] },
    { name: "Email / JSON", icon: "DATA", extensions: ".eml · .json · .html", keys: ["EML", "JSON", "HTML", "HTM"] },
    { name: "Images", icon: "IMG", extensions: ".png · .jpg · .jpeg · .webp", keys: ["PNG", "JPG", "JPEG", "WEBP", "BMP", "GIF"] },
  ];

  function fileTypeLabel(document: DocumentRecord) {
    return document.original_filename.split(".").pop()?.toUpperCase() || "FILE";
  }

  const formatCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const document of documents) {
      const type = fileTypeLabel(document);
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    return counts;
  }, [documents]);

  const visibleDocuments = useMemo(() => {
    if (formatFilter === "ALL") return documents;
    const definition = formatDefinitions.find((format) => format.name === formatFilter);
    if (!definition) return documents;
    return documents.filter((document) => definition.keys.includes(fileTypeLabel(document)));
  }, [documents, formatFilter]);

  async function openPreview(document: DocumentRecord) {
    setPreviewLoading(true);
    try {
      const detail = await getDocumentText(document.id);
      setPreview({
        document,
        text: detail.extracted_text?.trim() || "No readable text was extracted from this asset.",
      });
    } catch (error) {
      onError(error instanceof Error ? error.message : "The asset preview could not be opened.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function removeAsset(document: DocumentRecord) {
    if (!window.confirm(`Delete “${document.original_filename}”?\n\nThis removes the asset and its search index.`)) return;
    try {
      await deleteDocument(document.id);
      onDocumentsChanged(documents.filter((candidate) => candidate.id !== document.id));
      if (preview?.document.id === document.id) setPreview(null);
    } catch (error) {
      onError(error instanceof Error ? error.message : "The asset could not be deleted.");
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Business intelligence"
        title="One hub for every business asset"
        description="Import documents, spreadsheets, structured data, email, and images into the evidence layer behind your AI co-founder."
      />

      <section className="intelligence-format-grid" aria-label="Filter assets by file type">
        {formatDefinitions.map((format) => {
          const count = format.keys.reduce((total, key) => total + (formatCounts.get(key) ?? 0), 0);
          const active = formatFilter === format.name;
          return (
            <button
              type="button"
              key={format.name}
              className={cx("format-card", "available", active && "selected")}
              onClick={() => setFormatFilter(active ? "ALL" : format.name)}
            >
              <span>{format.icon}</span>
              <div>
                <strong>{format.name}</strong>
                <small>{format.extensions}</small>
              </div>
              <em><i />{count} asset{count === 1 ? "" : "s"}</em>
            </button>
          );
        })}
      </section>

      <section className="intelligence-upload-layout">
        <form className="panel intelligence-upload-panel" onSubmit={onUpload}>
          <div className="panel-heading">
            <span className="panel-icon cyan">⇧</span>
            <div><h2>Upload business intelligence</h2><p>GrowthOS detects the file type before indexing.</p></div>
          </div>
          <label className={cx("intelligence-dropzone", selectedFile && "has-file")} htmlFor="document-file">
            <input
              id="document-file"
              name="document-file"
              type="file"
              accept=".pdf,.docx,.doc,.txt,.md,.rtf,.xlsx,.xls,.csv,.tsv,.json,.html,.htm,.eml,.png,.jpg,.jpeg,.webp,.bmp,.gif"
              onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
            />
            <div className="dropzone-icon">⇧</div>
            <strong>{selectedFile ? selectedFile.name : "Drag a business asset here"}</strong>
            <p>{selectedFile ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB · Ready to index` : "or click to browse your computer"}</p>
            <span className="dropzone-limit">Supported assets up to 10 MB</span>
          </label>
          <button className="primary-button full-button" type="submit" disabled={uploadingDocument || selectedCompanyId === null || selectedFile === null}>
            {uploadingDocument ? "Extracting, chunking, and embedding..." : "Index asset for AI"}
          </button>
          {uploadingDocument && <div className="upload-progress"><i /></div>}
        </form>

        <aside className="panel intelligence-pipeline-panel">
          <div className="panel-heading"><span className="panel-icon violet">◎</span><div><h2>Universal ingestion pipeline</h2><p>A shared architecture for every supported file type.</p></div></div>
          <div className="process-list">
            {[
              ["Detect asset type", "The extractor factory identifies the correct parser."],
              ["Extract structure", "Pages, text, tables, sheets, and metadata are normalised."],
              ["Create evidence chunks", "Context is split into searchable passages."],
              ["Generate embeddings", "Meaning becomes searchable across the workspace."],
              ["Activate intelligence", "The asset becomes available to AI and semantic search."],
            ].map(([title, description], index) => <article key={title}><span>{index + 1}</span><div><strong>{title}</strong><p>{description}</p></div></article>)}
          </div>
          <div className="pipeline-truth"><span>Important</span><strong>Images use metadata only</strong><p>Visual content and OCR are not analysed in this local release. GrowthOS will not infer that an image lacks business value.</p></div>
        </aside>
      </section>

      <section className="panel asset-library">
        <div className="panel-heading library-heading">
          <span className="panel-icon cyan">▦</span>
          <div><h2>Intelligence library</h2><p>Open, use, ask about, filter, or delete imported assets.</p></div>
          <small>{visibleDocuments.length} of {documents.length} asset(s)</small>
        </div>
        {visibleDocuments.length === 0 ? (
          <div className="empty-library asset-empty"><span>▤</span><strong>No matching assets</strong><p>Upload a file or choose another file-type filter.</p></div>
        ) : (
          <div className="asset-card-grid">
            {visibleDocuments.map((document) => {
              const ready = document.processing_status === "processed";
              const active = document.id === activeDocumentId;
              return (
                <article className={cx("asset-card", active && "active")} key={document.id}>
                  <header><span className="asset-type">{fileTypeLabel(document)}</span><span className={cx("document-status", ready ? "ready" : "pending")}>{ready ? "AI Ready" : document.processing_status}</span></header>
                  <button type="button" className="asset-title" onClick={() => void openPreview(document)} disabled={!ready || previewLoading}>
                    <span>▤</span><div><strong>{document.original_filename}</strong><small>Uploaded {new Date(document.uploaded_at).toLocaleDateString()}</small></div>
                  </button>
                  <div className="asset-metadata"><div><span>Size</span><strong>{(document.file_size / 1024 / 1024).toFixed(2)} MB</strong></div><div><span>Pages</span><strong>{document.page_count ?? "—"}</strong></div><div><span>Characters</span><strong>{document.character_count ? document.character_count.toLocaleString() : "—"}</strong></div></div>
                  {document.processing_error && <p className="asset-error">{document.processing_error}</p>}
                  <footer>
                    <button type="button" onClick={() => void openPreview(document)} disabled={!ready}>Open</button>
                    <button type="button" onClick={() => onAskDocument(document)} disabled={!ready}>✦ Ask AI</button>
                    <button type="button" onClick={() => onSelectDocument(document.id)} disabled={!ready}>{active ? "✓ Active" : "Use source"}</button>
                    <button type="button" className="danger" onClick={() => void removeAsset(document)}>Delete</button>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {preview && (
        <div className="asset-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null); }}>
          <section className="asset-preview-modal" role="dialog" aria-modal="true" aria-label={`Preview ${preview.document.original_filename}`}>
            <header><div><span>{fileTypeLabel(preview.document)} · Asset preview</span><h2>{preview.document.original_filename}</h2></div><button type="button" aria-label="Close preview" onClick={() => setPreview(null)}>×</button></header>
            <div className="asset-preview-body"><pre>{preview.text}</pre></div>
            <footer><button type="button" onClick={() => onAskDocument(preview.document)}>Ask AI</button><button type="button" className="danger" onClick={() => void removeAsset(preview.document)}>Delete</button><button type="button" onClick={() => setPreview(null)}>Close</button></footer>
          </section>
        </div>
      )}
    </>
  );
}

function AssistantView({
  documents,
  activeDocumentId,
  useAllDocuments,
  question,
  askingQuestion,
  answer,
  onQuestionChange,
  onSubmit,
  onDocumentChange,
  onScopeChange,
}: {
  documents: DocumentRecord[];
  activeDocumentId: number | null;
  useAllDocuments: boolean;
  question: string;
  askingQuestion: boolean;
  answer: GroundedAnswer | null;
  onQuestionChange: (value: string) => void;
  onSubmit: (
    event: FormEvent<HTMLFormElement>,
  ) => void;
  onDocumentChange: (
    documentId: number | null,
  ) => void;
  onScopeChange: (value: boolean) => void;
}) {
  return (
    <>
      <PageHeading
        eyebrow="Grounded assistant"
        title="Ask your company knowledge"
        description="Choose one document for precise retrieval, or search the full company workspace."
      />

      <ScopeSelector
        documents={documents}
        activeDocumentId={activeDocumentId}
        useAllDocuments={useAllDocuments}
        onActiveDocumentChange={onDocumentChange}
        onUseAllDocumentsChange={onScopeChange}
      />

      <section className="assistant-layout">
        <form className="panel" onSubmit={onSubmit}>
          <div className="panel-heading">
            <span className="panel-icon violet">✦</span>
            <div>
              <h2>New question</h2>
              <p>
                The backend enforces the selected scope.
              </p>
            </div>
          </div>

          <label
            className="field-label"
            htmlFor="question"
          >
            Question
          </label>

          <textarea
            id="question"
            className="field textarea"
            rows={8}
            value={question}
            onChange={(event) =>
              onQuestionChange(event.target.value)
            }
            placeholder="What professional experience is described in this document?"
          />

          <button
            className="primary-button full-button"
            type="submit"
            disabled={
              askingQuestion ||
              (!useAllDocuments &&
                activeDocumentId === null)
            }
          >
            {askingQuestion
              ? "Retrieving scoped evidence..."
              : "Ask GrowthOS"}
          </button>

          <p className="helper-text">
            Local generation may take up to one minute on CPU.
          </p>
        </form>

        <section className="panel result-panel">
          {!answer && !askingQuestion && (
            <div className="empty-state">
              <span>✦</span>
              <h2>
                Your grounded answer will appear here
              </h2>
              <p>
                Specific questions produce better results than
                vague prompts such as “what is this?”
              </p>
            </div>
          )}

          {askingQuestion && !answer && (
            <div className="loading-state">
              <span>◎</span>
              <h2>Retrieving scoped evidence</h2>
              <p>
                The local model is preparing a grounded
                response.
              </p>
              <div>
                <i />
              </div>
            </div>
          )}

          {answer && (
            <div className={cx(
              "answer-result",
              askingQuestion && "streaming",
            )}>
              <div className="result-meta">
                <span className="status-badge">
                  <i />{" "}
                  {answer.document_name ??
                    "All company documents"}
                </span>
                <small>{answer.model}</small>
              </div>

              <h2>{answer.question}</h2>
              <div className="answer-copy">
                {answer.answer}
              </div>

              {askingQuestion && (
                <div className="typing-indicator active">
                  <span />
                  <span />
                  <span />
                </div>
              )}

              <div className="source-heading">
                <h3>Evidence sources</h3>
                <span>
                  {answer.source_count} retrieved
                </span>
              </div>

              <div className="source-list">
                {answer.sources.map(
                  (source: AnswerSource) => (
                    <article key={source.source_id}>
                      <div>
                        <strong>
                          [{source.source_id}]{" "}
                          {source.document_name}
                        </strong>
                        <span>
                          Page{" "}
                          {source.page_number ?? "unknown"}
                        </span>
                      </div>
                      <p>{source.text}</p>
                      <small>
                        Similarity score{" "}
                        {source.similarity_score}
                      </small>
                    </article>
                  ),
                )}
              </div>
            </div>
          )}
        </section>
      </section>
    </>
  );
}

function MarketingView({
  documents,
  activeDocumentId,
  useAllDocuments,
  marketingForm,
  generatingCampaign,
  campaign,
  onFormChange,
  onSubmit,
  onDocumentChange,
  onScopeChange,
}: {
  documents: DocumentRecord[];
  activeDocumentId: number | null;
  useAllDocuments: boolean;
  marketingForm: MarketingForm;
  generatingCampaign: boolean;
  campaign: MarketingCampaign | null;
  onFormChange: (form: MarketingForm) => void;
  onSubmit: (
    event: FormEvent<HTMLFormElement>,
  ) => void;
  onDocumentChange: (
    documentId: number | null,
  ) => void;
  onScopeChange: (value: boolean) => void;
}) {
  return (
    <>
      <PageHeading
        eyebrow="Marketing Studio"
        title="Generate campaigns from verified evidence"
        description="Choose one document or the whole company knowledge base before generating content."
      />

      <ScopeSelector
        documents={documents}
        activeDocumentId={activeDocumentId}
        useAllDocuments={useAllDocuments}
        onActiveDocumentChange={onDocumentChange}
        onUseAllDocumentsChange={onScopeChange}
      />

      <section className="assistant-layout">
        <form
          className="panel stacked-form"
          onSubmit={onSubmit}
        >
          <div className="panel-heading">
            <span className="panel-icon amber">◈</span>
            <div>
              <h2>Campaign brief</h2>
              <p>
                One variant is recommended for local models.
              </p>
            </div>
          </div>

          <div className="form-grid">
            <div>
              <label
                className="field-label"
                htmlFor="platform"
              >
                Platform
              </label>
              <select
                id="platform"
                className="field"
                value={marketingForm.platform}
                onChange={(event) =>
                  onFormChange({
                    ...marketingForm,
                    platform:
                      event.target
                        .value as MarketingPlatform,
                  })
                }
              >
                <option value="linkedin">
                  LinkedIn
                </option>
                <option value="instagram">
                  Instagram
                </option>
                <option value="facebook">
                  Facebook
                </option>
                <option value="google_ads">
                  Google Ads
                </option>
                <option value="email">
                  Email campaign
                </option>
              </select>
            </div>

            <div>
              <label
                className="field-label"
                htmlFor="objective"
              >
                Objective
              </label>
              <select
                id="objective"
                className="field"
                value={marketingForm.objective}
                onChange={(event) =>
                  onFormChange({
                    ...marketingForm,
                    objective:
                      event.target
                        .value as MarketingObjective,
                  })
                }
              >
                <option value="brand_awareness">
                  Brand awareness
                </option>
                <option value="lead_generation">
                  Lead generation
                </option>
                <option value="product_launch">
                  Product launch
                </option>
                <option value="sales">Sales</option>
                <option value="engagement">
                  Engagement
                </option>
              </select>
            </div>
          </div>

          <label
            className="field-label"
            htmlFor="brief"
          >
            Campaign brief
          </label>

          <textarea
            id="brief"
            className="field textarea"
            rows={7}
            minLength={5}
            required
            value={marketingForm.campaign_brief}
            onChange={(event) =>
              onFormChange({
                ...marketingForm,
                campaign_brief: event.target.value,
              })
            }
            placeholder="Create a professional LinkedIn post based on the selected document."
          />

          <div className="form-grid">
            <div>
              <label
                className="field-label"
                htmlFor="audience-override"
              >
                Audience override
              </label>
              <input
                id="audience-override"
                className="field"
                value={marketingForm.target_audience}
                onChange={(event) =>
                  onFormChange({
                    ...marketingForm,
                    target_audience: event.target.value,
                  })
                }
                placeholder="Optional"
              />
            </div>

            <div>
              <label
                className="field-label"
                htmlFor="tone"
              >
                Tone override
              </label>
              <input
                id="tone"
                className="field"
                value={marketingForm.tone}
                onChange={(event) =>
                  onFormChange({
                    ...marketingForm,
                    tone: event.target.value,
                  })
                }
                placeholder="Optional"
              />
            </div>
          </div>

          <button
            className="primary-button amber-button full-button"
            type="submit"
            disabled={
              generatingCampaign ||
              (!useAllDocuments &&
                activeDocumentId === null)
            }
          >
            {generatingCampaign
              ? "Generating grounded campaign..."
              : "Generate campaign"}
          </button>
        </form>

        <section className="panel result-panel">
          {!campaign && !generatingCampaign && (
            <div className="empty-state amber-empty">
              <span>◈</span>
              <h2>Your campaign will appear here</h2>
              <p>
                The selected scope prevents unrelated files from
                influencing the result.
              </p>
            </div>
          )}

          {generatingCampaign && (
            <div className="loading-state amber-loading">
              <span>◈</span>
              <h2>Building your campaign</h2>
              <p>
                Local structured generation may take up to one
                minute.
              </p>
              <div>
                <i />
              </div>
            </div>
          )}

          {campaign && !generatingCampaign && (
            <div className="campaign-result">
              <div className="result-meta">
                <span className="status-badge amber-badge">
                  <i />{" "}
                  {campaign.document_name ??
                    campaign.platform.replace("_", " ")}
                </span>
                <small>{campaign.model}</small>
              </div>

              {campaign.variants.map((variant) => (
                <article
                  className="campaign-card"
                  key={variant.variant_number}
                >
                  <small>
                    Variant {variant.variant_number}
                  </small>
                  <h2>{variant.headline}</h2>
                  <p>{variant.body}</p>

                  <div className="campaign-cta">
                    <span>Call to action</span>
                    <strong>
                      {variant.call_to_action}
                    </strong>
                  </div>

                  <div className="tag-row">
                    {variant.hashtags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>

                  <footer>
                    Evidence:{" "}
                    {variant.citations.join(", ")}
                  </footer>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </>
  );
}


function PlanList({
  eyebrow,
  title,
  items,
}: {
  eyebrow: string;
  title: string;
  items: string[];
}) {
  return (
    <article className="plan-section">
      <small>{eyebrow}</small>
      <h3>{title}</h3>
      <ul className="plan-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}


function SwotCard({
  title,
  className,
  items,
}: {
  title: string;
  className: string;
  items: string[];
}) {
  return (
    <article className={`swot-card ${className}`}>
      <h4>{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}


function BusinessPlanView({
  selectedCompany,
  businessPlan,
  generatingBusinessPlan,
  loadingBusinessPlan,
  onGenerate,
}: {
  selectedCompany: Company | null;
  businessPlan: BusinessPlan | null;
  generatingBusinessPlan: boolean;
  loadingBusinessPlan: boolean;
  onGenerate: () => void;
}) {
  if (!selectedCompany) {
    return (
      <>
        <PageHeading
          eyebrow="AI business plan"
          title="Select a business workspace"
          description="A complete workspace profile is required before GrowthOS can generate a strategic plan."
        />
        <section className="panel plan-empty-panel">
          <div className="empty-state">
            <span>▥</span>
            <h2>No active workspace</h2>
            <p>Select or create a workspace first.</p>
          </div>
        </section>
      </>
    );
  }

  const plan = businessPlan?.plan;

  return (
    <>
      <PageHeading
        eyebrow="AI business co-founder"
        title={`${selectedCompany.name} business plan`}
        description="A practical strategy generated from the structured workspace profile. External facts remain research tasks until verified."
      />

      <section className="plan-command-card">
        <div>
          <span className="panel-icon violet">▥</span>
          <div>
            <strong>
              {businessPlan
                ? "Saved strategic plan"
                : "Generate the first strategic plan"}
            </strong>
            <p>
              {businessPlan
                ? `Generated ${new Date(
                    businessPlan.generated_at,
                  ).toLocaleString()} with ${businessPlan.model}.`
                : "GrowthOS will analyse the idea, audience, location, budget, risks, marketing, and the first 90 days."}
            </p>
          </div>
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={onGenerate}
          disabled={generatingBusinessPlan}
        >
          {generatingBusinessPlan
            ? "Generating with local AI..."
            : businessPlan
              ? "Regenerate plan"
              : "Generate business plan"}
        </button>
      </section>

      {(generatingBusinessPlan || loadingBusinessPlan) && (
        <section className="panel plan-loading">
          <span>◎</span>
          <h2>
            {generatingBusinessPlan
              ? "Your AI co-founder is building the plan"
              : "Loading the saved plan"}
          </h2>
          <p>
            This larger structured response may take one or two
            minutes on a CPU-only machine.
          </p>
          <div><i /></div>
        </section>
      )}

      {!plan &&
        !generatingBusinessPlan &&
        !loadingBusinessPlan && (
          <section className="panel plan-empty-panel">
            <div className="empty-state">
              <span>▥</span>
              <h2>Your strategic plan will appear here</h2>
              <p>
                Complete the workspace wizard, then generate a
                plan from the saved business profile.
              </p>
            </div>
          </section>
        )}

      {plan &&
        !generatingBusinessPlan &&
        !loadingBusinessPlan && (
          <div className="business-plan-report">
            <section className="plan-hero">
              <div>
                <small>Executive summary</small>
                <h2>{selectedCompany.name}</h2>
                <p>{plan.executive_summary}</p>
              </div>
              <aside>
                <span>Stage</span>
                <strong>
                  {selectedCompany.development_stage?.replace(
                    "_",
                    " ",
                  ) ?? "Not specified"}
                </strong>
                <span>Target location</span>
                <strong>
                  {[
                    selectedCompany.city,
                    selectedCompany.region,
                    selectedCompany.country,
                  ]
                    .filter(Boolean)
                    .join(", ") || "Not specified"}
                </strong>
                <span>Primary goal</span>
                <strong>
                  {selectedCompany.primary_goal ??
                    "Not specified"}
                </strong>
              </aside>
            </section>

            <section className="plan-two-column">
              <article className="plan-section">
                <small>Business opportunity</small>
                <h3>Why this may matter</h3>
                <p>{plan.opportunity}</p>
              </article>
              <article className="plan-section">
                <small>Target market</small>
                <h3>Who and where to validate</h3>
                <p>{plan.target_market}</p>
              </article>
            </section>

            <section className="plan-section">
              <small>Value proposition</small>
              <h3>The core reason customers should care</h3>
              <p>{plan.value_proposition}</p>
            </section>

            <section className="plan-section">
              <small>Customer segments</small>
              <h3>Priority audiences</h3>
              <div className="segment-grid">
                {plan.customer_segments.map(
                  (segment, index) => (
                    <article key={`${segment.name}-${index}`}>
                      <span>{index + 1}</span>
                      <h4>{segment.name}</h4>
                      <p>{segment.description}</p>
                      <strong>Needs</strong>
                      <ul>
                        {segment.needs.map((need) => (
                          <li key={need}>{need}</li>
                        ))}
                      </ul>
                      <footer>
                        Message: {segment.recommended_message}
                      </footer>
                    </article>
                  ),
                )}
              </div>
            </section>

            <section className="plan-two-column">
              <PlanList
                eyebrow="Business model"
                title="Commercial recommendations"
                items={plan.business_model_recommendations}
              />
              <PlanList
                eyebrow="Go-to-market"
                title="Launch approach"
                items={plan.go_to_market_strategy}
              />
            </section>

            <section className="plan-section">
              <small>Marketing strategy</small>
              <h3>How to reach the first audiences</h3>
              <div className="numbered-plan-list">
                {plan.marketing_strategy.map(
                  (item, index) => (
                    <div key={item}>
                      <span>{index + 1}</span>
                      <p>{item}</p>
                    </div>
                  ),
                )}
              </div>
            </section>

            <section className="plan-section">
              <small>SWOT analysis</small>
              <h3>Strategic position</h3>
              <div className="swot-grid">
                <SwotCard
                  title="Strengths"
                  className="strength"
                  items={plan.swot.strengths}
                />
                <SwotCard
                  title="Weaknesses"
                  className="weakness"
                  items={plan.swot.weaknesses}
                />
                <SwotCard
                  title="Opportunities"
                  className="opportunity"
                  items={plan.swot.opportunities}
                />
                <SwotCard
                  title="Threats"
                  className="threat"
                  items={plan.swot.threats}
                />
              </div>
            </section>

            <section className="plan-two-column">
              <PlanList
                eyebrow="Risk"
                title="Key risks to control"
                items={plan.key_risks}
              />
              <PlanList
                eyebrow="Research"
                title="Evidence to collect next"
                items={plan.research_priorities}
              />
            </section>

            <section className="plan-section">
              <small>90-day roadmap</small>
              <h3>From idea to evidence</h3>
              <div className="roadmap-grid">
                {plan.ninety_day_roadmap.map(
                  (phase, index) => (
                    <article
                      key={`${phase.period}-${index}`}
                    >
                      <span>{phase.period}</span>
                      <h4>{phase.objective}</h4>
                      <ul>
                        {phase.actions.map((action) => (
                          <li key={action}>{action}</li>
                        ))}
                      </ul>
                      <footer>
                        Success: {phase.success_measure}
                      </footer>
                    </article>
                  ),
                )}
              </div>
            </section>

            <section className="plan-two-column">
              <PlanList
                eyebrow="Action"
                title="Immediate next steps"
                items={plan.next_actions}
              />
              <PlanList
                eyebrow="Important"
                title="Assumptions and limitations"
                items={plan.assumptions_and_limitations}
              />
            </section>
          </div>
        )}
    </>
  );
}


function CompaniesView({
  companies,
  selectedCompanyId,
  companyForm,
  creatingCompany,
  wizardStep,
  onWizardStepChange,
  onFormChange,
  onSubmit,
  onSelectCompany,
}: {
  companies: Company[];
  selectedCompanyId: number | null;
  companyForm: CompanyForm;
  creatingCompany: boolean;
  wizardStep: number;
  onWizardStepChange: (step: number) => void;
  onFormChange: (form: CompanyForm) => void;
  onSubmit: (
    event: FormEvent<HTMLFormElement>,
  ) => void;
  onSelectCompany: (companyId: number) => void;
}) {
  const finalStep = workspaceSteps.length - 1;

  function canContinue(): boolean {
    if (wizardStep === 0) {
      return (
        companyForm.name.trim().length >= 2 &&
        companyForm.industry.trim().length >= 2
      );
    }

    if (wizardStep === 1) {
      return companyForm.business_idea.trim().length >= 10;
    }

    if (wizardStep === 2) {
      return (
        companyForm.problem_statement.trim().length >= 10 &&
        companyForm.proposed_solution.trim().length >= 10
      );
    }

    if (wizardStep === 3) {
      return (
        companyForm.target_audience.trim().length >= 5 &&
        companyForm.country.trim().length >= 2
      );
    }

    if (wizardStep === 4) {
      return (
        companyForm.business_model.trim().length >= 2 &&
        companyForm.budget_currency.trim().length === 3
      );
    }

    if (wizardStep === 5) {
      return (
        companyForm.brand_tone.trim().length >= 2 &&
        companyForm.product_description.trim().length >= 10 &&
        companyForm.primary_goal.trim().length >= 3
      );
    }

    return true;
  }

  function nextStep() {
    if (!canContinue()) {
      return;
    }

    onWizardStepChange(
      Math.min(wizardStep + 1, finalStep),
    );
  }

  function previousStep() {
    onWizardStepChange(
      Math.max(wizardStep - 1, 0),
    );
  }

  const locationSummary = [
    companyForm.city,
    companyForm.region,
    companyForm.country,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <PageHeading
        eyebrow="Business workspaces"
        title="Build your AI business foundation"
        description="Create a structured workspace that will guide future research, market intelligence, grounded answers, and campaigns."
      />

      <section className="workspace-wizard-layout">
        <form
          className="panel workspace-wizard"
          onSubmit={onSubmit}
        >
          <div className="wizard-progress">
            <div className="wizard-progress-heading">
              <div>
                <small>
                  Step {wizardStep + 1} of{" "}
                  {workspaceSteps.length}
                </small>
                <strong>
                  {workspaceSteps[wizardStep].title}
                </strong>
                <p>
                  {workspaceSteps[wizardStep].description}
                </p>
              </div>
              <span>
                {Math.round(
                  ((wizardStep + 1) /
                    workspaceSteps.length) *
                    100,
                )}
                %
              </span>
            </div>

            <div className="wizard-progress-track">
              <i
                style={{
                  width: `${
                    ((wizardStep + 1) /
                      workspaceSteps.length) *
                    100
                  }%`,
                }}
              />
            </div>

            <div className="wizard-step-dots">
              {workspaceSteps.map((step, index) => (
                <button
                  key={step.title}
                  type="button"
                  className={cx(
                    index === wizardStep && "active",
                    index < wizardStep && "complete",
                  )}
                  onClick={() => {
                    if (index <= wizardStep) {
                      onWizardStepChange(index);
                    }
                  }}
                  aria-label={`Open ${step.title}`}
                >
                  {index < wizardStep ? "✓" : index + 1}
                </button>
              ))}
            </div>
          </div>

          <div className="wizard-content">
            {wizardStep === 0 && (
              <section className="wizard-step">
                <div className="panel-heading">
                  <span className="panel-icon emerald">▦</span>
                  <div>
                    <h2>Business identity</h2>
                    <p>
                      Start with the essential information about
                      the workspace.
                    </p>
                  </div>
                </div>

                <div className="form-grid">
                  <div>
                    <label
                      className="field-label"
                      htmlFor="company-name"
                    >
                      Business or project name *
                    </label>
                    <input
                      id="company-name"
                      className="field"
                      autoFocus
                      required
                      minLength={2}
                      value={companyForm.name}
                      onChange={(event) =>
                        onFormChange({
                          ...companyForm,
                          name: event.target.value,
                        })
                      }
                      placeholder="SignBridge Accessibility"
                    />
                  </div>

                  <div>
                    <label
                      className="field-label"
                      htmlFor="industry"
                    >
                      Industry *
                    </label>
                    <input
                      id="industry"
                      className="field"
                      required
                      minLength={2}
                      value={companyForm.industry}
                      onChange={(event) =>
                        onFormChange({
                          ...companyForm,
                          industry: event.target.value,
                        })
                      }
                      placeholder="Accessibility Technology"
                    />
                  </div>
                </div>

                <div className="form-grid">
                  <div>
                    <label
                      className="field-label"
                      htmlFor="website"
                    >
                      Website
                    </label>
                    <input
                      id="website"
                      className="field"
                      type="url"
                      value={companyForm.website}
                      onChange={(event) =>
                        onFormChange({
                          ...companyForm,
                          website: event.target.value,
                        })
                      }
                      placeholder="https://example.com"
                    />
                  </div>

                  <div>
                    <label
                      className="field-label"
                      htmlFor="development-stage"
                    >
                      Development stage
                    </label>
                    <select
                      id="development-stage"
                      className="field"
                      value={companyForm.development_stage}
                      onChange={(event) =>
                        onFormChange({
                          ...companyForm,
                          development_stage:
                            event.target
                              .value as DevelopmentStage,
                        })
                      }
                    >
                      <option value="idea">Idea</option>
                      <option value="validation">
                        Validation
                      </option>
                      <option value="pre_launch">
                        Pre-launch
                      </option>
                      <option value="launched">
                        Launched
                      </option>
                      <option value="growing">
                        Growing
                      </option>
                      <option value="established">
                        Established
                      </option>
                    </select>
                  </div>
                </div>
              </section>
            )}

            {wizardStep === 1 && (
              <section className="wizard-step">
                <div className="panel-heading">
                  <span className="panel-icon violet">✦</span>
                  <div>
                    <h2>The business idea</h2>
                    <p>
                      Explain what you want to build and why it
                      matters.
                    </p>
                  </div>
                </div>

                <label
                  className="field-label"
                  htmlFor="business-idea"
                >
                  What are you building? *
                </label>
                <textarea
                  id="business-idea"
                  className="field textarea wizard-large-textarea"
                  autoFocus
                  required
                  minLength={10}
                  rows={9}
                  value={companyForm.business_idea}
                  onChange={(event) =>
                    onFormChange({
                      ...companyForm,
                      business_idea: event.target.value,
                    })
                  }
                  placeholder="Describe the business, product, service, or project you want GrowthOS to help develop."
                />

                <div className="wizard-tip">
                  <span>Tip</span>
                  <p>
                    Include the customer, the setting, and the
                    outcome you want to create.
                  </p>
                </div>
              </section>
            )}

            {wizardStep === 2 && (
              <section className="wizard-step">
                <div className="panel-heading">
                  <span className="panel-icon amber">◎</span>
                  <div>
                    <h2>Problem and solution</h2>
                    <p>
                      Define the need clearly before GrowthOS
                      begins market analysis.
                    </p>
                  </div>
                </div>

                <label
                  className="field-label"
                  htmlFor="problem-statement"
                >
                  What problem are you solving? *
                </label>
                <textarea
                  id="problem-statement"
                  className="field textarea"
                  autoFocus
                  required
                  minLength={10}
                  rows={6}
                  value={companyForm.problem_statement}
                  onChange={(event) =>
                    onFormChange({
                      ...companyForm,
                      problem_statement:
                        event.target.value,
                    })
                  }
                  placeholder="Describe the customer pain, business gap, accessibility barrier, or market need."
                />

                <label
                  className="field-label"
                  htmlFor="proposed-solution"
                >
                  What is your proposed solution? *
                </label>
                <textarea
                  id="proposed-solution"
                  className="field textarea"
                  required
                  minLength={10}
                  rows={6}
                  value={companyForm.proposed_solution}
                  onChange={(event) =>
                    onFormChange({
                      ...companyForm,
                      proposed_solution:
                        event.target.value,
                    })
                  }
                  placeholder="Explain how your product or service will solve the problem."
                />
              </section>
            )}

            {wizardStep === 3 && (
              <section className="wizard-step">
                <div className="panel-heading">
                  <span className="panel-icon cyan">⌖</span>
                  <div>
                    <h2>Target market and location</h2>
                    <p>
                      This becomes the geographic and demographic
                      scope for future intelligence.
                    </p>
                  </div>
                </div>

                <label
                  className="field-label"
                  htmlFor="target-audience"
                >
                  Target audience *
                </label>
                <textarea
                  id="target-audience"
                  className="field textarea"
                  autoFocus
                  required
                  minLength={5}
                  rows={5}
                  value={companyForm.target_audience}
                  onChange={(event) =>
                    onFormChange({
                      ...companyForm,
                      target_audience:
                        event.target.value,
                    })
                  }
                  placeholder="Who will buy, use, fund, or benefit from this business?"
                />

                <div className="location-grid">
                  <div>
                    <label
                      className="field-label"
                      htmlFor="country"
                    >
                      Country *
                    </label>
                    <input
                      id="country"
                      className="field"
                      required
                      value={companyForm.country}
                      onChange={(event) =>
                        onFormChange({
                          ...companyForm,
                          country: event.target.value,
                        })
                      }
                      placeholder="United Kingdom"
                    />
                  </div>

                  <div>
                    <label
                      className="field-label"
                      htmlFor="region"
                    >
                      Region
                    </label>
                    <input
                      id="region"
                      className="field"
                      value={companyForm.region}
                      onChange={(event) =>
                        onFormChange({
                          ...companyForm,
                          region: event.target.value,
                        })
                      }
                      placeholder="Greater London"
                    />
                  </div>

                  <div>
                    <label
                      className="field-label"
                      htmlFor="city"
                    >
                      City
                    </label>
                    <input
                      id="city"
                      className="field"
                      value={companyForm.city}
                      onChange={(event) =>
                        onFormChange({
                          ...companyForm,
                          city: event.target.value,
                        })
                      }
                      placeholder="London"
                    />
                  </div>
                </div>
              </section>
            )}

            {wizardStep === 4 && (
              <section className="wizard-step">
                <div className="panel-heading">
                  <span className="panel-icon emerald">£</span>
                  <div>
                    <h2>Business model and budget</h2>
                    <p>
                      Give GrowthOS the commercial constraints it
                      should consider.
                    </p>
                  </div>
                </div>

                <label
                  className="field-label"
                  htmlFor="business-model"
                >
                  Business model *
                </label>
                <select
                  id="business-model"
                  className="field"
                  autoFocus
                  required
                  value={companyForm.business_model}
                  onChange={(event) =>
                    onFormChange({
                      ...companyForm,
                      business_model: event.target.value,
                    })
                  }
                >
                  <option value="">
                    Select a business model
                  </option>
                  <option value="B2B subscription">
                    B2B subscription
                  </option>
                  <option value="B2C subscription">
                    B2C subscription
                  </option>
                  <option value="Marketplace">
                    Marketplace
                  </option>
                  <option value="One-time purchase">
                    One-time purchase
                  </option>
                  <option value="Service or consultancy">
                    Service or consultancy
                  </option>
                  <option value="Usage-based">
                    Usage-based
                  </option>
                  <option value="Advertising">
                    Advertising
                  </option>
                  <option value="Licensing">
                    Licensing
                  </option>
                  <option value="Non-profit or grant funded">
                    Non-profit or grant funded
                  </option>
                  <option value="Other">Other</option>
                </select>

                <div className="budget-grid">
                  <div>
                    <label
                      className="field-label"
                      htmlFor="launch-budget"
                    >
                      Available launch budget
                    </label>
                    <input
                      id="launch-budget"
                      className="field"
                      type="number"
                      min="0"
                      step="0.01"
                      value={companyForm.launch_budget}
                      onChange={(event) =>
                        onFormChange({
                          ...companyForm,
                          launch_budget:
                            event.target.value,
                        })
                      }
                      placeholder="10000"
                    />
                  </div>

                  <div>
                    <label
                      className="field-label"
                      htmlFor="currency"
                    >
                      Currency *
                    </label>
                    <select
                      id="currency"
                      className="field"
                      value={companyForm.budget_currency}
                      onChange={(event) =>
                        onFormChange({
                          ...companyForm,
                          budget_currency:
                            event.target.value,
                        })
                      }
                    >
                      <option value="GBP">GBP</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="AED">AED</option>
                      <option value="BRL">BRL</option>
                      <option value="CAD">CAD</option>
                      <option value="AUD">AUD</option>
                    </select>
                  </div>
                </div>
              </section>
            )}

            {wizardStep === 5 && (
              <section className="wizard-step">
                <div className="panel-heading">
                  <span className="panel-icon violet">↗</span>
                  <div>
                    <h2>Offer, brand, and primary goal</h2>
                    <p>
                      Finish the strategic profile GrowthOS will
                      use throughout the platform.
                    </p>
                  </div>
                </div>

                <label
                  className="field-label"
                  htmlFor="product-description"
                >
                  Product or service description *
                </label>
                <textarea
                  id="product-description"
                  className="field textarea"
                  autoFocus
                  required
                  minLength={10}
                  rows={5}
                  value={companyForm.product_description}
                  onChange={(event) =>
                    onFormChange({
                      ...companyForm,
                      product_description:
                        event.target.value,
                    })
                  }
                  placeholder="Describe what customers receive and the main value provided."
                />

                <div className="form-grid">
                  <div>
                    <label
                      className="field-label"
                      htmlFor="brand-tone"
                    >
                      Brand tone *
                    </label>
                    <input
                      id="brand-tone"
                      className="field"
                      required
                      value={companyForm.brand_tone}
                      onChange={(event) =>
                        onFormChange({
                          ...companyForm,
                          brand_tone: event.target.value,
                        })
                      }
                      placeholder="Professional, inclusive, approachable"
                    />
                  </div>

                  <div>
                    <label
                      className="field-label"
                      htmlFor="primary-goal"
                    >
                      Primary goal *
                    </label>
                    <input
                      id="primary-goal"
                      className="field"
                      required
                      value={companyForm.primary_goal}
                      onChange={(event) =>
                        onFormChange({
                          ...companyForm,
                          primary_goal: event.target.value,
                        })
                      }
                      placeholder="Validate the market and launch a pilot"
                    />
                  </div>
                </div>
              </section>
            )}

            {wizardStep === 6 && (
              <section className="wizard-step">
                <div className="panel-heading">
                  <span className="panel-icon emerald">✓</span>
                  <div>
                    <h2>Review your workspace</h2>
                    <p>
                      Confirm the information before GrowthOS
                      creates the business foundation.
                    </p>
                  </div>
                </div>

                <div className="workspace-review">
                  <article>
                    <small>Business</small>
                    <strong>{companyForm.name}</strong>
                    <p>
                      {companyForm.industry} ·{" "}
                      {companyForm.development_stage.replace(
                        "_",
                        " ",
                      )}
                    </p>
                  </article>

                  <article>
                    <small>Location</small>
                    <strong>
                      {locationSummary || "Not specified"}
                    </strong>
                    <p>{companyForm.target_audience}</p>
                  </article>

                  <article>
                    <small>Business idea</small>
                    <strong>
                      {companyForm.business_idea}
                    </strong>
                    <p>{companyForm.problem_statement}</p>
                  </article>

                  <article>
                    <small>Solution</small>
                    <strong>
                      {companyForm.proposed_solution}
                    </strong>
                    <p>
                      {companyForm.product_description}
                    </p>
                  </article>

                  <article>
                    <small>Commercial model</small>
                    <strong>
                      {companyForm.business_model}
                    </strong>
                    <p>
                      Budget:{" "}
                      {companyForm.launch_budget
                        ? `${companyForm.budget_currency} ${companyForm.launch_budget}`
                        : "Not specified"}
                    </p>
                  </article>

                  <article>
                    <small>Primary goal</small>
                    <strong>
                      {companyForm.primary_goal}
                    </strong>
                    <p>
                      Brand tone: {companyForm.brand_tone}
                    </p>
                  </article>
                </div>
              </section>
            )}
          </div>

          <footer className="wizard-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={previousStep}
              disabled={wizardStep === 0}
            >
              ← Back
            </button>

            <span>
              Your existing Knowledge, Assistant, and Marketing
              tools will use this workspace.
            </span>

            {wizardStep < finalStep ? (
              <button
                className="primary-button"
                type="button"
                onClick={nextStep}
                disabled={!canContinue()}
              >
                Continue →
              </button>
            ) : (
              <button
                className="primary-button emerald-button"
                type="submit"
                disabled={creatingCompany}
              >
                {creatingCompany
                  ? "Creating workspace..."
                  : "Create business workspace"}
              </button>
            )}
          </footer>
        </form>

        <aside className="panel workspace-directory">
          <div className="panel-heading">
            <span className="panel-icon cyan">▦</span>
            <div>
              <h2>Workspace directory</h2>
              <p>
                {companies.length} business workspace(s)
                available.
              </p>
            </div>
          </div>

          <div className="company-list">
            {companies.length === 0 && (
              <div className="empty-library">
                Create your first business workspace using the
                guided wizard.
              </div>
            )}

            {companies.map((company) => {
              const location = [
                company.city,
                company.region,
                company.country,
              ]
                .filter(Boolean)
                .join(", ");

              return (
                <button
                  key={company.id}
                  type="button"
                  className={cx(
                    "company-item workspace-item",
                    company.id === selectedCompanyId &&
                      "active",
                  )}
                  onClick={() =>
                    onSelectCompany(company.id)
                  }
                >
                  <span>
                    {company.name
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <div>
                    <strong>{company.name}</strong>
                    <small>
                      {company.industry}
                      {location ? ` · ${location}` : ""}
                    </small>
                    <em>
                      {company.primary_goal ??
                        "Legacy workspace — profile can be expanded later"}
                    </em>
                  </div>
                  <i>
                    {company.id === selectedCompanyId
                      ? "✓"
                      : "→"}
                  </i>
                </button>
              );
            })}
          </div>
        </aside>
      </section>
    </>
  );
}

export default function Home() {
  const [view, setView] =
    useState<View>("overview");
  const [mobileNav, setMobileNav] =
    useState(false);
  const [navigationCollapsed, setNavigationCollapsed] =
    useState(false);
  const [theme, setTheme] =
    useState<ThemePreference>("dark");
  const [now, setNow] = useState(() => new Date());
  const [userLocation, setUserLocation] =
    useState<UserLocation | null>(null);
  const [locationPromptOpen, setLocationPromptOpen] =
    useState(false);
  const [manualLocation, setManualLocation] =
    useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const [profile, setProfile] = useState<GrowthOSProfile>(defaultProfile);

  const [companies, setCompanies] =
    useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] =
    useState<number | null>(null);

  const [documents, setDocuments] =
    useState<DocumentRecord[]>([]);
  const [activeDocumentId, setActiveDocumentId] =
    useState<number | null>(null);
  const [useAllDocuments, setUseAllDocuments] =
    useState(false);

  const [companyForm, setCompanyForm] =
    useState<CompanyForm>(emptyCompany);
  const [workspaceWizardStep, setWorkspaceWizardStep] =
    useState(0);
  const [marketingForm, setMarketingForm] =
    useState<MarketingForm>(emptyMarketing);
  const [selectedFile, setSelectedFile] =
    useState<File | null>(null);
  const [question, setQuestion] = useState("");

  const [answer, setAnswer] =
    useState<GroundedAnswer | null>(null);
  const [campaign, setCampaign] =
    useState<MarketingCampaign | null>(null);
  const [businessPlan, setBusinessPlan] =
    useState<BusinessPlan | null>(null);

  const [loadingCompanies, setLoadingCompanies] =
    useState(true);
  const [startupFailed, setStartupFailed] =
    useState(false);
  const [startupAttempt, setStartupAttempt] =
    useState(0);
  const [loadingDocuments, setLoadingDocuments] =
    useState(false);
  const [creatingCompany, setCreatingCompany] =
    useState(false);
  const [uploadingDocument, setUploadingDocument] =
    useState(false);
  const [askingQuestion, setAskingQuestion] =
    useState(false);
  const [generatingCampaign, setGeneratingCampaign] =
    useState(false);
  const [
    generatingBusinessPlan,
    setGeneratingBusinessPlan,
  ] = useState(false);
  const [loadingBusinessPlan, setLoadingBusinessPlan] =
    useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uiStateRestored, setUiStateRestored] =
    useState(false);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("growthos-theme") as ThemePreference | null;
    const preferredTheme: ThemePreference = storedTheme === "light" ? "light" : "dark";
    setTheme(preferredTheme);

    const loadedProfile = readProfile();
    setProfile(loadedProfile);
    document.documentElement.dataset.accent = loadedProfile.accent;

    const storedLocation = window.localStorage.getItem("growthos-location");
    if (storedLocation) {
      try {
        setUserLocation(JSON.parse(storedLocation) as UserLocation);
      } catch {
        window.localStorage.removeItem("growthos-location");
      }
    }

    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  }, [theme]);

  function applyTheme(nextTheme: ThemePreference, persist = true) {
    setTheme(nextTheme);
    if (persist) {
      window.localStorage.setItem("growthos-theme", nextTheme);
    }
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      setError("Location is not supported by this browser. You can continue without it.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        const location = {
          label: "Approximate location enabled",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
        setUserLocation(location);
        window.localStorage.setItem("growthos-location", JSON.stringify(location));
        setLocationPromptOpen(false);
        setMessage("Location preference saved. GrowthOS will ask before using it in research.");
      },
      () => setError("Location permission was not granted. GrowthOS will ask for location only when it matters."),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 86_400_000 },
    );
  }

  useEffect(() => {
    const allowedViews: View[] = [
      "overview", "knowledge", "assistant", "marketing", "companies",
      "plan", "cofounder", "decisions", "research", "memory", "spaces", "settings",
    ];
    const hasLaunched = readStoredBoolean(
      uiStorageKeys.firstLaunchComplete,
      false,
    );
    const savedView = readStoredString(uiStorageKeys.activeView) as View | null;
    setView(
      hasLaunched && savedView && allowedViews.includes(savedView)
        ? savedView
        : "overview",
    );
    writeStoredBoolean(uiStorageKeys.firstLaunchComplete, true);

    setSelectedCompanyId(
      readStoredNumber(
        uiStorageKeys.activeWorkspace,
      ),
    );

    setActiveDocumentId(
      readStoredNumber(
        uiStorageKeys.activeDocument,
      ),
    );

    setUseAllDocuments(
      readStoredBoolean(
        uiStorageKeys.useAllDocuments,
        false,
      ),
    );

    setUiStateRestored(true);
  }, []);

  useEffect(() => {
    if (!uiStateRestored) {
      return;
    }

    writeStoredString(
      uiStorageKeys.activeView,
      view,
    );
  }, [uiStateRestored, view]);

  useEffect(() => {
    if (!uiStateRestored) {
      return;
    }

    writeStoredNumber(
      uiStorageKeys.activeWorkspace,
      selectedCompanyId,
    );
  }, [selectedCompanyId, uiStateRestored]);

  useEffect(() => {
    if (!uiStateRestored) {
      return;
    }

    writeStoredNumber(
      uiStorageKeys.activeDocument,
      activeDocumentId,
    );
  }, [activeDocumentId, uiStateRestored]);

  useEffect(() => {
    if (!uiStateRestored) {
      return;
    }

    writeStoredBoolean(
      uiStorageKeys.useAllDocuments,
      useAllDocuments,
    );
  }, [uiStateRestored, useAllDocuments]);

  useEffect(() => {
    if (!uiStateRestored) {
      return;
    }

    const scrollKey =
      uiStorageKeys.scrollPosition(view);

    const savedPosition =
      readStoredNumber(scrollKey) ?? 0;

    const restoreFrame =
      window.requestAnimationFrame(() => {
        window.scrollTo({
          top: savedPosition,
          behavior: "auto",
        });
      });

    return () => {
      window.cancelAnimationFrame(
        restoreFrame,
      );

      writeStoredNumber(
        scrollKey,
        window.scrollY,
      );
    };
  }, [uiStateRestored, view]);

  useEffect(() => {
    let cancelled = false;

    async function loadCompanies() {
      setLoadingCompanies(true);
      setStartupFailed(false);

      let lastError: unknown = null;

      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const data = await getCompanies();

          if (cancelled) {
            return;
          }

          setCompanies(data);

          if (data.length > 0) {
            setSelectedCompanyId((current) => {
              if (
                current !== null &&
                data.some(
                  (company) =>
                    company.id === current,
                )
              ) {
                return current;
              }

              return data[0].id;
            });
          } else {
            setSelectedCompanyId(null);
          }

          setLoadingCompanies(false);
          setStartupFailed(false);
          return;
        } catch (requestError) {
          lastError = requestError;

          if (attempt < 3) {
            await new Promise<void>((resolve) => {
              window.setTimeout(
                resolve,
                500 * (attempt + 1),
              );
            });
          }
        }
      }

      if (cancelled) {
        return;
      }

      setLoadingCompanies(false);
      setStartupFailed(true);

      setError(
        lastError instanceof Error
          ? lastError.message
          : "Companies could not be loaded.",
      );
    }

    void loadCompanies();

    return () => {
      cancelled = true;
    };
  }, [startupAttempt]);

  useEffect(() => {
    async function loadDocuments() {
      if (selectedCompanyId === null) {
        setDocuments([]);
        setActiveDocumentId(null);
        return;
      }

      setLoadingDocuments(true);

      try {
        const data = await getDocuments(
          selectedCompanyId,
        );

        setDocuments(data);

        const readyDocuments = data.filter(
          (document) =>
            document.processing_status === "processed",
        );

        setActiveDocumentId((current) => {
          if (
            current !== null &&
            readyDocuments.some(
              (document) => document.id === current,
            )
          ) {
            return current;
          }

          return readyDocuments[0]?.id ?? null;
        });
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Documents could not be loaded.",
        );
      } finally {
        setLoadingDocuments(false);
      }
    }

    void loadDocuments();
  }, [selectedCompanyId]);

  const selectedCompany = useMemo(
    () =>
      companies.find(
        (company) =>
          company.id === selectedCompanyId,
      ) ?? null,
    [companies, selectedCompanyId],
  );

  const activeDocument = useMemo(
    () =>
      documents.find(
        (document) =>
          document.id === activeDocumentId,
      ) ?? null,
    [documents, activeDocumentId],
  );

  function clearFeedback() {
    setMessage("");
    setError("");
  }

  function openView(nextView: View) {
    setView(nextView);
    setMobileNav(false);
    setGuideOpen(false);
    clearFeedback();

    if (
      nextView === "plan" &&
      selectedCompanyId !== null
    ) {
      void loadBusinessPlan(selectedCompanyId);
    }
  }

  function selectDocument(documentId: number) {
    setActiveDocumentId(documentId);
    setUseAllDocuments(false);
    setAnswer(null);
    setCampaign(null);
  }

  function openAssistantForDocument(
    document: DocumentRecord,
  ) {
    selectDocument(document.id);
    setQuestion(
      `What professional experience is described in ${document.original_filename}?`,
    );
    setView("assistant");
  }

  function openMarketingForDocument(
    document: DocumentRecord,
  ) {
    selectDocument(document.id);
    setMarketingForm({
      ...emptyMarketing,
      campaign_brief:
        `Create a professional LinkedIn post based on ${document.original_filename}.`,
    });
    setView("marketing");
  }


async function loadBusinessPlan(
  companyId: number,
) {
  setLoadingBusinessPlan(true);

  try {
    const savedPlan = await getBusinessPlan(companyId);
    setBusinessPlan(savedPlan);
  } catch (requestError) {
    setError(
      requestError instanceof Error
        ? requestError.message
        : "The business plan could not be loaded.",
    );
  } finally {
    setLoadingBusinessPlan(false);
  }
}


async function handleGenerateBusinessPlan(
  companyIdOverride?: number,
) {
  const companyId =
    companyIdOverride ?? selectedCompanyId;

  if (companyId === null) {
    setError("Select a business workspace first.");
    return;
  }

  setGeneratingBusinessPlan(true);
  setBusinessPlan(null);
  clearFeedback();

  try {
    const generatedPlan =
      await generateBusinessPlan(companyId);

    setBusinessPlan(generatedPlan);
    setMessage(
      `The business plan for "${generatedPlan.company_name}" is ready.`,
    );
    setView("plan");
  } catch (requestError) {
    setError(
      requestError instanceof Error
        ? requestError.message
        : "The business plan could not be generated.",
    );
  } finally {
    setGeneratingBusinessPlan(false);
  }
}


  async function handleCreateCompany(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setCreatingCompany(true);
    clearFeedback();

    try {
      const parsedBudget =
        companyForm.launch_budget.trim() === ""
          ? null
          : Number(companyForm.launch_budget);

      const company = await createCompany({
        name: companyForm.name.trim(),
        website:
          companyForm.website.trim() || null,
        industry: companyForm.industry.trim(),
        target_audience:
          companyForm.target_audience.trim(),
        brand_tone: companyForm.brand_tone.trim(),
        product_description:
          companyForm.product_description.trim(),
        business_idea:
          companyForm.business_idea.trim() || null,
        problem_statement:
          companyForm.problem_statement.trim() || null,
        proposed_solution:
          companyForm.proposed_solution.trim() || null,
        country:
          companyForm.country.trim() || null,
        region:
          companyForm.region.trim() || null,
        city:
          companyForm.city.trim() || null,
        business_model:
          companyForm.business_model.trim() || null,
        launch_budget:
          parsedBudget !== null &&
          Number.isFinite(parsedBudget)
            ? parsedBudget
            : null,
        budget_currency:
          companyForm.budget_currency.trim() || null,
        primary_goal:
          companyForm.primary_goal.trim() || null,
        development_stage:
          companyForm.development_stage,
      });

      setCompanies((current) => [
        company,
        ...current,
      ]);
      setSelectedCompanyId(company.id);
      setCompanyForm(emptyCompany);
      setWorkspaceWizardStep(0);
      setMessage(
        `Business workspace "${company.name}" was created. Generating the first plan...`,
      );
      setView("plan");
      await handleGenerateBusinessPlan(company.id);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Business workspace could not be created.",
      );
    } finally {
      setCreatingCompany(false);
    }
  }

  async function handleUpload(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (selectedCompanyId === null) {
      setError(
        "Create or select a company first.",
      );
      return;
    }

    if (!selectedFile) {
      setError("Choose a business asset first.");
      return;
    }

    setUploadingDocument(true);
    clearFeedback();

    try {
      const uploaded = await uploadDocument(
        selectedCompanyId,
        selectedFile,
      );

      setMessage(
        `Uploaded ${uploaded.original_filename}. Processing...`,
      );

      const processed = await processDocument(
        uploaded.id,
      );

      const refreshed = await getDocuments(
        selectedCompanyId,
      );

      setDocuments(refreshed);
      setActiveDocumentId(processed.id);
      setUseAllDocuments(false);
      setSelectedFile(null);
      setMessage(
        `${processed.original_filename} is active and ready for AI.`,
      );

      const input = document.getElementById(
        "document-file",
      ) as HTMLInputElement | null;

      if (input) {
        input.value = "";
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Document could not be uploaded.",
      );
    } finally {
      setUploadingDocument(false);
    }
  }

  async function handleQuestion(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (selectedCompanyId === null) {
      setError(
        "Create or select a company first.",
      );
      return;
    }

    if (
      !useAllDocuments &&
      activeDocumentId === null
    ) {
      setError(
        "Select a processed document first.",
      );
      return;
    }

    if (question.trim().length < 3) {
      setError("Enter a longer question.");
      return;
    }

    setAskingQuestion(true);
    setAnswer(null);
    clearFeedback();

    try {
      let streamedAnswer = "";

      await streamGroundedQuestion(
        selectedCompanyId,
        question.trim(),
        useAllDocuments
          ? null
          : activeDocumentId,
        (event) => {
          if (event.type === "metadata") {
            setAnswer({
              company_id: event.company_id,
              document_id: event.document_id,
              document_name: event.document_name,
              question: event.question,
              answer: "",
              model: event.model,
              source_count: event.source_count,
              sources: event.sources,
            });
            return;
          }

          if (event.type === "token") {
            streamedAnswer += event.content;
            setAnswer((current) =>
              current
                ? { ...current, answer: streamedAnswer }
                : current,
            );
            return;
          }

          if (event.type === "error") {
            throw new Error(event.message);
          }
        },
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The question could not be answered.",
      );
    } finally {
      setAskingQuestion(false);
    }
  }

  async function handleCampaign(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (selectedCompanyId === null) {
      setError(
        "Create or select a company first.",
      );
      return;
    }

    if (
      !useAllDocuments &&
      activeDocumentId === null
    ) {
      setError(
        "Select a processed document first.",
      );
      return;
    }

    if (
      marketingForm.campaign_brief
        .trim()
        .length < 5
    ) {
      setError(
        "Enter a longer campaign brief.",
      );
      return;
    }

    setGeneratingCampaign(true);
    setCampaign(null);
    clearFeedback();

    try {
      const result =
        await generateMarketingCampaign({
          company_id: selectedCompanyId,
          document_id: useAllDocuments
            ? null
            : activeDocumentId,
          platform: marketingForm.platform,
          objective: marketingForm.objective,
          campaign_brief:
            marketingForm.campaign_brief.trim(),
          target_audience:
            marketingForm.target_audience.trim() ||
            null,
          tone:
            marketingForm.tone.trim() || null,
          number_of_variants: 1,
          retrieval_limit: 3,
          minimum_score: 0.2,
        });

      setCampaign(result);
      setMessage("Your campaign is ready.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The campaign could not be generated.",
      );
    } finally {
      setGeneratingCampaign(false);
    }
  }

  let activeView;

  if (view === "knowledge") {
    activeView = (
      <KnowledgeView
        selectedCompanyId={selectedCompanyId}
        documents={documents}
        activeDocumentId={activeDocumentId}
        selectedFile={selectedFile}
        uploadingDocument={uploadingDocument}
        onFileChange={setSelectedFile}
        onUpload={handleUpload}
        onSelectDocument={selectDocument}
        onAskDocument={openAssistantForDocument}
        onMarketingDocument={
          openMarketingForDocument
        }
        onDocumentsChanged={setDocuments}
        onError={setError}
      />
    );
  } else if (view === "assistant") {
    activeView = (
      <AssistantView
        documents={documents}
        activeDocumentId={activeDocumentId}
        useAllDocuments={useAllDocuments}
        question={question}
        askingQuestion={askingQuestion}
        answer={answer}
        onQuestionChange={setQuestion}
        onSubmit={handleQuestion}
        onDocumentChange={setActiveDocumentId}
        onScopeChange={setUseAllDocuments}
      />
    );
  } else if (view === "cofounder") {
    // The Executive Team is mounted persistently below so an active
    // generation keeps running when the user visits another workspace view.
    activeView = null;
  } else if (view === "decisions") {
    activeView = (
      <DecisionPanel
        company={selectedCompany}
        onError={(feedback) => {
          setMessage("");
          setError(feedback);
        }}
        onSuccess={(feedback) => {
          setError("");
          setMessage(feedback);
        }}
      />
    );
  } else if (view === "memory") {
    activeView = (
      <ExecutiveMemoryPanel
        company={selectedCompany}
        onError={(feedback) => {
          setMessage("");
          setError(feedback);
        }}
        onSuccess={(feedback) => {
          setError("");
          setMessage(feedback);
        }}
      />
    );
  } else if (view === "spaces") {
    activeView = (
      <KnowledgeSpacesPanel
        company={selectedCompany}
        onError={(feedback) => { setMessage(""); setError(feedback); }}
        onSuccess={(feedback) => { setError(""); setMessage(feedback); }}
      />
    );
  } else if (view === "settings") {
    activeView = (
      <SettingsPanel
        theme={theme}
        profile={profile}
        onPreviewAppearance={(nextTheme, accent) => {
          applyTheme(nextTheme, false);
          document.documentElement.dataset.accent = accent;
        }}
        onSave={(savedProfile, savedTheme) => {
          applyTheme(savedTheme, true);
          setProfile(savedProfile);
          document.documentElement.dataset.accent = savedProfile.accent;
        }}
        onSuccess={(feedback) => { setError(""); setMessage(feedback); }}
      />
    );
  } else if (view === "research") {
    activeView = (
      <ResearchEngine
        company={selectedCompany}
        documents={documents}
        onError={(feedback) => {
          setMessage("");
          setError(feedback);
        }}
        onSuccess={(feedback) => {
          setError("");
          setMessage(feedback);
        }}
      />
    );
  } else if (view === "marketing") {
    activeView = (
      <MarketingView
        documents={documents}
        activeDocumentId={activeDocumentId}
        useAllDocuments={useAllDocuments}
        marketingForm={marketingForm}
        generatingCampaign={generatingCampaign}
        campaign={campaign}
        onFormChange={setMarketingForm}
        onSubmit={handleCampaign}
        onDocumentChange={setActiveDocumentId}
        onScopeChange={setUseAllDocuments}
      />
    );
  } else if (view === "plan") {
    activeView = (
      <BusinessPlanView
        selectedCompany={selectedCompany}
        businessPlan={businessPlan}
        generatingBusinessPlan={
          generatingBusinessPlan
        }
        loadingBusinessPlan={loadingBusinessPlan}
        onGenerate={() => {
          void handleGenerateBusinessPlan();
        }}
      />
    );
  } else if (view === "companies") {
    activeView = (
      <CompaniesView
        companies={companies}
        selectedCompanyId={selectedCompanyId}
        companyForm={companyForm}
        creatingCompany={creatingCompany}
        wizardStep={workspaceWizardStep}
        onWizardStepChange={setWorkspaceWizardStep}
        onFormChange={setCompanyForm}
        onSubmit={handleCreateCompany}
        onSelectCompany={(companyId) => {
          setSelectedCompanyId(companyId);
          setBusinessPlan(null);
          setMessage("Active workspace updated.");
        }}
      />
    );
  } else {
    activeView = (
      <IntelligenceDashboard
        company={selectedCompany}
        displayName={profile.name}
        documents={documents}
        activeDocument={activeDocument}
        businessPlan={businessPlan}
        onOpenView={openView}
        onOpenConversation={(conversationId) => {
          if (selectedCompanyId !== null) {
            writeStoredNumber(uiStorageKeys.cofounderConversation(selectedCompanyId), conversationId);
          }
          openView("cofounder");
        }}
        onStartConversation={() => {
          writeStoredBoolean(uiStorageKeys.startNewCofounder, true);
          openView("cofounder");
        }}
        onError={(feedback) => {
          setMessage("");
          setError(feedback);
        }}
      />
    );
  }

  if (!uiStateRestored || loadingCompanies) {
    return (
      <StartupStatus
        failed={false}
        onRetry={() => {
          setStartupAttempt(
            (current) => current + 1,
          );
        }}
      />
    );
  }

  if (startupFailed) {
    return (
      <StartupStatus
        failed
        onRetry={() => {
          clearFeedback();
          setStartupAttempt(
            (current) => current + 1,
          );
        }}
      />
    );
  }

  const locationTimezone = userLocation?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", hour12: false, timeZone: locationTimezone,
  }).format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const localDate = new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "numeric", month: "long", timeZone: locationTimezone,
  }).format(now);
  const localTime = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", timeZone: locationTimezone,
  }).format(now);

  return (
    <main className={cx("app-shell", navigationCollapsed && "navigation-collapsed")}>
      <aside
        className={cx(
          "sidebar",
          mobileNav && "open",
          navigationCollapsed && "collapsed",
        )}
      >
        <div className="brand">
          <span>✦</span>
          <div>
            <strong>GrowthOS AI</strong>
            <small>Company intelligence</small>
          </div>
          <button
            type="button"
            className="desktop-sidebar-toggle"
            onClick={() => setNavigationCollapsed((current) => !current)}
            aria-label={navigationCollapsed ? "Expand main navigation" : "Collapse main navigation"}
            title={navigationCollapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {navigationCollapsed ? "›" : "‹"}
          </button>
          <button
            type="button"
            className="mobile-sidebar-close"
            onClick={() => setMobileNav(false)}
          >
            ×
          </button>
        </div>

        <nav>
          <p>Workspace</p>
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cx(
                view === item.id && "active",
              )}
              onClick={() => openView(item.id)}
              aria-label={item.label}
              data-tooltip={item.label}
            >
              <span>{item.icon}</span>
              <strong>{item.label}</strong>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div>
            <span>◎</span>
            <p>
              <strong>Local AI active</strong>
              <small>Ollama · Qwen 3</small>
            </p>
            <i />
          </div>
          <small>
            Private local inference. No paid API required.
          </small>
        </div>
      </aside>

      {mobileNav && (
        <button
          className="nav-overlay"
          type="button"
          onClick={() => setMobileNav(false)}
        />
      )}

      <section className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="menu-button"
              type="button"
              onClick={() => {
                if (window.matchMedia("(max-width: 760px)").matches) {
                  setMobileNav(true);
                } else {
                  setNavigationCollapsed((current) => !current);
                }
              }}
              aria-label="Toggle navigation"
            >
              ☰
            </button>
            <div>
              <small>GrowthOS AI</small>
              <strong>
                {
                  navItems.find(
                    (item) => item.id === view,
                  )?.label
                }
              </strong>
            </div>
          </div>

          <div className="topbar-right">
            <div className="topbar-context" aria-label="Local date and time">
              <strong>{localTime}</strong>
              <small>{localDate}{userLocation ? ` · ${userLocation.label}` : ""}</small>
            </div>
            <button
              type="button"
              className="location-button"
              onClick={() => setLocationPromptOpen((current) => !current)}
              title="Location preferences"
            >
              ◎
            </button>
            <select
              className="theme-select"
              aria-label="Appearance"
              value={theme}
              onChange={(event) => applyTheme(event.target.value as ThemePreference, true)}
            >
              <option value="dark">Dark theme</option>
              <option value="light">Light theme</option>
            </select>
            <label>
              <span>Active workspace</span>
              <select
                id="active-workspace"
                name="active-workspace"
                value={selectedCompanyId ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedCompanyId(
                    value ? Number(value) : null,
                  );
                  setAnswer(null);
                  setCampaign(null);
                  setBusinessPlan(null);
                  clearFeedback();
                }}
                disabled={loadingCompanies}
              >
                <option value="">
                  {loadingCompanies
                    ? "Loading..."
                    : "Select workspace"}
                </option>
                {companies.map((company) => (
                  <option
                    key={company.id}
                    value={company.id}
                  >
                    {company.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="topbar-help-button"
              onClick={() => setGuideOpen((current) => !current)}
              aria-expanded={guideOpen}
              aria-label="Open GrowthOS Guide"
              title="GrowthOS Guide"
            >
              ?
            </button>
            <button type="button" className="avatar profile-avatar-button" onClick={() => openView("settings")} title="Open settings">
              {profile.avatarDataUrl ? <img src={profile.avatarDataUrl} alt={profile.name} /> : (profile.name || "Founder").slice(0, 2).toUpperCase()}
            </button>
          </div>
        </header>

        {locationPromptOpen && (
          <section className="location-popover" role="dialog" aria-label="Location preferences">
            <div>
              <span>◎</span>
              <div>
                <strong>Personalise with your location</strong>
                <p>GrowthOS stores only a city-level preference and asks before using it in research.</p>
              </div>
            </div>
            {userLocation ? (
              <div className="location-confirmed">
                <span>{userLocation.label}</span>
                <button type="button" onClick={() => {
                  setUserLocation(null);
                  window.localStorage.removeItem("growthos-location");
                }}>Remove</button>
              </div>
            ) : (
              <>
                <div className="location-actions">
                  <button type="button" className="primary-button" onClick={requestLocation}>Use approximate location</button>
                  <button type="button" className="secondary-button" onClick={() => setLocationPromptOpen(false)}>Not now</button>
                </div>
                <div className="manual-location-row">
                  <input
                    value={manualLocation}
                    onChange={(event) => setManualLocation(event.target.value)}
                    placeholder="Or enter a city, e.g. London, United Kingdom"
                  />
                  <button type="button" disabled={!manualLocation.trim()} onClick={() => {
                    const location = {
                      label: manualLocation.trim(),
                      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    };
                    setUserLocation(location);
                    window.localStorage.setItem("growthos-location", JSON.stringify(location));
                    setManualLocation("");
                    setLocationPromptOpen(false);
                    setMessage("Location preference saved.");
                  }}>Save</button>
                </div>
              </>
            )}
          </section>
        )}

        <div className="workspace">
          {(message || error) && (
            <Toast
              kind={error ? "error" : "success"}
              message={error || message}
              onClose={clearFeedback}
            />
          )}

          {loadingDocuments &&
            selectedCompanyId !== null && (
              <div className="loading-documents">
                Loading company documents...
              </div>
            )}

          <div
            className="cofounder-view-host"
            hidden={view !== "cofounder"}
            aria-hidden={view !== "cofounder"}
          >
            <CofounderChat
              company={selectedCompany}
              documents={documents}
              activeDocumentId={activeDocumentId}
              useAllDocuments={useAllDocuments}
              onDocumentChange={setActiveDocumentId}
              onScopeChange={setUseAllDocuments}
              onDocumentReady={(document) => {
                setDocuments((current) => [
                  document,
                  ...current.filter(
                    (item) => item.id !== document.id,
                  ),
                ]);
                setActiveDocumentId(document.id);
              }}
              onError={(feedback) => {
                setMessage("");
                setError(feedback);
              }}
              onSuccess={(feedback) => {
                setError("");
                setMessage(feedback);
              }}
            />
          </div>

          {view !== "cofounder" && activeView}
        </div>

        <aside className={cx("growthos-guide", view === "cofounder" && "cofounder-guide", guideOpen && "open")}>
          {guideOpen && (
            <div className="growthos-guide-panel">
              <header><span>✦</span><div><strong>GrowthOS Guide</strong><small>Here when you need direction</small></div></header>
              <p>Not sure where to begin? Choose the outcome you want.</p>
              <button type="button" onClick={() => { writeStoredBoolean(uiStorageKeys.startNewCofounder, true); openView("cofounder"); setGuideOpen(false); }}>Start an executive conversation</button>
              <button type="button" onClick={() => { openView("cofounder"); setGuideOpen(false); }}>Explore an idea with Research</button>
              <button type="button" onClick={() => { openView("knowledge"); setGuideOpen(false); }}>Analyse documents</button>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
