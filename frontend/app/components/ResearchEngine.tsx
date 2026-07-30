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
  addResearchEvidence,
  createResearchProject,
  deleteResearchProject,
  generateResearchProjectPlan,
  getResearchProjects,
  getResearchSummary,
  regenerateResearchTasks,
  updateResearchProjectAnswers,
  updateResearchTask,
  type Company,
  type DocumentRecord,
  type ResearchProject,
  type ResearchStatus,
  type ResearchSummary,
  type ResearchTask,
} from "@/lib/api";


function statusLabel(status: ResearchStatus) {
  return status.replace("_", " ");
}


export default function ResearchEngine({
  company,
  documents,
  onError,
  onSuccess,
}: {
  company: Company | null;
  documents: DocumentRecord[];
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}) {
  const [summary, setSummary] =
    useState<ResearchSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] =
    useState(false);
  const [activeTask, setActiveTask] =
    useState<ResearchTask | null>(null);
  const [evidenceTitle, setEvidenceTitle] =
    useState("");
  const [evidenceSummary, setEvidenceSummary] =
    useState("");
  const [evidenceType, setEvidenceType] =
    useState("customer_interview");
  const [documentId, setDocumentId] =
    useState<number | null>(null);
  const [savingEvidence, setSavingEvidence] =
    useState(false);
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [researchGoal, setResearchGoal] = useState("");
  const [researchContext, setResearchContext] = useState("");
  const [deliverableType, setDeliverableType] = useState("research_report");
  const [projectAnswers, setProjectAnswers] = useState<Record<string, string>>({});
  const [creatingProject, setCreatingProject] = useState(false);
  const [savingAnswers, setSavingAnswers] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);

  const evidencePanelRef =
    useRef<HTMLElement | null>(null);

  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const readyDocuments = useMemo(
    () =>
      documents.filter(
        (document) =>
          document.processing_status === "processed",
      ),
    [documents],
  );

  useEffect(() => {
    async function loadResearch() {
      if (!company) {
        setSummary(null);
        setActiveTask(null);
        setProjects([]);
        setActiveProjectId(null);
        return;
      }

      setLoading(true);

      try {
        const [research, savedProjects] = await Promise.all([
          getResearchSummary(company.id),
          getResearchProjects(company.id),
        ]);

        setSummary(research);
        setProjects(savedProjects);
        if (savedProjects.length > 0) {
          setActiveProjectId((current) => current ?? savedProjects[0].id);
          setProjectAnswers(savedProjects[0].answers);
        }

        const savedTaskId = readStoredNumber(
          uiStorageKeys.researchTask(
            company.id,
          ),
        );

        const savedTask = research.tasks.find(
          (task) => task.id === savedTaskId,
        );

        setActiveTask(savedTask ?? null);

        if (
          savedTaskId !== null &&
          savedTask === undefined
        ) {
          removeStoredValue(
            uiStorageKeys.researchTask(
              company.id,
            ),
          );
        }
      } catch (error) {
        onErrorRef.current(
          error instanceof Error
            ? error.message
            : "Research could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadResearch();
  }, [company]);

  function selectResearchTask(
    task: ResearchTask,
  ) {
    setActiveTask(task);

    if (company) {
      writeStoredNumber(
        uiStorageKeys.researchTask(
          company.id,
        ),
        task.id,
      );
    }

    window.requestAnimationFrame(() => {
      evidencePanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }


  function replaceTask(task: ResearchTask) {
    setSummary((current) =>
      current
        ? {
            ...current,
            tasks: current.tasks.map((item) =>
              item.id === task.id ? task : item,
            ),
          }
        : current,
    );

    setActiveTask((current) =>
      current?.id === task.id ? task : current,
    );
  }

  async function changeStatus(
    task: ResearchTask,
    status: ResearchStatus,
  ) {
    try {
      const updated = await updateResearchTask(
        task.id,
        status,
      );
      replaceTask(updated);

      onSuccess(
        `Research task marked ${statusLabel(status)}.`,
      );
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "The research task could not be updated.",
      );
    }
  }

  async function regenerate() {
    if (!company) {
      return;
    }

    setRegenerating(true);

    try {
      const generated =
        await regenerateResearchTasks(company.id);
      setSummary(generated);
      onSuccess(
        "Research tasks refreshed from the current workspace.",
      );
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Research tasks could not be refreshed.",
      );
    } finally {
      setRegenerating(false);
    }
  }

  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;

  function replaceProject(project: ResearchProject) {
    setProjects((current) => {
      const exists = current.some((item) => item.id === project.id);
      return exists
        ? current.map((item) => item.id === project.id ? project : item)
        : [project, ...current];
    });
    setActiveProjectId(project.id);
    setProjectAnswers(project.answers);
  }

  async function startResearchProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!company || !researchGoal.trim()) return;
    setCreatingProject(true);
    try {
      const project = await createResearchProject(company.id, {
        goal: researchGoal.trim(),
        context: researchContext.trim() || null,
        deliverable_type: deliverableType,
      });
      replaceProject(project);
      setResearchGoal("");
      setResearchContext("");
      onSuccess(project.questions.length
        ? "Research discovery created. Answer the adaptive questions next."
        : "Research request is clear and ready for planning.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "The research project could not be created.");
    } finally {
      setCreatingProject(false);
    }
  }

  async function saveProjectAnswers() {
    if (!activeProject) return;
    setSavingAnswers(true);
    try {
      const project = await updateResearchProjectAnswers(activeProject.id, projectAnswers);
      replaceProject(project);
      onSuccess(project.status === "ready"
        ? "Discovery complete. The research plan is ready to generate."
        : "Discovery answers saved.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Answers could not be saved.");
    } finally {
      setSavingAnswers(false);
    }
  }

  async function buildProjectPlan() {
    if (!activeProject) return;
    setGeneratingPlan(true);
    try {
      const saved = await updateResearchProjectAnswers(activeProject.id, projectAnswers);
      const project = await generateResearchProjectPlan(saved.id);
      replaceProject(project);
      onSuccess("Universal research plan generated.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "The research plan could not be generated.");
    } finally {
      setGeneratingPlan(false);
    }
  }

  async function removeProject(projectId: number) {
    try {
      await deleteResearchProject(projectId);
      setProjects((current) => current.filter((item) => item.id !== projectId));
      if (activeProjectId === projectId) {
        setActiveProjectId(null);
        setProjectAnswers({});
      }
      onSuccess("Research project removed.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "The project could not be removed.");
    }
  }

  async function submitEvidence(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!activeTask) {
      return;
    }

    setSavingEvidence(true);

    try {
      const updated = await addResearchEvidence(
        activeTask.id,
        {
          title: evidenceTitle.trim(),
          summary: evidenceSummary.trim(),
          evidence_type: evidenceType,
          document_id: documentId,
        },
      );

      replaceTask(updated);

      setEvidenceTitle("");
      setEvidenceSummary("");
      setDocumentId(null);
      onSuccess("Research evidence added.");
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Research evidence could not be added.",
      );
    } finally {
      setSavingEvidence(false);
    }
  }

  if (!company) {
    return (
      <section className="panel research-empty">
        <span>⌕</span>
        <h2>Select a workspace</h2>
        <p>
          The Research Engine needs a business workspace
          before it can identify evidence gaps.
        </p>
      </section>
    );
  }

  if (loading || !summary) {
    return (
      <section className="panel research-empty">
        <span>◎</span>
        <h2>Building the research foundation</h2>
        <p>
          GrowthOS is reviewing the workspace, plan,
          and available evidence.
        </p>
      </section>
    );
  }

  const openTasks = summary.tasks.filter(
    (task) =>
      !["validated", "dismissed"].includes(
        task.status,
      ),
  );

  return (
    <>
      <header className="page-heading">
        <span>Research engine</span>
        <h1>Turn assumptions into verified evidence</h1>
        <p>
          GrowthOS identifies what is known, what remains
          uncertain, why it matters, and the next practical
          research action.
        </p>
      </header>

      <section className="research-architect panel">
        <div className="panel-heading">
          <span className="panel-icon violet">◇</span>
          <div>
            <h2>Universal Research Architect</h2>
            <p>Start with any research goal. GrowthOS identifies missing inputs and builds an evidence-first plan without hard-coded industries.</p>
          </div>
        </div>

        <div className="research-architect-grid">
          <form className="research-project-form" onSubmit={startResearchProject}>
            <label>What do you want to research?
              <textarea required minLength={10} rows={4} value={researchGoal} onChange={(event) => setResearchGoal(event.target.value)} placeholder="Example: Evaluate whether our company should expand into Germany, compare entry strategies, and identify the evidence needed for a decision." />
            </label>
            <label>Useful context (optional)
              <textarea rows={3} value={researchContext} onChange={(event) => setResearchContext(event.target.value)} placeholder="Constraints, audience, timeframe, budget, options already considered, or what a good decision must achieve." />
            </label>
            <label>Desired deliverable
              <select value={deliverableType} onChange={(event) => setDeliverableType(event.target.value)}>
                <option value="research_report">Research report</option>
                <option value="feasibility_study">Feasibility study</option>
                <option value="comparison_report">Comparison report</option>
                <option value="market_analysis">Market analysis</option>
                <option value="business_case">Business case</option>
                <option value="decision_brief">Decision brief</option>
              </select>
            </label>
            <button type="submit" disabled={creatingProject}>{creatingProject ? "Analysing request..." : "Start guided research"}</button>
          </form>

          <div className="research-project-workspace">
            {projects.length > 0 && (
              <div className="research-project-tabs">
                {projects.map((project) => (
                  <button key={project.id} type="button" className={project.id === activeProjectId ? "active" : ""} onClick={() => { setActiveProjectId(project.id); setProjectAnswers(project.answers); }}>
                    <span>{project.status}</span>{project.title}
                  </button>
                ))}
              </div>
            )}

            {!activeProject ? (
              <div className="research-evidence-placeholder"><span>◇</span><p>Create a project to begin an adaptive discovery interview.</p></div>
            ) : (
              <article className="research-project-detail">
                <header><div><span>{activeProject.project_type ?? "General research"}</span><h3>{activeProject.title}</h3></div><button type="button" className="danger-link" onClick={() => void removeProject(activeProject.id)}>Remove</button></header>
                <p className="research-project-goal">{activeProject.goal}</p>

                {activeProject.questions.length > 0 && !activeProject.plan && (
                  <div className="research-discovery-questions">
                    <h4>Discovery questions</h4>
                    <p>These questions are generated from this request. They are not tied to a fixed industry template.</p>
                    {activeProject.questions.map((question) => (
                      <label key={question.id}>
                        <span>{question.question}{question.required && <em> required</em>}</span>
                        <small>{question.why_it_matters}</small>
                        <textarea rows={2} value={projectAnswers[question.id] ?? ""} onChange={(event) => setProjectAnswers((current) => ({ ...current, [question.id]: event.target.value }))} placeholder={question.suggested_answer ?? "Your answer"} />
                      </label>
                    ))}
                    <div className="research-project-actions">
                      <button type="button" className="secondary" disabled={savingAnswers} onClick={() => void saveProjectAnswers()}>{savingAnswers ? "Saving..." : "Save answers"}</button>
                      <button type="button" disabled={generatingPlan} onClick={() => void buildProjectPlan()}>{generatingPlan ? "Building plan..." : "Generate research plan"}</button>
                    </div>
                  </div>
                )}

                {activeProject.questions.length === 0 && !activeProject.plan && (
                  <div className="research-ready-card"><strong>The request is sufficiently clear.</strong><p>GrowthOS did not add unnecessary questions. Generate the evidence-first plan when ready.</p><button type="button" disabled={generatingPlan} onClick={() => void buildProjectPlan()}>{generatingPlan ? "Building plan..." : "Generate research plan"}</button></div>
                )}

                {activeProject.plan && (
                  <div className="research-plan-view">
                    <div className="research-plan-summary"><span>Research objective</span><p>{activeProject.plan.objective}</p></div>
                    {activeProject.plan.sections.map((section, index) => (
                      <details key={`${section.title}-${index}`} open={index === 0}>
                        <summary>{index + 1}. {section.title}</summary>
                        <p>{section.purpose}</p>
                        <strong>Questions to answer</strong><ul>{section.research_questions.map((item) => <li key={item}>{item}</li>)}</ul>
                        <strong>Evidence needed</strong><ul>{section.evidence_needed.map((item) => <li key={item}>{item}</li>)}</ul>
                        <strong>Analysis method</strong><p>{section.analysis_method}</p>
                      </details>
                    ))}
                    <div className="research-plan-columns">
                      <div><strong>Source strategy</strong><ul>{activeProject.plan.source_strategy.map((item) => <li key={item}>{item}</li>)}</ul></div>
                      <div><strong>Evaluation criteria</strong><ul>{activeProject.plan.evaluation_criteria.map((item) => <li key={item}>{item}</li>)}</ul></div>
                      <div><strong>Risks and limitations</strong><ul>{activeProject.plan.risks_and_limitations.map((item) => <li key={item}>{item}</li>)}</ul></div>
                      <div><strong>Next actions</strong><ul>{activeProject.plan.next_actions.map((item) => <li key={item}>{item}</li>)}</ul></div>
                    </div>
                  </div>
                )}
              </article>
            )}
          </div>
        </div>
      </section>

      <section className="research-stat-grid">
        <article>
          <small>Research health</small>
          <strong>
            {summary.research_health_score}%
          </strong>
          <p>Completion, evidence, and confidence.</p>
        </article>
        <article>
          <small>Open tasks</small>
          <strong>{summary.open_tasks}</strong>
          <p>
            {summary.critical_tasks} critical priority.
          </p>
        </article>
        <article>
          <small>Evidence records</small>
          <strong>{summary.evidence_count}</strong>
          <p>Manual or document-backed findings.</p>
        </article>
        <article>
          <small>Average confidence</small>
          <strong>
            {summary.average_confidence}%
          </strong>
          <p>
            Average risk: {summary.average_risk}%.
          </p>
        </article>
      </section>

      <section className="research-command">
        <div>
          <span>⌕</span>
          <div>
            <strong>Evidence-first recommendations</strong>
            <p>
              These tasks are generated from missing workspace
              information and unverified assumptions—not from
              invented external research.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void regenerate()}
          disabled={regenerating}
        >
          {regenerating
            ? "Refreshing..."
            : "Refresh research tasks"}
        </button>
      </section>

      <section className="research-layout">
        <div className="research-task-column">
          {openTasks.length === 0 ? (
            <div className="panel research-empty compact">
              <span>✓</span>
              <h2>Core research complete</h2>
              <p>
                Add new evidence or refresh tasks when the
                workspace strategy changes.
              </p>
            </div>
          ) : (
            openTasks.map((task) => (
              <article
                key={task.id}
                className={[
                  "research-task-card",
                  `priority-${task.priority}`,
                  activeTask?.id === task.id
                    ? "selected"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <header>
                  <div>
                    <span>{task.category}</span>
                    <strong>{task.title}</strong>
                  </div>
                  <em>{task.priority}</em>
                </header>

                <p>{task.description}</p>

                <div className="research-score-row">
                  <div>
                    <span>Confidence</span>
                    <strong>
                      {task.confidence_score}%
                    </strong>
                  </div>
                  <div>
                    <span>Risk</span>
                    <strong>{task.risk_score}%</strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>
                      {statusLabel(task.status)}
                    </strong>
                  </div>
                </div>

                <details>
                  <summary>Why this matters</summary>
                  <p>{task.reason}</p>
                  <strong>Recommended action</strong>
                  <p>{task.recommended_action}</p>
                  <strong>Evidence required</strong>
                  <p>{task.evidence_required}</p>
                </details>

                <footer>
                  <button
                    type="button"
                    onClick={() =>
                      selectResearchTask(task)
                    }
                  >
                    + Add evidence
                  </button>
                  <select
                    value={task.status}
                    onChange={(event) =>
                      void changeStatus(
                        task,
                        event.target
                          .value as ResearchStatus,
                      )
                    }
                  >
                    <option value="missing">
                      Missing
                    </option>
                    <option value="planned">
                      Planned
                    </option>
                    <option value="in_progress">
                      In progress
                    </option>
                    <option value="validated">
                      Validated
                    </option>
                    <option value="dismissed">
                      Dismissed
                    </option>
                  </select>
                </footer>
              </article>
            ))
          )}
        </div>

        <aside
          ref={evidencePanelRef}
          className="panel research-evidence-panel"
        >
          <div className="panel-heading">
            <span className="panel-icon violet">+</span>
            <div>
              <h2>Add research evidence</h2>
              <p>
                Record what the evidence supports and where it
                came from.
              </p>
            </div>
          </div>

          {!activeTask ? (
            <div className="research-evidence-placeholder">
              <span>⌕</span>
              <p>
                Choose <strong>Add evidence</strong> on a
                research task.
              </p>
            </div>
          ) : (
            <form onSubmit={submitEvidence}>
              <div className="selected-research-task">
                <small>Selected task</small>
                <strong>{activeTask.title}</strong>
              </div>

              <label>
                Evidence title
                <input
                  id="research-evidence-title"
                  name="research-evidence-title"
                  autoComplete="off"
                  required
                  minLength={2}
                  value={evidenceTitle}
                  onChange={(event) =>
                    setEvidenceTitle(
                      event.target.value,
                    )
                  }
                  placeholder="Customer interview findings"
                />
              </label>

              <label>
                Evidence type
                <select
                  id="research-evidence-type"
                  name="research-evidence-type"
                  value={evidenceType}
                  onChange={(event) =>
                    setEvidenceType(
                      event.target.value,
                    )
                  }
                >
                  <option value="customer_interview">
                    Customer interview
                  </option>
                  <option value="market_report">
                    Market report
                  </option>
                  <option value="competitor">
                    Competitor evidence
                  </option>
                  <option value="financial">
                    Financial evidence
                  </option>
                  <option value="official_source">
                    Official source
                  </option>
                  <option value="manual">
                    Manual note
                  </option>
                </select>
              </label>

              <label>
                Linked intelligence asset
                <select
                  id="research-evidence-document"
                  name="research-evidence-document"
                  value={documentId ?? ""}
                  onChange={(event) =>
                    setDocumentId(
                      event.target.value
                        ? Number(event.target.value)
                        : null,
                    )
                  }
                >
                  <option value="">
                    No linked document
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
              </label>

              <label>
                What does this evidence support?
                <textarea
                  id="research-evidence-summary"
                  name="research-evidence-summary"
                  autoComplete="off"
                  required
                  minLength={5}
                  rows={7}
                  value={evidenceSummary}
                  onChange={(event) =>
                    setEvidenceSummary(
                      event.target.value,
                    )
                  }
                  placeholder="Summarise the finding, its source, its limitations, and what decision it supports."
                />
              </label>

              <button
                type="submit"
                disabled={savingEvidence}
              >
                {savingEvidence
                  ? "Saving evidence..."
                  : "Save evidence"}
              </button>

              {activeTask.evidence.length > 0 && (
                <div className="existing-evidence">
                  <strong>
                    Existing evidence
                  </strong>
                  {activeTask.evidence.map(
                    (evidence) => (
                      <article key={evidence.id}>
                        <span>
                          {evidence.evidence_type.replace(
                            "_",
                            " ",
                          )}
                        </span>
                        <strong>{evidence.title}</strong>
                        <p>{evidence.summary}</p>
                        {evidence.document_name && (
                          <small>
                            Source:{" "}
                            {evidence.document_name}
                          </small>
                        )}
                      </article>
                    ),
                  )}
                </div>
              )}
            </form>
          )}
        </aside>
      </section>

      <style jsx>{`
        :global(.research-task-card.selected) {
          border-color: rgba(155, 135, 245, 0.34);
          background:
            linear-gradient(
              180deg,
              rgba(155, 135, 245, 0.055),
              rgba(255, 255, 255, 0.012)
            );
          box-shadow:
            0 0 0 1px rgba(155, 135, 245, 0.08),
            0 14px 34px rgba(0, 0, 0, 0.16);
        }

        :global(.research-evidence-panel) {
          scroll-margin-top: 96px;
        }
      `}</style>
    </>
  );
}
