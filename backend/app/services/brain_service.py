from __future__ import annotations

import json
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.company import Company
from app.models.conversation import Conversation
from app.models.chat_message import ChatMessage
from app.models.document import Document
from app.models.research_evidence import ResearchEvidence
from app.models.research_task import ResearchTask
from app.services.smart_context_service import ContextPlan


@dataclass(frozen=True)
class BrainContext:
    """Unified, bounded business memory for one GrowthOS workspace."""

    workspace: str
    business_plan: str
    research: str
    evidence: str
    recent_conversations: str

    def as_prompt_block(self) -> str:
        sections = [
            (
                "WORKSPACE PROFILE",
                self.workspace,
            ),
            (
                "SAVED BUSINESS PLAN",
                self.business_plan,
            ),
            (
                "RESEARCH STATE",
                self.research,
            ),
            (
                "VERIFIED EVIDENCE RECORDS",
                self.evidence,
            ),
            (
                "RECENT DECISION MEMORY",
                self.recent_conversations,
            ),
        ]

        return "\n\n".join(
            f"{title}\n{content}"
            for title, content in sections
            if content.strip()
        )


def _clip(value: object, maximum: int) -> str:
    text = str(value or "").strip()

    if not text:
        return "Not available."

    return text[:maximum]


def _workspace_context(
    company: Company,
    compact: bool,
) -> str:
    maximum = 220 if compact else 420

    fields = {
        "Company": company.name,
        "Industry": company.industry,
        "Development stage": company.development_stage,
        "Business idea": company.business_idea,
        "Problem": company.problem_statement,
        "Solution": company.proposed_solution,
        "Target audience": company.target_audience,
        "Product": company.product_description,
        "Business model": company.business_model,
        "Primary goal": company.primary_goal,
        "Country": company.country,
        "Region": company.region,
        "City": company.city,
        "Launch budget": company.launch_budget,
        "Budget currency": company.budget_currency,
        "Brand tone": company.brand_tone,
    }

    return "\n".join(
        f"{label}: {_clip(value, maximum)}"
        for label, value in fields.items()
    )


def _business_plan_context(
    company: Company,
    compact: bool,
) -> str:
    raw_plan = getattr(company, "business_plan_json", None)

    if not raw_plan:
        return "No saved business plan is available."

    try:
        parsed = json.loads(raw_plan)
        formatted = json.dumps(
            parsed,
            ensure_ascii=False,
        )
    except (json.JSONDecodeError, TypeError):
        formatted = str(raw_plan)

    return formatted[: (2500 if compact else 4300)]


def _research_context(
    database: Session,
    company_id: int,
    compact: bool,
) -> str:
    limit = 4 if compact else 8

    tasks = list(
        database.scalars(
            select(ResearchTask)
            .where(ResearchTask.company_id == company_id)
            .where(
                ResearchTask.status.notin_(
                    ["validated", "dismissed"]
                )
            )
            .order_by(
                ResearchTask.risk_score.desc(),
                ResearchTask.id.asc(),
            )
            .limit(limit)
        ).all()
    )

    if not tasks:
        return "No open research tasks are recorded."

    return "\n\n".join(
        (
            f"- {task.title}\n"
            f"  Category: {task.category}\n"
            f"  Priority: {task.priority}\n"
            f"  Status: {task.status}\n"
            f"  Confidence: {task.confidence_score}%\n"
            f"  Risk: {task.risk_score}%\n"
            f"  Reason: {_clip(task.reason, 420 if compact else 700)}\n"
            f"  Next action: {_clip(task.recommended_action, 360 if compact else 620)}"
        )
        for task in tasks
    )


def _evidence_context(
    database: Session,
    company_id: int,
    compact: bool,
) -> str:
    limit = 3 if compact else 6

    records = list(
        database.execute(
            select(
                ResearchEvidence,
                ResearchTask.title,
                Document.original_filename,
            )
            .join(
                ResearchTask,
                ResearchTask.id
                == ResearchEvidence.research_task_id,
            )
            .outerjoin(
                Document,
                Document.id == ResearchEvidence.document_id,
            )
            .where(
                ResearchTask.company_id == company_id
            )
            .order_by(
                ResearchEvidence.created_at.desc(),
                ResearchEvidence.id.desc(),
            )
            .limit(limit)
        ).all()
    )

    if not records:
        return "No verified research evidence records are available."

    items: list[str] = []

    for evidence, task_title, document_name in records:
        source = (
            document_name
            if document_name
            else evidence.evidence_type
        )

        items.append(
            (
                f"- {evidence.title}\n"
                f"  Research task: {task_title}\n"
                f"  Source: {source}\n"
                f"  Finding: {_clip(evidence.summary, 460 if compact else 760)}"
            )
        )

    return "\n\n".join(items)


def _recent_conversation_context(
    database: Session,
    company_id: int,
    current_conversation_id: int | None,
    compact: bool,
) -> str:
    conversation_limit = 2 if compact else 4
    message_limit = 2 if compact else 4

    conversations = list(
        database.scalars(
            select(Conversation)
            .where(Conversation.company_id == company_id)
            .where(
                Conversation.id != current_conversation_id
                if current_conversation_id is not None
                else True
            )
            .order_by(
                Conversation.updated_at.desc(),
                Conversation.id.desc(),
            )
            .limit(conversation_limit)
        ).all()
    )

    if not conversations:
        return "No previous conversation memory is available."

    blocks: list[str] = []

    for conversation in conversations:
        messages = list(
            database.scalars(
                select(ChatMessage)
                .where(
                    ChatMessage.conversation_id
                    == conversation.id
                )
                .order_by(
                    ChatMessage.created_at.desc(),
                    ChatMessage.id.desc(),
                )
                .limit(message_limit)
            ).all()
        )

        messages.reverse()

        if not messages:
            continue

        transcript = "\n".join(
            (
                f"{message.role.upper()}: "
                f"{_clip(message.content, 520 if compact else 850)}"
            )
            for message in messages
        )

        blocks.append(
            f"Conversation: {conversation.title}\n{transcript}"
        )

    return (
        "\n\n".join(blocks)
        if blocks
        else "No previous conversation memory is available."
    )


def build_brain_context(
    database: Session,
    company: Company,
    *,
    plan: ContextPlan,
    current_conversation_id: int | None = None,
    compact: bool = False,
) -> BrainContext:
    """
    Build only the business-memory sections selected by ContextPlan.

    Empty sections are omitted from the final prompt. This keeps local
    model prompts focused while preserving the same unified Brain API.
    """

    return BrainContext(
        workspace=(
            _workspace_context(
                company,
                compact,
            )
            if plan.include_workspace
            else ""
        ),
        business_plan=(
            _business_plan_context(
                company,
                compact,
            )
            if plan.include_business_plan
            else ""
        ),
        research=(
            _research_context(
                database,
                company.id,
                compact,
            )
            if plan.include_research
            else ""
        ),
        evidence=(
            _evidence_context(
                database,
                company.id,
                compact,
            )
            if plan.include_evidence
            else ""
        ),
        recent_conversations=(
            _recent_conversation_context(
                database,
                company.id,
                current_conversation_id,
                compact,
            )
            if plan.include_recent_conversations
            else ""
        ),
    )
