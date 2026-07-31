"""Deterministic first-pass conversation orchestration.

This layer runs before executive personas or research prompts. Its job is not to
answer the user; it prevents stale project state from contaminating unrelated
requests and gives each specialist a clean, explicit task.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

Intent = Literal[
    "direct_writing",
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


_WRITING = re.compile(
    r"\b(?:write|draft|compose|rewrite|prepare|create)\b.{0,80}"
    r"\b(?:email|letter|message|reply|response|proposal|post|caption|summary|memo|notice)\b",
    re.I,
)
_RESEARCH_START = re.compile(
    r"\b(?:i have an idea|i've got an idea|help me (?:research|explore|validate|investigate)|"
    r"research whether|compare (?:providers|options|suppliers|products)|find (?:the )?best)\b",
    re.I,
)
_RESUME = re.compile(
    r"\b(?:continue|resume|go back to|return to|pick up)\b.{0,50}\b(?:idea|research|project|plan)\b",
    re.I,
)
_EXIT = re.compile(r"\b(?:exit|stop|cancel|leave)\s+research\b|\bchange topic\b", re.I)
_NEW_TOPIC = re.compile(r"\b(?:new question|different question|another task|separate task)\b", re.I)


def decide(message: str, *, active_research: bool, explicit_research_mode: bool) -> OrchestrationDecision:
    text = " ".join((message or "").split()).strip()

    if _WRITING.search(text):
        return OrchestrationDecision(
            intent="direct_writing",
            continue_active_research=False,
            detach_active_research=active_research,
            use_workspace_context=False,
            specialist="writer",
            reason="The user requested an immediate written deliverable.",
        )

    if _EXIT.search(text) or _NEW_TOPIC.search(text):
        return OrchestrationDecision(
            intent="exit_research",
            continue_active_research=False,
            detach_active_research=active_research,
            use_workspace_context=False,
            specialist="general",
            reason="The user explicitly changed or exited the active topic.",
        )

    if _RESUME.search(text):
        return OrchestrationDecision(
            intent="resume_research",
            continue_active_research=active_research,
            detach_active_research=False,
            use_workspace_context=True,
            specialist="research",
            reason="The user explicitly asked to resume existing work.",
        )

    if _RESEARCH_START.search(text):
        # A vague new idea is intentionally isolated from the workspace. This
        # prevents an active company profile from silently becoming the idea.
        vague_new_idea = bool(re.fullmatch(r"(?:i have an idea|i've got an idea)[.!?]*", text, re.I))
        return OrchestrationDecision(
            intent="research_start",
            continue_active_research=True,
            detach_active_research=active_research and vague_new_idea,
            use_workspace_context=not vague_new_idea,
            specialist="research",
            reason="The user asked to explore or research a topic.",
        )

    if active_research and explicit_research_mode:
        return OrchestrationDecision(
            intent="research_continue",
            continue_active_research=True,
            detach_active_research=False,
            use_workspace_context=True,
            specialist="research",
            reason="Research mode is explicit and the message is not a direct task switch.",
        )

    if active_research:
        # Do not make research sticky in Auto mode. A plain message is handled
        # as a normal task unless it explicitly resumes or answers discovery.
        # Short natural answers are allowed to continue the current interview.
        looks_like_answer = len(text.split()) <= 35 and not text.endswith("?")
        return OrchestrationDecision(
            intent="research_continue" if looks_like_answer else "general",
            continue_active_research=looks_like_answer,
            detach_active_research=not looks_like_answer,
            use_workspace_context=looks_like_answer,
            specialist="research" if looks_like_answer else "general",
            reason="A concise answer continues discovery; otherwise Auto mode starts a clean task.",
        )

    return OrchestrationDecision(
        intent="general",
        continue_active_research=False,
        detach_active_research=False,
        use_workspace_context=True,
        specialist="general",
        reason="No specialist workflow was required.",
    )
