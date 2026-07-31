import json

import httpx
from pydantic import ValidationError

from app.models.company import Company
from app.schemas.research_project import ResearchDiscovery, ResearchPlanContent
from app.services.answer_service import get_ollama_base_url, get_ollama_model


class ResearchProjectGenerationError(Exception):
    """Raised when the local model cannot create a valid research structure."""


def _company_context(company: Company) -> str:
    values = {
        "Workspace": company.name,
        "Industry": company.industry,
        "Target audience": company.target_audience,
        "Product or service": company.product_description,
        "Business idea": company.business_idea,
        "Problem": company.problem_statement,
        "Solution": company.proposed_solution,
        "Country": company.country,
        "Region": company.region,
        "City": company.city,
        "Business model": company.business_model,
        "Primary goal": company.primary_goal,
        "Development stage": company.development_stage,
    }
    return "\n".join(
        f"{label}: {value}" for label, value in values.items() if value
    ) or "No workspace profile details are available."


def _call_structured_model(*, system: str, user: str, schema: dict, max_tokens: int) -> tuple[dict, str]:
    model = get_ollama_model()
    try:
        response = httpx.post(
            f"{get_ollama_base_url()}/api/chat",
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "stream": False,
                "think": False,
                "keep_alive": "10m",
                "format": schema,
                "options": {
                    "temperature": 0.2,
                    "num_predict": max_tokens,
                    "num_ctx": 8192,
                },
            },
            timeout=httpx.Timeout(connect=10, read=600, write=30, pool=10),
        )
        response.raise_for_status()
        raw = str(response.json().get("message", {}).get("content", "")).strip()
        if not raw:
            raise ResearchProjectGenerationError("Ollama returned an empty response.")
        return json.loads(raw), model
    except httpx.ConnectError as error:
        raise ResearchProjectGenerationError(
            "GrowthOS could not connect to Ollama. Make sure Ollama is running."
        ) from error
    except httpx.TimeoutException as error:
        raise ResearchProjectGenerationError(
            "The local model took too long to structure this research project."
        ) from error
    except httpx.HTTPStatusError as error:
        raise ResearchProjectGenerationError(
            f"Ollama returned HTTP {error.response.status_code}: {error.response.text[:250]}"
        ) from error
    except (ValueError, json.JSONDecodeError) as error:
        raise ResearchProjectGenerationError(
            "Ollama returned invalid structured research data."
        ) from error


def create_discovery(company: Company, goal: str, context: str | None, *, use_workspace_context: bool = True) -> tuple[ResearchDiscovery, str]:
    system = """
You are GrowthOS Research Architect. Convert an incomplete research request into a
clear, topic-agnostic discovery interview.

Rules:
- Work for any legitimate topic. Never assume the request is about farming or any other fixed industry.
- Use the saved workspace only when relevant.
- Ask only questions that materially change scope, method, evidence, comparison, or deliverable.
- Do not ask for information already supplied.
- Prefer 3-7 concise questions. Use zero questions when the request is already sufficiently precise.
- Do not invent external facts, sources, statistics, regulations, prices, or conclusions.
- Questions must be answerable by the user; external facts belong in the later research plan.
- Return valid JSON matching the schema and no markdown.
""".strip()
    user = f"""
RESEARCH REQUEST
{goal}

OPTIONAL USER CONTEXT
{context or 'Not provided'}

SAVED WORKSPACE CONTEXT
{_company_context(company) if use_workspace_context else 'Workspace context intentionally excluded because the user is starting a new, unspecified idea.'}

Create a neutral project title, classify the broad research type, restate the
objective, identify genuinely missing inputs, and list explicit assumptions.
""".strip()
    raw, model = _call_structured_model(
        system=system,
        user=user,
        schema=ResearchDiscovery.model_json_schema(),
        max_tokens=1400,
    )
    try:
        return ResearchDiscovery.model_validate(raw), model
    except ValidationError as error:
        raise ResearchProjectGenerationError(
            "The generated discovery interview did not match the required structure."
        ) from error


