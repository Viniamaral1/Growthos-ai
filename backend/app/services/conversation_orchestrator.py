"""Deterministic conversation orchestration before specialist prompts.

High-risk task switches are classified here so workspace context, research
state, and executive personas cannot contaminate unrelated requests.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

Intent = Literal[
    "greeting",
    "direct_writing",
    "utility",
    "research_start",
    "research_continue",
    "resume_research",
    "exit_research",
    "general",
]


@dataclass(frozen=True)
class OrchestrationDecision:
    intent: Intent
    continue_active_research: bool
    detach_active_research: bool
    use_workspace_context: bool
    specialist: str
    reason: str


_GREETING = re.compile(r"^(?:hi|hello|hey|good (?:morning|afternoon|evening))[!. ]*$", re.I)
_WRITING = re.compile(
    r"\b(?:write|draft|compose|rewrite|prepare|create|polish|improve)\b.{0,120}"
    r"\b(?:email|letter|message|reply|response|proposal|post|caption|summary|memo|notice|script|copy|bio|description)\b",
    re.I,
)
_UTILITY = re.compile(
    r"\b(?:what(?:'s| is) the weather|weather (?:today|tomorrow|forecast)|current time|what time is it|"
    r"calculate|convert|translate)\b",
    re.I,
)
_VAGUE_IDEA = re.compile(r"^(?:i have an idea|i've got an idea|i have a new idea)[.! ]*$", re.I)
_RESEARCH_START = re.compile(
    r"\b(?:help me (?:research|explore|validate|investigate|compare)|research whether|"
    r"compare (?:courier|delivery|provider|supplier|product|option|company|service)s?|"
    r"find (?:the )?best (?:courier|delivery|provider|supplier|option)|"
    r"feasibility (?:study|analysis)|i have an idea|i've got an idea|"
    r"is (?:this|it) worth pursuing|could this (?:idea|business|project)? ?work)\b",
    re.I,
)
_RESUME = re.compile(
    r"\b(?:continue|resume|go back to|return to|pick up)\b.{0,80}\b(?:idea|research|project|plan)\b",
    re.I,
)
_EXIT = re.compile(
    r"\b(?:exit|stop|cancel|leave)\s+research\b|"
    r"\b(?:change topic|new question|different question|another task|separate task)\b",
    re.I,
)
_QUESTION_START = re.compile(
    r"^(?:what|why|how|when|where|who|which|can|could|would|should|is|are|do|does|please|tell|explain|show|list|check)\b",
    re.I,
)


def _looks_like_discovery_answer(text: str) -> bool:
    if not text or _GREETING.fullmatch(text):
        return False
    if text.endswith("?") or _QUESTION_START.match(text):
        return False
    return len(text.split()) <= 60


def decide(
    message: str,
    *,
    active_research: bool,
    paused_research: bool = False,
    explicit_research_mode: bool,
    active_research_status: str | None = None,
) -> OrchestrationDecision:
    text = " ".join((message or "").split()).strip()

    if _GREETING.fullmatch(text):
        return OrchestrationDecision("greeting", False, False, False, "general", "Simple greeting.")

    if _WRITING.search(text):
        return OrchestrationDecision(
            "direct_writing", False, active_research, False, "writer",
            "Immediate writing deliverable requested; pause research and isolate this turn.",
        )

    if _UTILITY.search(text):
        return OrchestrationDecision(
            "utility", False, active_research, False, "general",
            "Utility/current-information request must not inherit business or research context.",
        )

    if _EXIT.search(text):
        return OrchestrationDecision(
            "exit_research", False, active_research, False, "general",
            "The user explicitly exited or changed the active topic.",
        )

    if _RESUME.search(text):
        available = active_research or paused_research
        return OrchestrationDecision(
            "resume_research", available, False, False,
            "research" if available else "general",
            "The user explicitly asked to resume saved research." if available else "No saved research is available.",
        )

    if _VAGUE_IDEA.fullmatch(text):
        return OrchestrationDecision(
            "research_start", True, active_research, False, "research",
            "A new unspecified idea starts in isolation from the active workspace.",
        )

    if _RESEARCH_START.search(text):
        return OrchestrationDecision(
            "research_start", True, active_research, False, "research",
            "The user explicitly requested exploration, comparison, or research.",
        )

    if active_research and explicit_research_mode:
        return OrchestrationDecision(
            "research_continue", True, False, False, "research",
            "Research mode is explicitly active.",
        )

    if active_research and active_research_status == "discovery" and _looks_like_discovery_answer(text):
        return OrchestrationDecision(
            "research_continue", True, False, False, "research",
            "The message is a concise answer to the current discovery question.",
        )

    return OrchestrationDecision(
        "general", False, active_research, True, "general",
        "A standalone task starts cleanly outside guided research.",
    )
