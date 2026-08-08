from __future__ import annotations

from collections import Counter
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.company import Company
from app.models.business_entity import (
    BusinessEntity,
    BusinessEntityExtraction,
    BusinessEntitySource,
)
from app.models.decision import Decision
from app.models.document import Document
from app.models.executive_memory import ExecutiveMemory
from app.models.knowledge_item import KnowledgeItem
from app.models.knowledge_space import KnowledgeSpace
from app.models.research_task import ResearchTask
from app.schemas.business_graph import (
    BusinessGraphEdge,
    BusinessGraphInsight,
    BusinessEntityDetail,
    BusinessEntityEvidenceSource,
    BusinessEntityIndexStatus,
    BusinessEntityRelated,
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
    entities = list(database.scalars(
        select(BusinessEntity)
        .where(BusinessEntity.company_id == company_id)
        .order_by(BusinessEntity.confidence.desc(), BusinessEntity.updated_at.desc())
        .limit(40)
    ).all())
    entity_sources = list(database.scalars(
        select(BusinessEntitySource)
        .where(BusinessEntitySource.company_id == company_id)
        .order_by(BusinessEntitySource.confidence.desc())
        .limit(120)
    ).all())
    extraction_states = list(database.scalars(
        select(BusinessEntityExtraction)
        .where(BusinessEntityExtraction.company_id == company_id)
        .where(BusinessEntityExtraction.source_kind == "document")
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

    available_node_ids = {node.id for node in nodes}
    source_links_by_entity: dict[int, list[BusinessEntitySource]] = {}
    for link in entity_sources:
        source_links_by_entity.setdefault(link.entity_id, []).append(link)

    for entity in entities[:30]:
        node_id = f"entity:{entity.id}"
        links = source_links_by_entity.get(entity.id, [])
        source_document_ids = sorted({
            link.source_id for link in links if link.source_kind == "document"
        })
        if not source_document_ids and entity.source_kind == "document" and entity.source_id is not None:
            source_document_ids = [entity.source_id]
        nodes.append(BusinessGraphNode(
            id=node_id,
            kind="entity",
            label=entity.name,
            subtitle=_clip(entity.description or entity.evidence),
            status=entity.entity_type,
            importance=5 if entity.confidence >= 0.85 else 4 if entity.confidence >= 0.65 else 3,
            source_id=entity.id,
            source_count=len(links) if links else (1 if entity.source_id is not None else 0),
            source_document_ids=source_document_ids,
        ))

        if links:
            for link in links[:6]:
                source_node_id = f"{link.source_kind}:{link.source_id}"
                if source_node_id in available_node_ids:
                    edges.append(BusinessGraphEdge(
                        source=source_node_id,
                        target=node_id,
                        relationship="mentions entity",
                    ))
        else:
            source_node_id = (
                f"{entity.source_kind}:{entity.source_id}"
                if entity.source_kind and entity.source_id is not None
                else root_id
            )
            if source_node_id not in available_node_ids:
                source_node_id = root_id
            edges.append(BusinessGraphEdge(
                source=source_node_id,
                target=node_id,
                relationship="mentions entity",
            ))

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
    if entities:
        entity_types = Counter(entity.entity_type for entity in entities)
        leading_entity_type, entity_count = entity_types.most_common(1)[0]
        insights.append(BusinessGraphInsight(
            level="pattern",
            title=f"{entity_count} recognised {leading_entity_type} entit{'y' if entity_count == 1 else 'ies'}",
            summary="AI-extracted entities make suppliers, people, products, contracts, risks, and opportunities easier to connect across business records.",
            evidence=[entity.name for entity in entities[:3]],
            recommended_action="Review the entity map and refresh it after important new documents or decisions are added.",
            target_kind="entity",
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

    processed_document_ids = {document.id for document in documents if document.processing_status == "processed"}
    completed_document_ids = {
        state.source_id for state in extraction_states
        if state.status in {"completed", "partial"} and state.source_id in processed_document_ids
    }
    failed_document_ids = {
        state.source_id for state in extraction_states
        if state.status == "failed" and state.source_id in processed_document_ids
    }
    entity_index = BusinessEntityIndexStatus(
        processed_documents=len(processed_document_ids),
        mapped_documents=len(completed_document_ids),
        pending_documents=max(0, len(processed_document_ids - completed_document_ids)),
        failed_documents=len(failed_document_ids),
    )

    return BusinessGraphResponse(
        company_id=company_id,
        generated_from={
            "knowledge_spaces": len(spaces),
            "knowledge_items": len(items),
            "documents": len(documents),
            "decisions": len(decisions),
            "memories": len(memories),
            "research_tasks": len(research),
            "entities": len(entities),
        },
        health_score=health_score,
        health_label=health_label,
        executive_summary=executive_summary,
        nodes=nodes,
        edges=edges,
        insights=insights[:6],
        entity_index=entity_index,
    )


def _source_title(database: Session, source_kind: str, source_id: int) -> str:
    if source_kind == "document":
        source = database.get(Document, source_id)
        return source.original_filename if source is not None else f"Document {source_id}"
    if source_kind == "knowledge":
        source = database.get(KnowledgeItem, source_id)
        return source.title if source is not None else f"Knowledge item {source_id}"
    if source_kind == "decision":
        source = database.get(Decision, source_id)
        return source.title if source is not None else f"Decision {source_id}"
    if source_kind == "memory":
        source = database.get(ExecutiveMemory, source_id)
        return source.title if source is not None else f"Memory {source_id}"
    if source_kind == "research":
        source = database.get(ResearchTask, source_id)
        return source.title if source is not None else f"Research task {source_id}"
    return f"{source_kind.replace('_', ' ').title()} {source_id}"


def get_business_entity_detail(
    database: Session,
    company_id: int,
    entity_id: int,
) -> BusinessEntityDetail:
    company = database.get(Company, company_id)
    if company is None:
        raise ValueError("Workspace not found")

    entity = database.get(BusinessEntity, entity_id)
    if entity is None or entity.company_id != company_id:
        raise ValueError("Business entity not found")

    links = list(database.scalars(
        select(BusinessEntitySource)
        .where(
            BusinessEntitySource.company_id == company_id,
            BusinessEntitySource.entity_id == entity_id,
        )
        .order_by(BusinessEntitySource.confidence.desc(), BusinessEntitySource.created_at.desc())
    ).all())

    if not links and entity.source_kind and entity.source_id is not None:
        evidence_sources = [BusinessEntityEvidenceSource(
            source_kind=entity.source_kind,
            source_id=entity.source_id,
            title=_source_title(database, entity.source_kind, entity.source_id),
            evidence=entity.evidence,
            confidence=entity.confidence,
        )]
    else:
        evidence_sources = [BusinessEntityEvidenceSource(
            source_kind=link.source_kind,
            source_id=link.source_id,
            title=_source_title(database, link.source_kind, link.source_id),
            evidence=link.evidence,
            confidence=link.confidence,
        ) for link in links[:20]]

    source_pairs = {(item.source_kind, item.source_id) for item in evidence_sources}
    related_counts: Counter[int] = Counter()
    for source_kind, source_id in source_pairs:
        related_ids = database.scalars(
            select(BusinessEntitySource.entity_id).where(
                BusinessEntitySource.company_id == company_id,
                BusinessEntitySource.source_kind == source_kind,
                BusinessEntitySource.source_id == source_id,
                BusinessEntitySource.entity_id != entity_id,
            )
        ).all()
        related_counts.update(related_ids)

    related_entities: list[BusinessEntityRelated] = []
    for related_id, shared_count in related_counts.most_common(12):
        related = database.get(BusinessEntity, related_id)
        if related is None or related.company_id != company_id:
            continue
        total_sources = database.scalar(
            select(func.count(BusinessEntitySource.id)).where(
                BusinessEntitySource.company_id == company_id,
                BusinessEntitySource.entity_id == related_id,
            )
        ) or 0
        related_entities.append(BusinessEntityRelated(
            id=related.id,
            name=related.name,
            entity_type=related.entity_type,
            source_count=int(total_sources),
            shared_source_count=int(shared_count),
        ))

    return BusinessEntityDetail(
        id=entity.id,
        company_id=entity.company_id,
        name=entity.name,
        entity_type=entity.entity_type,
        description=entity.description,
        confidence=entity.confidence,
        source_count=len(evidence_sources),
        evidence_sources=evidence_sources,
        related_entities=related_entities,
    )
