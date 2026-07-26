from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ConfidenceAssessment:
    level: str
    score: int
    reason: str
    evidence_count: int

    def prompt_block(self) -> str:
        return (
            f"Level: {self.level}\n"
            f"Score: {self.score}/100\n"
            f"Evidence records: {self.evidence_count}\n"
            f"Reason: {self.reason}"
        )


def assess_confidence(
    *,
    source_count: int,
    document_scope_enabled: bool,
    has_workspace_context: bool = True,
) -> ConfidenceAssessment:
    """
    Produce a conservative evidence-confidence estimate.

    This score measures available grounding, not whether the model's
    recommendation is objectively correct.
    """

    score = 35

    if has_workspace_context:
        score += 15

    if source_count > 0:
        score += min(source_count, 3) * 15

    if document_scope_enabled and source_count == 0:
        score -= 10

    score = max(20, min(score, 90))

    if score >= 75:
        level = "high"
        reason = (
            "The recommendation has workspace context and multiple "
            "retrieved evidence records."
        )
    elif score >= 50:
        level = "medium"
        reason = (
            "The recommendation has business context but limited "
            "direct documentary evidence."
        )
    else:
        level = "low"
        reason = (
            "The recommendation relies mainly on workspace context "
            "or assumptions and needs further validation."
        )

    return ConfidenceAssessment(
        level=level,
        score=score,
        reason=reason,
        evidence_count=source_count,
    )