def create_plan(
    company: Company,
    goal: str,
    context: str | None,
    project_type: str | None,
    questions: list[dict],
    answers: dict[str, str],
    assumptions: list[str],
    deliverable_type: str,
) -> tuple[ResearchPlanContent, str]:
    qa_lines = []
    for question in questions:
        question_id = str(question.get("id", ""))
        answer = answers.get(question_id, "").strip()
        qa_lines.append(f"Q: {question.get('question', '')}\nA: {answer or 'Not answered'}")

    system = """
You are GrowthOS Research Architect. Produce an evidence-first research plan for
any topic after a guided discovery interview.

Rules:
- Do not perform or pretend to have performed external research.
- Do not invent facts, citations, named competitors, laws, prices, statistics, or findings.
- Define what must be investigated, which evidence types are appropriate, how sources should be evaluated, and how conclusions will be reached.
- Distinguish user-provided inputs from assumptions and unknowns.
- Make the plan specific to the actual request, not to a fixed business type.
- Include primary sources and independent corroboration where appropriate.
- For legal, medical, financial, safety, or regulated topics, include professional verification as a limitation or next action.
- Return valid JSON matching the schema and no markdown.
""".strip()
    user = f"""
PROJECT TYPE
{project_type or 'General research'}

RESEARCH GOAL
{goal}

OPTIONAL CONTEXT
{context or 'Not provided'}

DISCOVERY ANSWERS
{chr(10).join(qa_lines) or 'No clarification questions were required.'}

INITIAL ASSUMPTIONS
{json.dumps(assumptions, ensure_ascii=False)}

REQUESTED DELIVERABLE
{deliverable_type}

SAVED WORKSPACE CONTEXT
{_company_context(company)}

Create a practical research plan that can later drive evidence collection,
analysis, recommendations, and a professional deliverable.
""".strip()
    raw, model = _call_structured_model(
        system=system,
        user=user,
        schema=ResearchPlanContent.model_json_schema(),
        max_tokens=2200,
    )
    try:
        return ResearchPlanContent.model_validate(raw), model
    except ValidationError as error:
        raise ResearchProjectGenerationError(
            "The generated research plan did not match the required structure."
        ) from error


_RESEARCH_PATTERNS = (
    r"\bhelp me (?:explore|research|investigate|validate|think through)\b",
    r"\bi (?:have|had) (?:an?|this) idea\b",
    r"\bi(?:'m| am) (?:thinking|considering|exploring)\b",
    r"\bcould this (?:idea |business |project )?(?:work|be viable)\b",
    r"\bis (?:this|it) worth pursuing\b",
    r"\bi don'?t know what (?:business|idea|project)\b",
    r"\bstart (?:a )?research\b",
    r"\bresearch whether\b",
    r"\bfeasibility (?:study|analysis)\b",
)


def is_research_discovery_intent(message: str) -> bool:
    """Conservative, topic-agnostic detection for exploratory work."""
    import re
    cleaned = " ".join(message.lower().split())
    if len(cleaned) < 6:
        return False
    return any(re.search(pattern, cleaned) for pattern in _RESEARCH_PATTERNS)


_TASK_SWITCH_PATTERNS = (
    r"\b(?:write|draft|rewrite|compose|create)\b.{0,40}\b(?:email|letter|message|reply|proposal|summary|caption|post)\b",
    r"\b(?:send|email)\b.{0,40}\b(?:supplier|customer|client|team|manager|landlord|courier)\b",
    r"\b(?:summari[sz]e|translate|proofread|correct|edit)\b",
    r"\b(?:calculate|convert)\b",
    r"\b(?:new question|different question|another task|change topic|stop research|exit research)\b",
)


def is_direct_task_intent(message: str) -> bool:
    """Return True when a message should interrupt guided discovery.

    These are requests where the user expects an immediate deliverable rather
    than another research question. The check deliberately runs for every
    message so a previous research project cannot contaminate an unrelated
    writing or utility task.
    """
    import re
    cleaned = " ".join(message.lower().split())
    return any(re.search(pattern, cleaned) for pattern in _TASK_SWITCH_PATTERNS)


def should_continue_research(*, message: str, explicit_research_mode: bool, active_project: bool) -> bool:
    """Decide whether this turn belongs to the active discovery interview."""
    if is_direct_task_intent(message):
        return False
    if explicit_research_mode:
        return True
    if not active_project:
        return is_research_discovery_intent(message)

    cleaned = " ".join(message.lower().split())
    exit_phrases = (
        "exit research", "stop research", "cancel research",
        "leave research", "new conversation", "change topic",
    )
    return not any(phrase in cleaned for phrase in exit_phrases)


