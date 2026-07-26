from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class ContextPlan:
    """
    A deterministic context plan for a local model.

    The planner does not call an LLM. It uses conservative keyword
    matching so context selection remains fast, predictable, and cheap.
    """

    intent: str
    include_workspace: bool = True
    include_business_plan: bool = True
    include_research: bool = True
    include_evidence: bool = True
    include_recent_conversations: bool = False
    include_document_rag: bool = False
    history_messages: int = 4
    history_characters: int = 900
    rag_limit: int = 1
    rag_characters: int = 720
    response_tokens: int = 260
    context_window: int = 2048

    def summary(self) -> str:
        enabled = [
            label
            for label, included in [
                ("workspace", self.include_workspace),
                ("plan", self.include_business_plan),
                ("research", self.include_research),
                ("evidence", self.include_evidence),
                (
                    "previous conversations",
                    self.include_recent_conversations,
                ),
                ("document retrieval", self.include_document_rag),
            ]
            if included
        ]

        return (
            f"Intent: {self.intent}. "
            f"Selected context: {', '.join(enabled)}."
        )


_WORD_GROUPS: dict[str, set[str]] = {
    "finance": {
        "price",
        "pricing",
        "cost",
        "costs",
        "revenue",
        "profit",
        "margin",
        "cash",
        "cashflow",
        "cash flow",
        "runway",
        "budget",
        "finance",
        "financial",
        "unit economics",
        "cac",
        "ltv",
        "break even",
        "breakeven",
        "forecast",
    },
    "marketing": {
        "marketing",
        "campaign",
        "brand",
        "positioning",
        "message",
        "messaging",
        "audience",
        "customer",
        "customers",
        "persona",
        "segment",
        "acquisition",
        "channel",
        "social media",
        "advert",
        "ads",
        "promotion",
        "content",
        "conversion",
    },
    "research": {
        "research",
        "evidence",
        "validate",
        "validation",
        "assumption",
        "assumptions",
        "confidence",
        "risk",
        "uncertain",
        "uncertainty",
        "interview",
        "survey",
        "market data",
        "source",
        "sources",
        "verified",
        "proof",
    },
    "operations": {
        "operations",
        "operational",
        "process",
        "workflow",
        "delivery",
        "supplier",
        "staff",
        "hiring",
        "team",
        "sop",
        "capacity",
        "quality",
        "implementation",
        "execute",
        "execution",
        "roadmap",
    },
    "strategy": {
        "strategy",
        "strategic",
        "business model",
        "launch",
        "expand",
        "expansion",
        "priority",
        "priorities",
        "decision",
        "decide",
        "next step",
        "next action",
        "goal",
        "vision",
        "market",
        "competitor",
        "competition",
        "value proposition",
    },
    "history": {
        "previous conversation",
        "previous conversations",
        "earlier conversation",
        "earlier conversations",
        "last conversation",
        "we discussed",
        "we decided",
        "did we decide",
        "what did i say",
        "what did we say",
        "history",
        "remember",
        "before",
        "previously",
        "unresolved",
    },
    "documents": {
        "document",
        "documents",
        "pdf",
        "uploaded",
        "file",
        "files",
        "report",
        "contract",
        "proposal",
        "pitch deck",
        "deck",
        "spreadsheet",
        "interview transcript",
        "according to",
        "cite",
        "citation",
        "page",
    },
    "summary": {
        "summarise",
        "summarize",
        "summary",
        "overview",
        "everything",
        "what do you know",
        "current state",
        "business status",
        "company status",
    },
}


def _normalise(question: str) -> str:
    return re.sub(
        r"\s+",
        " ",
        question.lower(),
    ).strip()


def _contains_any(
    text: str,
    terms: set[str],
) -> bool:
    return any(term in text for term in terms)


