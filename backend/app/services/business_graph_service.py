from __future__ import annotations

from collections import Counter
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.company import Company
from app.models.decision import Decision
from app.models.document import Document
from app.models.executive_memory import ExecutiveMemory
from app.models.knowledge_item import KnowledgeItem
from app.models.knowledge_space import KnowledgeSpace
from app.models.research_task import ResearchTask
from app.schemas.business_graph import (
    BusinessGraphEdge,
    BusinessGraphInsight,
    BusinessGraphNode,
    BusinessGraphResponse,
)


def _clip(value: object, maximum: int = 110) -> str:
    text = " ".join(str(value or "").split())
    return text if len(text) <= maximum else f"{text[: maximum - 1].rstrip()}…"


def build_business_graph(database: Session, company_id: int) -> BusinessGraphResponse:
    company = database.get(Company, company_id)
    if company is None:
        raise ValueError("Workspace not found")

    spaces = list(database.scalars(
        select(KnowledgeSpace)
        .where(KnowledgeSpace.company_id == company_id)
        .where(KnowledgeSpace.is_archived.is_(False))
        .order_by(KnowledgeSpace.updated_at.desc())
        .limit(30)
    ).all())
    items = list(database.scalars(
        select(KnowledgeItem)
        .where(KnowledgeItem.company_id == company_id)
        .order_by(KnowledgeItem.updated_at.desc())
        .limit(80)
    ).all())
    documents = list(database.scalars(
        select(Document)
        .where(Document.company_id == company_id)
        .order_by(Document.uploaded_at.desc())
        .limit(40)
    ).all())
    decisions = list(database.scalars(
        select(Decision)
        .where(Decision.company_id == company_id)
        .order_by(Decision.updated_at.desc())
        .limit(30)
    ).all())
    memories = list(database.scalars(
        select(ExecutiveMemory)
        .where(ExecutiveMemory.company_id == company_id)
        .where(ExecutiveMemory.is_archived.is_(False))
        .order_by(ExecutiveMemory.importance.desc(), ExecutiveMemory.updated_at.desc())
        .limit(30)
    ).all())
    research = list(database.scalars(
        select(ResearchTask)
        .where(ResearchTask.company_id == company_id)
        .order_by(ResearchTask.risk_score.desc(), ResearchTask.updated_at.desc())
        .limit(30)
    ).all())

    root_id = f"workspace:{company.id}"
    nodes: list[BusinessGraphNode] = [BusinessGraphNode(
        id=root_id,
        kind="workspace",
        label=company.name,
        subtitle=_clip(company.primary_goal or company.product_description or company.industry),
        status=company.development_stage,
        importance=5,
        source_id=company.id,
    )]
    edges: list[BusinessGraphEdge] = []

    for space in spaces:
        node_id = f"space:{space.id}"
        count = sum(1 for item in items if item.space_id == space.id)
        nodes.append(BusinessGraphNode(
            id=node_id,
            kind="knowledge_space",
            label=space.name,
            subtitle=f"{count} captured item{'s' if count != 1 else ''}",
            importance=4 if count else 2,
            source_id=space.id,
        ))
        edges.append(BusinessGraphEdge(source=root_id, target=node_id, relationship="contains knowledge"))

    visible_item_ids: set[int] = set()
    for item in items[:35]:
        visible_item_ids.add(item.id)
        node_id = f"knowledge:{item.id}"
        nodes.append(BusinessGraphNode(
            id=node_id,
            kind="knowledge",
            label=item.title,
            subtitle=_clip(item.summary),
            status=item.item_type,
            importance=3,
            source_id=item.id,
        ))
        edges.append(BusinessGraphEdge(
            source=f"space:{item.space_id}",
            target=node_id,
            relationship="stores",
        ))

    for document in documents[:24]:
        node_id = f"document:{document.id}"
        nodes.append(BusinessGraphNode(
            id=node_id,
            kind="document",
            label=document.original_filename,
            subtitle=_clip(document.extracted_text or document.content_type),
            status=document.processing_status,
            importance=3 if document.processing_status == "processed" else 2,
            source_id=document.id,
        ))
        edges.append(BusinessGraphEdge(source=root_id, target=node_id, relationship="uses source"))

    for decision in decisions[:20]:
        node_id = f"decision:{decision.id}"
        importance = 5 if decision.status in {"approved", "active"} else 4
        nodes.append(BusinessGraphNode(
            id=node_id,
            kind="decision",
            label=decision.title,
            subtitle=_clip(decision.summary),
            status=decision.status,
            importance=importance,
            source_id=decision.id,
        ))
        edges.append(BusinessGraphEdge(source=root_id, target=node_id, relationship="made decision"))

    for memory in memories[:16]:
        node_id = f"memory:{memory.id}"
        nodes.append(BusinessGraphNode(
            id=node_id,
            kind="memory",
            label=memory.title,
            subtitle=_clip(memory.summary),
            status=memory.memory_type,
            importance=max(1, min(5, round(memory.importance / 2))),
            source_id=memory.id,
        ))
        edges.append(BusinessGraphEdge(source=root_id, target=node_id, relationship="remembers"))

    for task in research[:18]:
        node_id = f"research:{task.id}"
        nodes.append(BusinessGraphNode(
            id=node_id,
            kind="research",
            label=task.title,
            subtitle=_clip(task.reason),
            status=task.status,
            importance=5 if task.risk_score >= 75 else 4 if task.risk_score >= 50 else 3,
            source_id=task.id,
        ))
        edges.append(BusinessGraphEdge(source=root_id, target=node_id, relationship="needs evidence"))

    insights: list[BusinessGraphInsight] = []
    open_decisions = [d for d in decisions if d.status not in {"completed", "dismissed", "rejected"}]
    high_risk = [t for t in research if t.risk_score >= 70 and t.status not in {"validated", "dismissed"}]
    processed = [d for d in documents if d.processing_status == "processed"]
    item_types = Counter(item.item_type for item in items)

    if high_risk:
        insights.append(BusinessGraphInsight(
            level="risk",
            title=f"{len(high_risk)} high-risk evidence gap{'s' if len(high_risk) != 1 else ''}",
            summary="Research tasks with high risk are still unresolved and may weaken executive recommendations.",
            evidence=[task.title for task in high_risk[:3]],
            recommended_action="Review the highest-risk research task and add or validate supporting evidence.",
            target_kind="research",
        ))
    if open_decisions:
        insights.append(BusinessGraphInsight(
            level="attention",
            title=f"{len(open_decisions)} active decision{'s' if len(open_decisions) != 1 else ''}",
            summary="These decisions remain part of the current business state and should be reviewed as new evidence arrives.",
            evidence=[decision.title for decision in open_decisions[:3]],
            recommended_action="Review active decisions against the newest evidence and close any that are complete.",
            target_kind="decision",
        ))
    if processed:
        insights.append(BusinessGraphInsight(
            level="strength",
            title=f"{len(processed)} processed business source{'s' if len(processed) != 1 else ''}",
            summary="GrowthOS can use these sources as evidence across Knowledge, search, and executive workflows.",
            evidence=[document.original_filename for document in processed[:3]],
            recommended_action="Keep important sources current so recommendations remain grounded.",
            target_kind="document",
        ))
    if item_types:
        leading_type, count = item_types.most_common(1)[0]
        insights.append(BusinessGraphInsight(
            level="pattern",
            title=f"Knowledge is strongest in {leading_type}",
            summary=f"{count} captured items are classified as {leading_type}. This shows where the workspace currently has the most reusable context.",
            evidence=[],
            recommended_action="Capture missing decisions, risks, or evidence to balance the workspace knowledge base.",
            target_kind="knowledge",
        ))

    evidence_score = min(30, len(processed) * 2)
    knowledge_score = min(20, len(items))
    memory_score = min(10, len(memories) * 2)
    risk_penalty = min(35, len(high_risk) * 9)
    decision_penalty = min(20, len(open_decisions) * 2)
    health_score = max(0, min(100, 40 + evidence_score + knowledge_score + memory_score - risk_penalty - decision_penalty))

    if health_score >= 80:
        health_label = "Strong"
    elif health_score >= 60:
        health_label = "Stable"
    elif health_score >= 40:
        health_label = "Needs attention"
    else:
        health_label = "At risk"

    if high_risk:
        executive_summary = (
            f"{company.name} has {len(high_risk)} high-risk evidence gap"
            f"{'s' if len(high_risk) != 1 else ''}. Resolve the highest-risk gap before relying on major recommendations."
        )
    elif open_decisions:
        executive_summary = (
            f"{company.name} has {len(open_decisions)} active decision"
            f"{'s' if len(open_decisions) != 1 else ''} to review against current evidence."
        )
    elif processed:
        executive_summary = (
            f"{company.name} has a growing evidence base with {len(processed)} processed source"
            f"{'s' if len(processed) != 1 else ''} ready for executive workflows."
        )
    else:
        executive_summary = f"Add trusted business sources to strengthen {company.name}'s executive intelligence."

    return BusinessGraphResponse(
        company_id=company_id,
        generated_from={
            "knowledge_spaces": len(spaces),
            "knowledge_items": len(items),
            "documents": len(documents),
            "decisions": len(decisions),
            "memories": len(memories),
            "research_tasks": len(research),
        },
        health_score=health_score,
        health_label=health_label,
        executive_summary=executive_summary,
        nodes=nodes,
        edges=edges,
        insights=insights[:6],
    )