def discovery_chat_reply(discovery: ResearchDiscovery, project_id: int) -> str:
    del project_id  # Internal identifier; never expose it in the conversation.
    if not discovery.questions:
        return (
            "I understand the direction. Before I shape the research plan, "
            "add any boundary that matters most — budget, location, timing, "
            "or what a successful answer should help you decide. Otherwise, "
            "say **build the plan** and I’ll move ahead."
        )

    first = discovery.questions[0]
    return (
        "Let’s explore that properly without rushing to a conclusion.\n\n"
        f"**{first.question}**\n\n"
        "A rough answer is fine. I’ll ask only what materially changes the research."
    )


def extract_discovery_answers(
    company: Company,
    project_goal: str,
    questions: list[dict],
    existing_answers: dict[str, str],
    user_message: str,
) -> tuple[dict[str, str], str]:
    """Map a natural chat reply onto outstanding discovery questions."""
    outstanding = [q for q in questions if not existing_answers.get(str(q.get("id", "")), "").strip()]
    if not outstanding:
        return {}, get_ollama_model()
    schema = {
        "type": "object",
        "properties": {
            "answers": {
                "type": "object",
                "additionalProperties": {"type": "string"},
            }
        },
        "required": ["answers"],
    }
    system = """
You are GrowthOS Research Architect. Extract only answers that the user actually
provided for the listed discovery questions. Map them by question id. A phrase
such as 'not sure', 'you decide', or 'compare options' is a valid answer. Do not
invent information. Omit unanswered questions. Return JSON only.
""".strip()
    user = f"""
RESEARCH GOAL
{project_goal}

OUTSTANDING QUESTIONS
{json.dumps(outstanding, ensure_ascii=False)}

USER REPLY
{user_message}
""".strip()
    raw, model = _call_structured_model(system=system, user=user, schema=schema, max_tokens=900)
    valid_ids = {str(q.get("id", "")) for q in outstanding}
    answers = {
        str(key): str(value).strip()
        for key, value in raw.get("answers", {}).items()
        if str(key) in valid_ids and str(value).strip()
    }
    return answers, model


def remaining_questions_chat_reply(title: str, questions: list[dict], answers: dict[str, str], project_id: int) -> str:
    del title, project_id  # Retained for API compatibility; not shown to users.
    remaining = [
        q for q in questions
        if q.get("required", True) and not answers.get(str(q.get("id", "")), "").strip()
    ]
    if not remaining:
        return (
            "That gives me enough context to build a focused research plan. "
            "I’ll organise the evidence needed, comparisons, risks, and the final deliverable now."
        )

    next_question = remaining[0].get("question", "What outcome would make this useful for you?")
    transitions = (
        "That helps.",
        "I see the direction more clearly now.",
        "Good — that changes what we should investigate.",
        "Understood. Let’s narrow one more thing.",
    )
    answered_count = sum(1 for value in answers.values() if str(value).strip())
    transition = transitions[answered_count % len(transitions)]
    return (
        f"{transition}\n\n**{next_question}**\n\n"
        "Answer naturally. If you are unsure, say so and I’ll treat it as something to investigate."
    )



def create_isolated_writing_reply(user_request: str) -> tuple[str, str]:
    """Generate a writing deliverable without workspace, research, or persona leakage."""
    system = """
You are GrowthOS Writing Assistant. Complete the user's writing request directly.
Do not start research, ask discovery questions, mention projects, or reuse unrelated
workspace details. When details are missing, use neutral placeholders in square
brackets and provide a polished draft that can be edited. Return only the useful
written deliverable, with a brief heading only when it improves clarity.
""".strip()
    schema = {
        "type": "object",
        "properties": {"content": {"type": "string"}},
        "required": ["content"],
    }
    raw, model = _call_structured_model(
        system=system,
        user=user_request.strip(),
        schema=schema,
        max_tokens=1400,
    )
    content = str(raw.get("content", "")).strip()
    if not content:
        raise ResearchProjectGenerationError("The writing assistant returned an empty response.")
    return content, model
