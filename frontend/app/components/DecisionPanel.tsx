"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  deleteDecision,
  getDecisions,
  updateDecision,
  type Company,
  type Decision,
  type DecisionStatus,
} from "@/lib/api";


const statuses: DecisionStatus[] = [
  "proposed",
  "accepted",
  "in_progress",
  "completed",
  "rejected",
];


export default function DecisionPanel({
  company,
  onError,
  onSuccess,
}: {
  company: Company | null;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}) {
  const [decisions, setDecisions] =
    useState<Decision[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      if (!company) {
        setDecisions([]);
        return;
      }

      setLoading(true);

      try {
        setDecisions(
          await getDecisions(company.id),
        );
      } catch (error) {
        onError(
          error instanceof Error
            ? error.message
            : "Could not load decisions.",
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [company, onError]);

  async function changeStatus(
    decision: Decision,
    status: DecisionStatus,
  ) {
    try {
      const updated = await updateDecision(
        decision.id,
        { status },
      );

      setDecisions((current) =>
        current.map((item) =>
          item.id === updated.id
            ? updated
            : item,
        ),
      );

      onSuccess("Decision status updated.");
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Could not update the decision.",
      );
    }
  }

  async function handoff(
    decision: Decision,
    ownerRole: string,
  ) {
    try {
      const updated = await updateDecision(
        decision.id,
        {
          owner_role: ownerRole,
          status: "in_progress",
          handoff_note:
            `Handed to ${ownerRole.toUpperCase()} for follow-through.`,
        },
      );

      setDecisions((current) =>
        current.map((item) =>
          item.id === updated.id
            ? updated
            : item,
        ),
      );

      onSuccess(
        `Decision handed to ${ownerRole.toUpperCase()}.`,
      );
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Could not hand off the decision.",
      );
    }
  }

  async function remove(decisionId: number) {
    try {
      await deleteDecision(decisionId);
      setDecisions((current) =>
        current.filter(
          (item) => item.id !== decisionId,
        ),
      );
      onSuccess("Decision deleted.");
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Could not delete the decision.",
      );
    }
  }

  if (!company) {
    return (
      <section className="decision-empty">
        <strong>Select a workspace</strong>
        <p>
          Decision Intelligence needs an active business workspace.
        </p>
      </section>
    );
  }

  return (
    <section className="decision-board">
      <header className="decision-board-header">
        <div>
          <span>Decision Intelligence</span>
          <h1>Saved Decisions</h1>
          <p>
            Track recommendations, ownership, confidence, and execution.
          </p>
        </div>

        <strong>
          {decisions.length} decision
          {decisions.length === 1 ? "" : "s"}
        </strong>
      </header>

      {loading ? (
        <div className="decision-empty">
          Loading decisions…
        </div>
      ) : decisions.length === 0 ? (
        <div className="decision-empty">
          <strong>No saved decisions yet</strong>
          <p>
            Open Executive Team and use Save Decision on an AI response.
          </p>
        </div>
      ) : (
        <div className="decision-grid">
          {decisions.map((decision) => (
            <article
              className="decision-card"
              key={decision.id}
            >
              <header>
                <div>
                  <small>
                    {decision.source_executive_role
                      ?.toUpperCase() ??
                      "EXECUTIVE"}
                  </small>
                  <h2>{decision.title}</h2>
                </div>

                <span className={`decision-status ${decision.status}`}>
                  {decision.status.replace("_", " ")}
                </span>
              </header>

              <p>{decision.summary}</p>

              <div className="decision-meta">
                <span>
                  Owner:{" "}
                  <strong>
                    {decision.owner_role
                      ?.toUpperCase() ??
                      "Unassigned"}
                  </strong>
                </span>

                <span>
                  Confidence:{" "}
                  <strong>
                    {decision.confidence_score ?? "—"}
                    {decision.confidence_score !== null
                      ? "/100"
                      : ""}
                  </strong>
                </span>
              </div>

              {decision.handoff_note && (
                <blockquote>
                  {decision.handoff_note}
                </blockquote>
              )}

              <footer>
                <select
                  id={`decision-status-${decision.id}`}
                  name={`decision-status-${decision.id}`}
                  value={decision.status}
                  onChange={(event) =>
                    void changeStatus(
                      decision,
                      event.target.value as DecisionStatus,
                    )
                  }
                >
                  {statuses.map((status) => (
                    <option
                      key={status}
                      value={status}
                    >
                      {status.replace("_", " ")}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() =>
                    void handoff(decision, "coo")
                  }
                >
                  → COO
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void handoff(
                      decision,
                      "research",
                    )
                  }
                >
                  → Research
                </button>

                <button
                  type="button"
                  className="danger"
                  onClick={() =>
                    void remove(decision.id)
                  }
                >
                  Delete
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
