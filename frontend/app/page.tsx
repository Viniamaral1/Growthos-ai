"use client";

import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

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


const emptyCompanyForm = {
  name: "",
  website: "",
  industry: "",
  target_audience: "",
  brand_tone: "",
  product_description: "",
};


const initialMarketingForm = {
  platform: "linkedin" as MarketingPlatform,
  objective: "lead_generation" as MarketingObjective,
  campaign_brief: "",
  target_audience: "",
  tone: "",
  number_of_variants: 3,
};


export default function Home() {
  const [companies, setCompanies] =
    useState<Company[]>([]);

  const [
    selectedCompanyId,
    setSelectedCompanyId,
  ] = useState<number | null>(null);

  const [companyForm, setCompanyForm] =
    useState(emptyCompanyForm);

  const [
    marketingForm,
    setMarketingForm,
  ] = useState(initialMarketingForm);

  const [selectedFile, setSelectedFile] =
    useState<File | null>(null);

  const [question, setQuestion] =
    useState("");

  const [answer, setAnswer] =
    useState<GroundedAnswer | null>(null);

  const [
    campaign,
    setCampaign,
  ] = useState<MarketingCampaign | null>(
    null,
  );

  const [
    loadingCompanies,
    setLoadingCompanies,
  ] = useState(true);

  const [
    creatingCompany,
    setCreatingCompany,
  ] = useState(false);

  const [
    uploadingDocument,
    setUploadingDocument,
  ] = useState(false);

  const [
    askingQuestion,
    setAskingQuestion,
  ] = useState(false);

  const [
    generatingCampaign,
    setGeneratingCampaign,
  ] = useState(false);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");


  useEffect(() => {
    async function loadCompanies() {
      setLoadingCompanies(true);
      setError("");

      try {
        const loadedCompanies =
          await getCompanies();

        setCompanies(loadedCompanies);

        if (loadedCompanies.length > 0) {
          setSelectedCompanyId(
            (currentCompanyId) =>
              currentCompanyId ??
              loadedCompanies[0].id,
          );
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


  async function handleCreateCompany(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setCreatingCompany(true);
    setError("");
    setMessage("");

    try {
      const createdCompany =
        await createCompany({
          name: companyForm.name,
          website:
            companyForm.website.trim() || null,
          industry: companyForm.industry,
          target_audience:
            companyForm.target_audience,
          brand_tone:
            companyForm.brand_tone,
          product_description:
            companyForm.product_description,
        });

      setCompanies(
        (currentCompanies) => [
          createdCompany,
          ...currentCompanies,
        ],
      );

      setSelectedCompanyId(
        createdCompany.id,
      );

      setCompanyForm(
        emptyCompanyForm,
      );

      setMessage(
        `Company "${createdCompany.name}" created successfully.`,
      );
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


  async function handleUploadDocument(
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
      setError(
        "Choose a PDF before uploading.",
      );
      return;
    }

    setUploadingDocument(true);
    setError("");
    setMessage("");
    setAnswer(null);
    setCampaign(null);

    try {
      const uploadedDocument =
        await uploadDocument(
          selectedCompanyId,
          selectedFile,
        );

      setMessage(
        `Uploaded ${uploadedDocument.original_filename}. Processing started...`,
      );

      const processedDocument =
        await processDocument(
          uploadedDocument.id,
        );

      setMessage(
        `${processedDocument.original_filename} is ready.`,
      );

      setSelectedFile(null);

      const fileInput =
        document.getElementById(
          "document-file",
        ) as HTMLInputElement | null;

      if (fileInput) {
        fileInput.value = "";
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


  async function handleAskQuestion(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (selectedCompanyId === null) {
      setError(
        "Create or select a company first.",
      );
      return;
    }

    if (question.trim().length < 3) {
      setError(
        "Enter a longer question.",
      );
      return;
    }

    setAskingQuestion(true);
    setError("");
    setMessage("");
    setAnswer(null);

    try {
      const generatedAnswer =
        await askGroundedQuestion(
          selectedCompanyId,
          question.trim(),
        );

      setAnswer(
        generatedAnswer,
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


  async function handleGenerateCampaign(
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
    setError("");
    setMessage("");
    setCampaign(null);

    try {
      const generatedCampaign =
        await generateMarketingCampaign({
          company_id: selectedCompanyId,
          platform:
            marketingForm.platform,
          objective:
            marketingForm.objective,
          campaign_brief:
            marketingForm.campaign_brief.trim(),
          target_audience:
            marketingForm.target_audience
              .trim() || null,
          tone:
            marketingForm.tone.trim() ||
            null,
          number_of_variants:
            marketingForm.number_of_variants,
          retrieval_limit: 6,
          minimum_score: 0.2,
        });

      setCampaign(
        generatedCampaign,
      );

      setMessage(
        "Marketing campaign generated successfully.",
      );
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


  const selectedCompany =
    companies.find(
      (company) =>
        company.id === selectedCompanyId,
    ) ?? null;


  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-10">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400">
            AI business growth platform
          </p>

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            GrowthOS AI
          </h1>

          <p className="mt-4 max-w-3xl text-lg text-slate-400">
            Build a company knowledge base,
            generate grounded answers, and create
            evidence-based marketing campaigns using
            a local Ollama model.
          </p>
        </header>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-200">
            {message}
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">
              Company workspace
            </h2>

            <label
              htmlFor="company-select"
              className="mt-6 block text-sm font-medium"
            >
              Active company
            </label>

            <select
              id="company-select"
              value={selectedCompanyId ?? ""}
              onChange={(event) => {
                const value =
                  event.target.value;

                setSelectedCompanyId(
                  value
                    ? Number(value)
                    : null,
                );

                setAnswer(null);
                setCampaign(null);
                setError("");
                setMessage("");
              }}
              disabled={loadingCompanies}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 outline-none focus:border-cyan-400"
            >
              <option value="">
                {loadingCompanies
                  ? "Loading companies..."
                  : "Select a company"}
              </option>

              {companies.map(
                (company) => (
                  <option
                    key={company.id}
                    value={company.id}
                  >
                    {company.name}
                  </option>
                ),
              )}
            </select>

            {selectedCompany && (
              <div className="mt-6 rounded-xl bg-slate-950 p-4">
                <h3 className="font-semibold text-cyan-300">
                  {selectedCompany.name}
                </h3>

                <p className="mt-2 text-sm text-slate-400">
                  {selectedCompany.industry}
                </p>

                <p className="mt-3 text-sm leading-6 text-slate-300">
                  {
                    selectedCompany.product_description
                  }
                </p>
              </div>
            )}
          </div>

          <form
            onSubmit={handleUploadDocument}
            className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
          >
            <h2 className="text-xl font-semibold">
              Upload knowledge
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Upload a PDF. GrowthOS extracts,
              chunks, and embeds it automatically.
            </p>

            <input
              id="document-file"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => {
                setSelectedFile(
                  event.target.files?.[0] ??
                    null,
                );
              }}
              className="mt-6 block w-full rounded-lg border border-dashed border-slate-700 bg-slate-950 p-4 text-sm"
            />

            <button
              type="submit"
              disabled={
                uploadingDocument ||
                selectedCompanyId === null
              }
              className="mt-5 w-full rounded-lg bg-cyan-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploadingDocument
                ? "Uploading and processing..."
                : "Upload and process PDF"}
            </button>
          </form>

          <form
            onSubmit={handleAskQuestion}
            className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
          >
            <h2 className="text-xl font-semibold">
              Ask GrowthOS
            </h2>

            <textarea
              value={question}
              onChange={(event) =>
                setQuestion(
                  event.target.value,
                )
              }
              rows={6}
              placeholder="What products and services does this company provide?"
              className="mt-6 w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 outline-none focus:border-cyan-400"
            />

            <button
              type="submit"
              disabled={
                askingQuestion ||
                selectedCompanyId === null
              }
              className="mt-5 w-full rounded-lg bg-violet-500 px-4 py-3 font-semibold transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {askingQuestion
                ? "Generating answer..."
                : "Ask grounded question"}
            </button>
          </form>
        </section>

        <section className="mt-8 rounded-2xl border border-amber-500/20 bg-slate-900 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-400">
                Marketing Studio
              </p>

              <h2 className="mt-2 text-3xl font-semibold">
                Generate grounded campaigns
              </h2>

              <p className="mt-3 max-w-3xl text-slate-400">
                Create platform-specific marketing
                content using verified company evidence.
              </p>
            </div>
          </div>

          <form
            onSubmit={handleGenerateCampaign}
            className="mt-8 grid gap-5 md:grid-cols-2"
          >
            <div>
              <label className="text-sm font-medium">
                Platform
              </label>

              <select
                value={
                  marketingForm.platform
                }
                onChange={(event) =>
                  setMarketingForm({
                    ...marketingForm,
                    platform:
                      event.target
                        .value as MarketingPlatform,
                  })
                }
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3"
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
              <label className="text-sm font-medium">
                Objective
              </label>

              <select
                value={
                  marketingForm.objective
                }
                onChange={(event) =>
                  setMarketingForm({
                    ...marketingForm,
                    objective:
                      event.target
                        .value as MarketingObjective,
                  })
                }
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3"
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
                <option value="sales">
                  Sales
                </option>
                <option value="engagement">
                  Engagement
                </option>
              </select>
            </div>

            <textarea
              required
              minLength={5}
              value={
                marketingForm.campaign_brief
              }
              onChange={(event) =>
                setMarketingForm({
                  ...marketingForm,
                  campaign_brief:
                    event.target.value,
                })
              }
              rows={5}
              placeholder="Campaign brief"
              className="resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 md:col-span-2"
            />

            <input
              value={
                marketingForm.target_audience
              }
              onChange={(event) =>
                setMarketingForm({
                  ...marketingForm,
                  target_audience:
                    event.target.value,
                })
              }
              placeholder="Optional target audience override"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3"
            />

            <input
              value={marketingForm.tone}
              onChange={(event) =>
                setMarketingForm({
                  ...marketingForm,
                  tone: event.target.value,
                })
              }
              placeholder="Optional tone override"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3"
            />

            <div>
              <label className="text-sm font-medium">
                Variants
              </label>

              <select
                value={
                  marketingForm.number_of_variants
                }
                onChange={(event) =>
                  setMarketingForm({
                    ...marketingForm,
                    number_of_variants:
                      Number(
                        event.target.value,
                      ),
                  })
                }
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
                <option value={5}>5</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={
                generatingCampaign ||
                selectedCompanyId === null
              }
              className="self-end rounded-lg bg-amber-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generatingCampaign
                ? "Generating campaign..."
                : "Generate marketing campaign"}
            </button>
          </form>
        </section>

        {campaign && (
          <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-2xl font-semibold">
                Generated campaign
              </h2>

              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                {campaign.platform} ·{" "}
                {campaign.model}
              </span>
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              {campaign.variants.map(
                (variant) => (
                  <article
                    key={
                      variant.variant_number
                    }
                    className="rounded-xl border border-slate-800 bg-slate-950 p-5"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
                      Variant{" "}
                      {
                        variant.variant_number
                      }
                    </p>

                    <h3 className="mt-3 text-xl font-semibold">
                      {variant.headline}
                    </h3>

                    <p className="mt-4 whitespace-pre-wrap leading-7 text-slate-300">
                      {variant.body}
                    </p>

                    <div className="mt-5 rounded-lg bg-slate-900 p-4">
                      <strong>
                        Call to action
                      </strong>

                      <p className="mt-2 text-slate-300">
                        {
                          variant.call_to_action
                        }
                      </p>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {variant.hashtags.map(
                        (hashtag) => (
                          <span
                            key={hashtag}
                            className="rounded-full bg-cyan-500/10 px-3 py-1 text-sm text-cyan-300"
                          >
                            {hashtag}
                          </span>
                        ),
                      )}
                    </div>

                    <p className="mt-4 text-xs text-slate-500">
                      Evidence:{" "}
                      {variant.citations.join(
                        ", ",
                      )}
                    </p>
                  </article>
                ),
              )}
            </div>
          </section>
        )}

        {answer && (
          <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-2xl font-semibold">
              Grounded answer
            </h2>

            <div className="mt-6 whitespace-pre-wrap rounded-xl bg-slate-950 p-5 leading-7">
              {answer.answer}
            </div>

            <h3 className="mt-8 text-lg font-semibold">
              Sources
            </h3>

            <div className="mt-4 grid gap-4">
              {answer.sources.map(
                (
                  source: AnswerSource,
                ) => (
                  <article
                    key={source.source_id}
                    className="rounded-xl border border-slate-800 bg-slate-950 p-5"
                  >
                    <strong className="text-cyan-300">
                      [{source.source_id}]{" "}
                      {source.document_name}
                    </strong>

                    <p className="mt-3 text-sm text-slate-400">
                      Page{" "}
                      {source.page_number ??
                        "unknown"}{" "}
                      · Score{" "}
                      {
                        source.similarity_score
                      }
                    </p>

                    <p className="mt-4 text-sm leading-6 text-slate-300">
                      {source.text}
                    </p>
                  </article>
                ),
              )}
            </div>
          </section>
        )}

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-2xl font-semibold">
            Create a company
          </h2>

          <form
            onSubmit={handleCreateCompany}
            className="mt-6 grid gap-4 md:grid-cols-2"
          >
            <input
              required
              minLength={2}
              value={companyForm.name}
              onChange={(event) =>
                setCompanyForm({
                  ...companyForm,
                  name: event.target.value,
                })
              }
              placeholder="Company name"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3"
            />

            <input
              type="url"
              value={companyForm.website}
              onChange={(event) =>
                setCompanyForm({
                  ...companyForm,
                  website:
                    event.target.value,
                })
              }
              placeholder="Website"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3"
            />

            <input
              required
              value={companyForm.industry}
              onChange={(event) =>
                setCompanyForm({
                  ...companyForm,
                  industry:
                    event.target.value,
                })
              }
              placeholder="Industry"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3"
            />

            <input
              required
              value={companyForm.brand_tone}
              onChange={(event) =>
                setCompanyForm({
                  ...companyForm,
                  brand_tone:
                    event.target.value,
                })
              }
              placeholder="Brand tone"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3"
            />

            <textarea
              required
              value={
                companyForm.target_audience
              }
              onChange={(event) =>
                setCompanyForm({
                  ...companyForm,
                  target_audience:
                    event.target.value,
                })
              }
              placeholder="Target audience"
              rows={4}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3"
            />

            <textarea
              required
              value={
                companyForm.product_description
              }
              onChange={(event) =>
                setCompanyForm({
                  ...companyForm,
                  product_description:
                    event.target.value,
                })
              }
              placeholder="Product description"
              rows={4}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3"
            />

            <button
              type="submit"
              disabled={creatingCompany}
              className="rounded-lg bg-emerald-500 px-4 py-3 font-semibold text-slate-950 md:col-span-2"
            >
              {creatingCompany
                ? "Creating..."
                : "Create company"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}