"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  askGroundedQuestion,
  createCompany,
  generateMarketingCampaign,
  getCompanies,
  processDocument,
  uploadDocument,
  type AnswerSource,
  type Company,
  type GroundedAnswer,
  type MarketingCampaign,
  type MarketingObjective,
  type MarketingPlatform,
} from "@/lib/api";

type View = "overview" | "knowledge" | "assistant" | "marketing" | "companies";

const emptyCompany = {
  name: "",
  website: "",
  industry: "",
  target_audience: "",
  brand_tone: "",
  product_description: "",
};

const emptyMarketing = {
  platform: "linkedin" as MarketingPlatform,
  objective: "lead_generation" as MarketingObjective,
  campaign_brief: "",
  target_audience: "",
  tone: "",
  number_of_variants: 1,
};

const navItems: Array<{ id: View; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "◫" },
  { id: "knowledge", label: "Knowledge", icon: "▤" },
  { id: "assistant", label: "AI Assistant", icon: "✦" },
  { id: "marketing", label: "Marketing Studio", icon: "◈" },
  { id: "companies", label: "Companies", icon: "▦" },
];

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [companyForm, setCompanyForm] = useState(emptyCompany);
  const [marketingForm, setMarketingForm] = useState(emptyMarketing);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<GroundedAnswer | null>(null);
  const [campaign, setCampaign] = useState<MarketingCampaign | null>(null);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [askingQuestion, setAskingQuestion] = useState(false);
  const [generatingCampaign, setGeneratingCampaign] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadCompanies() {
      try {
        const data = await getCompanies();
        setCompanies(data);
        if (data.length > 0) {
          setSelectedCompanyId((current) => current ?? data[0].id);
        }
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Companies could not be loaded.",
        );
      } finally {
        setLoadingCompanies(false);
      }
    }

    void loadCompanies();
  }, []);

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId],
  );

  function clearFeedback() {
    setMessage("");
    setError("");
  }

  function openView(nextView: View) {
    setView(nextView);
    setMobileNav(false);
    clearFeedback();
  }

  async function handleCreateCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingCompany(true);
    clearFeedback();

    try {
      const company = await createCompany({
        name: companyForm.name,
        website: companyForm.website.trim() || null,
        industry: companyForm.industry,
        target_audience: companyForm.target_audience,
        brand_tone: companyForm.brand_tone,
        product_description: companyForm.product_description,
      });

      setCompanies((current) => [company, ...current]);
      setSelectedCompanyId(company.id);
      setCompanyForm(emptyCompany);
      setMessage(`Company "${company.name}" was created.`);
      setView("overview");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Company could not be created.",
      );
    } finally {
      setCreatingCompany(false);
    }
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedCompanyId === null) {
      setError("Create or select a company first.");
      return;
    }

    if (!selectedFile) {
      setError("Choose a PDF first.");
      return;
    }

    setUploadingDocument(true);
    clearFeedback();

    try {
      const uploaded = await uploadDocument(selectedCompanyId, selectedFile);
      setMessage(`Uploaded ${uploaded.original_filename}. Processing...`);
      const processed = await processDocument(uploaded.id);
      setMessage(`${processed.original_filename} is ready for AI.`);
      setSelectedFile(null);

      const input = document.getElementById("document-file") as HTMLInputElement | null;
      if (input) input.value = "";
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

  async function handleQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedCompanyId === null) {
      setError("Create or select a company first.");
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
      setAnswer(await askGroundedQuestion(selectedCompanyId, question.trim()));
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

  async function handleCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedCompanyId === null) {
      setError("Create or select a company first.");
      return;
    }

    if (marketingForm.campaign_brief.trim().length < 5) {
      setError("Enter a longer campaign brief.");
      return;
    }

    setGeneratingCampaign(true);
    setCampaign(null);
    clearFeedback();

    try {
      const result = await generateMarketingCampaign({
        company_id: selectedCompanyId,
        platform: marketingForm.platform,
        objective: marketingForm.objective,
        campaign_brief: marketingForm.campaign_brief.trim(),
        target_audience: marketingForm.target_audience.trim() || null,
        tone: marketingForm.tone.trim() || null,
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

  function Overview() {
    return (
      <>
        <PageHeading
          eyebrow="Workspace overview"
          title={selectedCompany ? `Welcome to ${selectedCompany.name}` : "Welcome to GrowthOS AI"}
          description="Turn company documents into grounded knowledge and evidence-based marketing content."
        />

        <section className="stat-grid">
          <article className="stat-card">
            <span className="stat-icon cyan">▦</span>
            <div>
              <small>Knowledge base</small>
              <strong>{selectedCompany ? "Ready" : "Not selected"}</strong>
              <p>{selectedCompany ? selectedCompany.industry : "Choose a company workspace."}</p>
            </div>
          </article>
          <article className="stat-card">
            <span className="stat-icon violet">✦</span>
            <div><small>Local AI</small><strong>Ollama</strong><p>Private generation using Qwen 3.</p></div>
          </article>
          <article className="stat-card">
            <span className="stat-icon emerald">✓</span>
            <div><small>Grounded output</small><strong>Citations</strong><p>Answers and campaigns use retrieved evidence.</p></div>
          </article>
        </section>

        <section className="hero-card">
          <div>
            <span className="status-badge"><i /> Local-first AI workspace</span>
            <h2>From company PDFs to useful answers and campaigns.</h2>
            <p>Upload trusted source documents, retrieve the most relevant evidence, and generate outputs grounded in company knowledge.</p>
            <div className="button-row">
              <button className="primary-button" type="button" onClick={() => openView("knowledge")}>Upload knowledge <span>→</span></button>
              <button className="secondary-button" type="button" onClick={() => openView("assistant")}>Ask the assistant</button>
            </div>
          </div>
          <div className="pipeline">
            {["PDF upload", "Text extraction", "Semantic chunking", "Vector retrieval", "Grounded generation"].map((step, index) => (
              <div key={step}><span>{index + 1}</span><p>{step}</p></div>
            ))}
          </div>
        </section>

        <section className="quick-grid">
          {[
            ["knowledge", "▤", "Upload a document", "Add PDF knowledge to the active company."],
            ["assistant", "✦", "Ask a grounded question", "Get an answer with sources and pages."],
            ["marketing", "◈", "Generate a campaign", "Create marketing copy from evidence."],
          ].map(([target, icon, title, description]) => (
            <button key={target} type="button" className="quick-card" onClick={() => openView(target as View)}>
              <span>{icon}</span><div><strong>{title}</strong><p>{description}</p></div><i>→</i>
            </button>
          ))}
        </section>
      </>
    );
  }

  function Knowledge() {
    return (
      <>
        <PageHeading eyebrow="Company knowledge" title="Build the source of truth" description="Upload a PDF. GrowthOS extracts, chunks, embeds, and stores it for retrieval." />
        <section className="split-layout">
          <form className="panel" onSubmit={handleUpload}>
            <div className="panel-heading"><span className="panel-icon cyan">⇧</span><div><h2>Upload document</h2><p>Text-based PDF files up to 10 MB.</p></div></div>
            <label className="upload-zone" htmlFor="document-file">
              <input id="document-file" type="file" accept="application/pdf,.pdf" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} />
              <span>▤</span><strong>{selectedFile ? selectedFile.name : "Choose a PDF document"}</strong><p>{selectedFile ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB selected` : "Click to browse your computer"}</p>
            </label>
            <button className="primary-button full-button" type="submit" disabled={uploadingDocument || selectedCompanyId === null}>
              {uploadingDocument ? "Extracting, chunking, and embedding..." : "Upload and process PDF"}
            </button>
          </form>

          <aside className="panel">
            <div className="panel-heading"><span className="panel-icon violet">◎</span><div><h2>Processing pipeline</h2><p>What happens after your upload.</p></div></div>
            <div className="process-list">
              {[
                ["Validate and store", "The PDF type and size are checked."],
                ["Extract text", "Selectable text is collected page by page."],
                ["Create chunks", "Overlapping passages preserve context."],
                ["Generate embeddings", "Each chunk becomes searchable by meaning."],
                ["Ready for AI", "Evidence can now support generation."],
              ].map(([title, description], index) => (
                <article key={title}><span>{index + 1}</span><div><strong>{title}</strong><p>{description}</p></div></article>
              ))}
            </div>
          </aside>
        </section>
      </>
    );
  }

  function Assistant() {
    return (
      <>
        <PageHeading eyebrow="Grounded assistant" title="Ask your company knowledge" description="GrowthOS retrieves relevant evidence before the local model answers." />
        <section className="assistant-layout">
          <form className="panel" onSubmit={handleQuestion}>
            <div className="panel-heading"><span className="panel-icon violet">✦</span><div><h2>New question</h2><p>Answers are limited to uploaded evidence.</p></div></div>
            <label className="field-label" htmlFor="question">Question</label>
            <textarea id="question" className="field textarea" rows={8} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What products and services does this company provide?" />
            <button className="primary-button full-button" type="submit" disabled={askingQuestion || selectedCompanyId === null}>{askingQuestion ? "Retrieving evidence and generating..." : "Ask GrowthOS"}</button>
            <p className="helper-text">Local generation may take up to one minute on CPU.</p>
          </form>

          <section className="panel result-panel">
            {!answer && !askingQuestion && <div className="empty-state"><span>✦</span><h2>Your grounded answer will appear here</h2><p>Ask a question after uploading at least one processed PDF.</p></div>}
            {askingQuestion && <div className="loading-state"><span>◎</span><h2>Retrieving company evidence</h2><p>The local model is preparing a grounded response.</p><div><i /></div></div>}
            {answer && !askingQuestion && (
              <div className="answer-result">
                <div className="result-meta"><span className="status-badge"><i /> Grounded answer</span><small>{answer.model}</small></div>
                <h2>{answer.question}</h2><div className="answer-copy">{answer.answer}</div>
                <div className="source-heading"><h3>Evidence sources</h3><span>{answer.source_count} retrieved</span></div>
                <div className="source-list">
                  {answer.sources.map((source: AnswerSource) => (
                    <article key={source.source_id}><div><strong>[{source.source_id}] {source.document_name}</strong><span>Page {source.page_number ?? "unknown"}</span></div><p>{source.text}</p><small>Similarity score {source.similarity_score}</small></article>
                  ))}
                </div>
              </div>
            )}
          </section>
        </section>
      </>
    );
  }

  function Marketing() {
    return (
      <>
        <PageHeading eyebrow="Marketing Studio" title="Generate campaigns from verified evidence" description="Choose a platform and objective, then create concise marketing copy grounded in company documents." />
        <section className="assistant-layout">
          <form className="panel stacked-form" onSubmit={handleCampaign}>
            <div className="panel-heading"><span className="panel-icon amber">◈</span><div><h2>Campaign brief</h2><p>One variant is recommended for local models.</p></div></div>
            <div className="form-grid">
              <div><label className="field-label" htmlFor="platform">Platform</label><select id="platform" className="field" value={marketingForm.platform} onChange={(event) => setMarketingForm({ ...marketingForm, platform: event.target.value as MarketingPlatform })}><option value="linkedin">LinkedIn</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="google_ads">Google Ads</option><option value="email">Email campaign</option></select></div>
              <div><label className="field-label" htmlFor="objective">Objective</label><select id="objective" className="field" value={marketingForm.objective} onChange={(event) => setMarketingForm({ ...marketingForm, objective: event.target.value as MarketingObjective })}><option value="brand_awareness">Brand awareness</option><option value="lead_generation">Lead generation</option><option value="product_launch">Product launch</option><option value="sales">Sales</option><option value="engagement">Engagement</option></select></div>
            </div>
            <label className="field-label" htmlFor="brief">Campaign brief</label>
            <textarea id="brief" className="field textarea" rows={7} minLength={5} required value={marketingForm.campaign_brief} onChange={(event) => setMarketingForm({ ...marketingForm, campaign_brief: event.target.value })} placeholder="Promote the company’s main service to small UK businesses." />
            <div className="form-grid">
              <div><label className="field-label" htmlFor="audience-override">Audience override</label><input id="audience-override" className="field" value={marketingForm.target_audience} onChange={(event) => setMarketingForm({ ...marketingForm, target_audience: event.target.value })} placeholder="Optional" /></div>
              <div><label className="field-label" htmlFor="tone">Tone override</label><input id="tone" className="field" value={marketingForm.tone} onChange={(event) => setMarketingForm({ ...marketingForm, tone: event.target.value })} placeholder="Optional" /></div>
            </div>
            <button className="primary-button amber-button full-button" type="submit" disabled={generatingCampaign || selectedCompanyId === null}>{generatingCampaign ? "Generating grounded campaign..." : "Generate campaign"}</button>
          </form>

          <section className="panel result-panel">
            {!campaign && !generatingCampaign && <div className="empty-state amber-empty"><span>◈</span><h2>Your campaign will appear here</h2><p>GrowthOS uses retrieved evidence to avoid unsupported claims.</p></div>}
            {generatingCampaign && <div className="loading-state amber-loading"><span>◈</span><h2>Building your campaign</h2><p>Local structured generation may take up to one minute.</p><div><i /></div></div>}
            {campaign && !generatingCampaign && (
              <div className="campaign-result">
                <div className="result-meta"><span className="status-badge amber-badge"><i /> {campaign.platform.replace("_", " ")}</span><small>{campaign.model}</small></div>
                {campaign.variants.map((variant) => (
                  <article className="campaign-card" key={variant.variant_number}><small>Variant {variant.variant_number}</small><h2>{variant.headline}</h2><p>{variant.body}</p><div className="campaign-cta"><span>Call to action</span><strong>{variant.call_to_action}</strong></div><div className="tag-row">{variant.hashtags.map((tag) => <span key={tag}>{tag}</span>)}</div><footer>Evidence: {variant.citations.join(", ")}</footer></article>
                ))}
              </div>
            )}
          </section>
        </section>
      </>
    );
  }

  function Companies() {
    return (
      <>
        <PageHeading eyebrow="Company profiles" title="Create a company workspace" description="Company details become the default context for retrieval and marketing generation." />
        <section className="split-layout">
          <form className="panel stacked-form" onSubmit={handleCreateCompany}>
            <div className="panel-heading"><span className="panel-icon emerald">▦</span><div><h2>New company</h2><p>Create a workspace for documents and AI.</p></div></div>
            <div className="form-grid">
              <div><label className="field-label" htmlFor="company-name">Company name</label><input id="company-name" className="field" required minLength={2} value={companyForm.name} onChange={(event) => setCompanyForm({ ...companyForm, name: event.target.value })} /></div>
              <div><label className="field-label" htmlFor="website">Website</label><input id="website" className="field" type="url" value={companyForm.website} onChange={(event) => setCompanyForm({ ...companyForm, website: event.target.value })} /></div>
            </div>
            <div className="form-grid">
              <div><label className="field-label" htmlFor="industry">Industry</label><input id="industry" className="field" required value={companyForm.industry} onChange={(event) => setCompanyForm({ ...companyForm, industry: event.target.value })} /></div>
              <div><label className="field-label" htmlFor="brand-tone">Brand tone</label><input id="brand-tone" className="field" required value={companyForm.brand_tone} onChange={(event) => setCompanyForm({ ...companyForm, brand_tone: event.target.value })} /></div>
            </div>
            <label className="field-label" htmlFor="audience">Target audience</label><textarea id="audience" className="field textarea" required rows={4} value={companyForm.target_audience} onChange={(event) => setCompanyForm({ ...companyForm, target_audience: event.target.value })} />
            <label className="field-label" htmlFor="description">Product or service description</label><textarea id="description" className="field textarea" required rows={5} value={companyForm.product_description} onChange={(event) => setCompanyForm({ ...companyForm, product_description: event.target.value })} />
            <button className="primary-button emerald-button full-button" type="submit" disabled={creatingCompany}>{creatingCompany ? "Creating workspace..." : "Create company workspace"}</button>
          </form>

          <aside className="panel">
            <div className="panel-heading"><span className="panel-icon cyan">▦</span><div><h2>Company directory</h2><p>{companies.length} workspace(s) available.</p></div></div>
            <div className="company-list">
              {companies.map((company) => (
                <button key={company.id} type="button" className={cx("company-item", company.id === selectedCompanyId && "active")} onClick={() => { setSelectedCompanyId(company.id); setMessage(`${company.name} is now active.`); }}><span>{company.name.slice(0, 2).toUpperCase()}</span><div><strong>{company.name}</strong><small>{company.industry}</small></div><i>{company.id === selectedCompanyId ? "✓" : "→"}</i></button>
              ))}
            </div>
          </aside>
        </section>
      </>
    );
  }

  function ActiveView() {
    if (view === "knowledge") return <Knowledge />;
    if (view === "assistant") return <Assistant />;
    if (view === "marketing") return <Marketing />;
    if (view === "companies") return <Companies />;
    return <Overview />;
  }

  return (
    <main className="app-shell">
      <aside className={cx("sidebar", mobileNav && "open")}>
        <div className="brand"><span>✦</span><div><strong>GrowthOS AI</strong><small>Company intelligence</small></div><button type="button" onClick={() => setMobileNav(false)}>×</button></div>
        <nav><p>Workspace</p>{navItems.map((item) => <button key={item.id} type="button" className={cx(view === item.id && "active")} onClick={() => openView(item.id)}><span>{item.icon}</span><strong>{item.label}</strong></button>)}</nav>
        <div className="sidebar-footer"><div><span>◎</span><p><strong>Local AI active</strong><small>Ollama · Qwen 3</small></p><i /></div><small>Private local inference. No paid API required.</small></div>
      </aside>

      {mobileNav && <button className="nav-overlay" type="button" onClick={() => setMobileNav(false)} />}

      <section className="main-area">
        <header className="topbar">
          <div className="topbar-left"><button className="menu-button" type="button" onClick={() => setMobileNav(true)}>☰</button><div><small>GrowthOS AI</small><strong>{navItems.find((item) => item.id === view)?.label}</strong></div></div>
          <div className="topbar-right"><label><span>Active company</span><select value={selectedCompanyId ?? ""} onChange={(event) => { const value = event.target.value; setSelectedCompanyId(value ? Number(value) : null); setAnswer(null); setCampaign(null); clearFeedback(); }} disabled={loadingCompanies}><option value="">{loadingCompanies ? "Loading..." : "Select company"}</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><span className="avatar">VA</span></div>
        </header>

        <div className="workspace">
          {(message || error) && <div className={cx("notice", error ? "error" : "success")}><span>{error ? "!" : "✓"}</span><p>{error || message}</p><button type="button" onClick={clearFeedback}>×</button></div>}
          <ActiveView />
        </div>
      </section>
    </main>
  );
}