def plan_context(
    question: str,
    *,
    compact: bool = False,
    document_scope_enabled: bool = False,
) -> ContextPlan:
    """
    Select the smallest useful context for a question.

    The plan deliberately prefers excluding unrelated memory. A local
    4B model usually performs better with focused context than with a
    large prompt containing every workspace record.
    """

    text = _normalise(question)

    matches = {
        name: _contains_any(text, terms)
        for name, terms in _WORD_GROUPS.items()
    }

    if matches["history"]:
        intent = "conversation_history"
    elif matches["summary"]:
        intent = "business_summary"
    elif matches["finance"]:
        intent = "finance_and_pricing"
    elif matches["marketing"]:
        intent = "marketing_and_customers"
    elif matches["research"]:
        intent = "research_and_validation"
    elif matches["operations"]:
        intent = "operations_and_execution"
    elif matches["strategy"]:
        intent = "strategy_and_decisions"
    else:
        intent = "general_business_support"

    include_documents = (
        document_scope_enabled
        and (
            matches["documents"]
            or matches["research"]
            or matches["finance"]
            or matches["marketing"]
        )
    )

    plans: dict[str, ContextPlan] = {
        "conversation_history": ContextPlan(
            intent=intent,
            include_workspace=True,
            include_business_plan=False,
            include_research=False,
            include_evidence=False,
            include_recent_conversations=True,
            include_document_rag=False,
            history_messages=5,
            history_characters=760,
            response_tokens=360,
        ),
        "business_summary": ContextPlan(
            intent=intent,
            include_workspace=True,
            include_business_plan=True,
            include_research=True,
            include_evidence=True,
            include_recent_conversations=False,
            include_document_rag=False,
            history_messages=2,
            history_characters=550,
            response_tokens=460,
        ),
        "finance_and_pricing": ContextPlan(
            intent=intent,
            include_workspace=True,
            include_business_plan=True,
            include_research=True,
            include_evidence=True,
            include_recent_conversations=False,
            include_document_rag=include_documents,
            history_messages=3,
            history_characters=700,
            rag_limit=1,
            rag_characters=650,
            response_tokens=420,
        ),
        "marketing_and_customers": ContextPlan(
            intent=intent,
            include_workspace=True,
            include_business_plan=True,
            include_research=True,
            include_evidence=True,
            include_recent_conversations=False,
            include_document_rag=include_documents,
            history_messages=3,
            history_characters=700,
            rag_limit=1,
            rag_characters=680,
            response_tokens=440,
        ),
        "research_and_validation": ContextPlan(
            intent=intent,
            include_workspace=True,
            include_business_plan=False,
            include_research=True,
            include_evidence=True,
            include_recent_conversations=False,
            include_document_rag=include_documents,
            history_messages=3,
            history_characters=650,
            rag_limit=2,
            rag_characters=680,
            response_tokens=420,
        ),
        "operations_and_execution": ContextPlan(
            intent=intent,
            include_workspace=True,
            include_business_plan=True,
            include_research=True,
            include_evidence=False,
            include_recent_conversations=False,
            include_document_rag=False,
            history_messages=3,
            history_characters=700,
            response_tokens=420,
        ),
        "strategy_and_decisions": ContextPlan(
            intent=intent,
            include_workspace=True,
            include_business_plan=True,
            include_research=True,
            include_evidence=True,
            include_recent_conversations=False,
            include_document_rag=include_documents,
            history_messages=4,
            history_characters=720,
            rag_limit=1,
            rag_characters=650,
            response_tokens=440,
        ),
        "general_business_support": ContextPlan(
            intent=intent,
            include_workspace=True,
            include_business_plan=False,
            include_research=False,
            include_evidence=False,
            include_recent_conversations=False,
            include_document_rag=False,
            history_messages=4,
            history_characters=750,
            response_tokens=360,
        ),
    }

    selected = plans[intent]

    if not compact:
        return selected

    return ContextPlan(
        intent=f"{selected.intent}_compact",
        include_workspace=selected.include_workspace,
        include_business_plan=selected.include_business_plan,
        include_research=selected.include_research,
        include_evidence=selected.include_evidence,
        include_recent_conversations=(
            selected.include_recent_conversations
        ),
        include_document_rag=selected.include_document_rag,
        history_messages=min(
            selected.history_messages,
            2,
        ),
        history_characters=min(
            selected.history_characters,
            480,
        ),
        rag_limit=min(selected.rag_limit, 1),
        rag_characters=min(
            selected.rag_characters,
            460,
        ),
        response_tokens=min(
            selected.response_tokens,
            180,
        ),
        context_window=1536,
    )
