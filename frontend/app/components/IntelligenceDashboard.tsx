"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  getConversations,
  getResearchSummary,
  type BusinessPlan,
  type Company,
  type ConversationSummary,
  type DocumentRecord,
  type ResearchSummary,
  type ResearchTask,
} from "@/lib/api";


export type DashboardDestination =
  | "knowledge"
  | "cofounder"
  | "research"
  | "marketing"
  | "plan"
  | "companies";


function greeting(): string {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 18) {
    return "Good afternoon";
  }

  return "Good evening";
}


function taskStatusLabel(
  task: ResearchTask,
): string {
  return task.status.replace("_", " ");
}


function priorityWeight(
  priority: ResearchTask["priority"],
): number {
  if (priority === "critical") {
    return 4;
  }

  if (priority === "high") {
    return 3;
  }

  if (priority === "medium") {
    return 2;
  }

  return 1;
}


export default function IntelligenceDashboard({
  company,
  displayName,
  documents,
  activeDocument,
  businessPlan,
  onOpenView,
  onOpenConversation,
  onStartConversation,
  onError,
}: {
  company: Company | null;
  displayName: string;
  documents: DocumentRecord[];
  activeDocument: DocumentRecord | null;
  businessPlan: BusinessPlan | null;
  onOpenView: (
    destination: DashboardDestination,
  ) => void;
  onOpenConversation: (conversationId: number) => void;
  onStartConversation: () => void;
  onError: (message: string) => void;
}) {
  const [research, setResearch] =
    useState<ResearchSummary | null>(null);

  const [conversations, setConversations] =
    useState<ConversationSummary[]>([]);

  const [loadingIntelligence, setLoadingIntelligence] =
    useState(false);

  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const companyId = company?.id ?? null;

  useEffect(() => {
    async function loadDashboardIntelligence() {
      if (companyId === null) {
        setResearch(null);
        setConversations([]);
        return;
      }

      setLoadingIntelligence(true);

      const results = await Promise.allSettled([
        getResearchSummary(companyId),
        getConversations(companyId),
      ]);

      const researchResult = results[0];
      const conversationResult = results[1];

      if (researchResult.status === "fulfilled") {
        setResearch(researchResult.value);
      } else {
        setResearch(null);
      }

      if (conversationResult.status === "fulfilled") {
        setConversations(conversationResult.value);
      } else {
        setConversations([]);
      }

      if (
        researchResult.status === "rejected" &&
        conversationResult.status === "rejected"
      ) {
        onErrorRef.current(
          "Dashboard intelligence could not be loaded. "
            + "The rest of GrowthOS remains available.",
        );
      }

      setLoadingIntelligence(false);
    }

    void loadDashboardIntelligence();
  }, [companyId]);

  const processedDocuments = useMemo(
    () =>
      documents.filter(
        (document) =>
          document.processing_status === "processed",
      ),
    [documents],
  );

  const indexedPages = useMemo(
    () =>
      processedDocuments.reduce(
        (total, document) =>
          total + (document.page_count ?? 0),
        0,
      ),
    [processedDocuments],
  );

  const workspaceScore = useMemo(() => {
    if (!company) {
      return 0;
    }

    const checks = [
      company.business_idea,
      company.problem_statement,
      company.proposed_solution,
      company.target_audience,
      company.country,
      company.business_model,
      company.primary_goal,
      company.product_description,
    ];

    const completed = checks.filter(
      (value) =>
        value !== null &&
        String(value).trim().length > 0,
    ).length;

    return Math.round(
      (completed / checks.length) * 100,
    );
  }, [company]);

  const knowledgeScore = Math.min(
    processedDocuments.length * 18,
    100,
  );

  const strategyScore = businessPlan ? 100 : 0;

  const researchScore =
    research?.research_health_score ?? 0;

  const readinessScore = Math.round(
    workspaceScore * 0.3 +
      knowledgeScore * 0.2 +
      strategyScore * 0.2 +
      researchScore * 0.3,
  );

  const openTasks = useMemo(
    () =>
      (research?.tasks ?? [])
        .filter(
          (task) =>
            !["validated", "dismissed"].includes(
              task.status,
            ),
        )
        .sort(
          (first, second) =>
            priorityWeight(second.priority) -
              priorityWeight(first.priority) ||
            second.risk_score - first.risk_score,
        ),
    [research],
  );

  const topPriority = openTasks[0] ?? null;

  const recommendation = topPriority
    ? {
        title: topPriority.title,
        reason: topPriority.reason,
        action: topPriority.recommended_action,
        destination: "research" as const,
      }
    : !businessPlan
      ? {
          title: "Generate the first strategic plan",
          reason:
            "The workspace does not yet have a saved business plan.",
          action:
            "Generate a concise plan before making major launch decisions.",
          destination: "plan" as const,
        }
      : processedDocuments.length === 0
        ? {
            title: "Add trusted business evidence",
            reason:
              "The AI has no indexed source material for grounded analysis.",
            action:
              "Upload a trusted PDF in the Business Intelligence Hub.",
            destination: "knowledge" as const,
          }
        : {
            title: "Review the next founder decision",
            reason:
              "The core workspace, strategy, and evidence foundations are present.",
            action:
              "Continue with your AI Co-Founder and turn current evidence into a decision.",
            destination: "cofounder" as const,
          };

  const recentConversation =
    conversations[0] ?? null;

  const latestDocument =
    processedDocuments
      .slice()
      .sort(
        (first, second) =>
          new Date(second.uploaded_at).getTime() -
          new Date(first.uploaded_at).getTime(),
      )[0] ?? null;

  const activity = [
    recentConversation && {
      icon: "◉",
      title: "Co-Founder conversation",
      detail: recentConversation.title,
      date: recentConversation.updated_at,
      destination: "cofounder" as const,
    },
    businessPlan && {
      icon: "▥",
      title: "Business plan generated",
      detail: `Saved with ${businessPlan.model}`,
      date: businessPlan.generated_at,
      destination: "plan" as const,
    },
    latestDocument && {
      icon: "▤",
      title: "Intelligence asset indexed",
      detail: latestDocument.original_filename,
      date:
        latestDocument.processed_at ??
        latestDocument.uploaded_at,
      destination: "knowledge" as const,
    },
    company && {
      icon: "▦",
      title: "Workspace established",
      detail: `${company.name} · ${company.industry}`,
      date: company.created_at,
      destination: "companies" as const,
    },
  ]
    .filter(Boolean)
    .sort(
      (first, second) =>
        new Date(second!.date).getTime() -
        new Date(first!.date).getTime(),
    )
    .slice(0, 5) as Array<{
      icon: string;
      title: string;
      detail: string;
      date: string;
      destination: DashboardDestination;
    }>;

  if (!company) {
    return (
      <section className="panel dashboard-empty">
        <span>✦</span>
        <h1>Welcome to GrowthOS</h1>
        <p>
          Create or select a workspace to open the
          Intelligence Dashboard.
        </p>
        <button
          type="button"
          onClick={() => onOpenView("companies")}
        >
          Open workspaces →
        </button>
      </section>
    );
  }

  return (
    <>
      <header className="dashboard-welcome dashboard-resume-hero">
        <div className="dashboard-ambient-orb" aria-hidden="true" />
        <div>
          <span>{greeting()}, {displayName || "Founder"}</span>
          <h1>Continue where you left off</h1>
          {recentConversation ? (
            <>
              <h2>{recentConversation.title}</h2>
              <p>{recentConversation.last_message_preview || "Resume the latest Executive Team conversation."}</p>
            </>
          ) : (
            <p>Start a focused conversation with your Executive Team and turn it into structured work.</p>
          )}
        </div>

        <div className="dashboard-hero-actions">
          {recentConversation && (
            <button type="button" className="primary-resume" onClick={() => onOpenConversation(recentConversation.id)}>
              <span>↗</span> Resume conversation
            </button>
          )}
          <button type="button" onClick={onStartConversation}>
            <span>＋</span> New executive conversation
          </button>
        </div>
      </header>

      <section className="dashboard-score-grid">
        <article className="dashboard-primary-score">
          <div
            className="dashboard-score-ring"
            style={{
              background: `conic-gradient(
                var(--cyan) ${readinessScore}%,
                rgba(148, 163, 184, .10) 0
              )`,
            }}
          >
            <div>
              <strong>{readinessScore}%</strong>
              <span>ready</span>
            </div>
          </div>

          <div>
            <small>Business readiness</small>
            <h2>
              {readinessScore >= 75
                ? "Strong foundation"
                : readinessScore >= 50
                  ? "Building momentum"
                  : "Foundation in progress"}
            </h2>
            <p>
              A transparent internal score based on
              workspace completeness, indexed evidence,
              saved strategy, and Research Engine progress.
            </p>
          </div>
        </article>

        <article className="dashboard-metric-card">
          <span className="dashboard-metric-icon violet">
            ⌕
          </span>
          <div>
            <small>Research health</small>
            <strong>
              {loadingIntelligence
                ? "…"
                : `${researchScore}%`}
            </strong>
            <p>
              {research
                ? `${research.open_tasks} open · ${research.critical_tasks} critical`
                : "Research summary unavailable."}
            </p>
          </div>
        </article>

        <article className="dashboard-metric-card">
          <span className="dashboard-metric-icon cyan">
            ▤
          </span>
          <div>
            <small>Intelligence</small>
            <strong>
              {processedDocuments.length}
            </strong>
            <p>
              {indexedPages} indexed pages available.
            </p>
          </div>
        </article>

        <article className="dashboard-metric-card">
          <span className="dashboard-metric-icon emerald">
            ◉
          </span>
          <div>
            <small>Conversations</small>
            <strong>
              {loadingIntelligence
                ? "…"
                : conversations.length}
            </strong>
            <p>
              Persistent workspace decision memory.
            </p>
          </div>
        </article>
      </section>

      <section className="dashboard-main-grid">
        <article className="dashboard-recommendation">
          <header>
            <div>
              <span>✦</span>
              <div>
                <small>
                  Highest-impact recommendation
                </small>
                <h2>{recommendation.title}</h2>
              </div>
            </div>

            {topPriority && (
              <em className={`priority-${topPriority.priority}`}>
                {topPriority.priority}
              </em>
            )}
          </header>

          <div className="dashboard-recommendation-body">
            <section>
              <small>Why this matters</small>
              <p>{recommendation.reason}</p>
            </section>

            <section>
              <small>Recommended next action</small>
              <p>{recommendation.action}</p>
            </section>
          </div>

          <footer>
            <button
              type="button"
              onClick={() =>
                onOpenView(
                  recommendation.destination,
                )
              }
            >
              Review recommendation →
            </button>

            <span>
              Based only on information currently
              stored in this workspace.
            </span>
          </footer>
        </article>

        <article className="dashboard-progress-panel">
          <header>
            <div>
              <small>Foundation progress</small>
              <h2>What is supporting decisions?</h2>
            </div>
          </header>

          {[
            {
              label: "Workspace clarity",
              value: workspaceScore,
              destination: "companies" as const,
            },
            {
              label: "Research evidence",
              value: researchScore,
              destination: "research" as const,
            },
            {
              label: "Knowledge coverage",
              value: knowledgeScore,
              destination: "knowledge" as const,
            },
            {
              label: "Strategic plan",
              value: strategyScore,
              destination: "plan" as const,
            },
          ].map((metric) => (
            <button
              type="button"
              key={metric.label}
              onClick={() =>
                onOpenView(metric.destination)
              }
            >
              <span>
                <strong>{metric.label}</strong>
                <em>{metric.value}%</em>
              </span>
              <i>
                <b
                  style={{
                    width: `${metric.value}%`,
                  }}
                />
              </i>
            </button>
          ))}
        </article>
      </section>

      <section className="dashboard-lower-grid">
        <article className="panel dashboard-priorities">
          <header>
            <div>
              <span>⌕</span>
              <div>
                <h2>Today’s priorities</h2>
                <p>
                  The most important unresolved
                  evidence gaps.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onOpenView("research")}
            >
              Open Research Engine
            </button>
          </header>

          {openTasks.length === 0 ? (
            <div className="dashboard-complete-state">
              <span>✓</span>
              <p>
                No open core research tasks. Refresh
                the Research Engine when the strategy
                changes.
              </p>
            </div>
          ) : (
            <div className="dashboard-priority-list">
              {openTasks.slice(0, 4).map((task) => (
                <button
                  type="button"
                  key={task.id}
                  onClick={() =>
                    onOpenView("research")
                  }
                >
                  <span
                    className={`priority-dot priority-${task.priority}`}
                  />
                  <div>
                    <strong>{task.title}</strong>
                    <small>
                      {task.category} ·{" "}
                      {taskStatusLabel(task)}
                    </small>
                  </div>
                  <em>{task.risk_score}% risk</em>
                </button>
              ))}
            </div>
          )}
        </article>

        <article className="panel dashboard-activity">
          <header>
            <div>
              <span>◷</span>
              <div>
                <h2>Recent workspace activity</h2>
                <p>
                  Strategy, evidence, and conversation
                  milestones.
                </p>
              </div>
            </div>
          </header>

          {activity.length === 0 ? (
            <div className="dashboard-complete-state">
              <p>
                Workspace activity will appear here.
              </p>
            </div>
          ) : (
            <div className="dashboard-activity-list">
              {activity.map((item) => (
                <button
                  type="button"
                  key={`${item.title}-${item.date}`}
                  onClick={() =>
                    onOpenView(item.destination)
                  }
                >
                  <span>{item.icon}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </div>
                  <time>
                    {new Date(
                      item.date,
                    ).toLocaleDateString()}
                  </time>
                </button>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="dashboard-continue-card">
        <div>
          <span>
            {recentConversation ? "◉" : "✦"}
          </span>
          <div>
            <small>Continue where you left off</small>
            <h2>
              {recentConversation
                ? recentConversation.title
                : activeDocument
                  ? activeDocument.original_filename
                  : "Start the next founder decision"}
            </h2>
            <p>
              {recentConversation?.last_message_preview ??
                (activeDocument
                  ? "Use the selected intelligence asset with your AI Co-Founder."
                  : "Ask GrowthOS what the most important next action should be.")}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpenView("cofounder")}
        >
          Resume →
        </button>
      </section>
    </>
  );
}
