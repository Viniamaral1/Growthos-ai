from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.company import Company
from app.models.document import Document
from app.models.research_task import ResearchTask


@dataclass(frozen=True)
class ResearchTaskDefinition:
    key: str
    title: str
    description: str
    reason: str
    recommended_action: str
    evidence_required: str
    category: str
    priority: str
    confidence_score: int
    risk_score: int


def _processed_document_count(
    database: Session,
    company_id: int,
) -> int:
    return int(
        database.scalar(
            select(func.count(Document.id))
            .where(
                Document.company_id == company_id
            )
            .where(
                Document.processing_status == "processed"
            )
        )
        or 0
    )


def build_research_task_definitions(
    database: Session,
    company: Company,
) -> list[ResearchTaskDefinition]:
    """Build transparent tasks from missing evidence and workspace maturity."""

    tasks: list[ResearchTaskDefinition] = []
    processed_documents = _processed_document_count(
        database,
        company.id,
    )

    if not company.target_audience.strip():
        tasks.append(
            ResearchTaskDefinition(
                key="define_customer",
                title="Define the primary customer segment",
                description=(
                    "Clarify exactly who experiences the problem, "
                    "who pays, and who influences the purchase."
                ),
                reason=(
                    "The workspace does not contain a usable target-audience "
                    "definition."
                ),
                recommended_action=(
                    "Write one primary customer profile and one secondary "
                    "customer profile."
                ),
                evidence_required=(
                    "Customer profile, buyer role, user role, location, "
                    "needs, and purchasing trigger."
                ),
                category="customer",
                priority="critical",
                confidence_score=10,
                risk_score=90,
            )
        )
    else:
        tasks.append(
            ResearchTaskDefinition(
                key="customer_interviews",
                title="Validate the customer problem",
                description=(
                    "Test whether the stated audience experiences the "
                    "problem strongly enough to change behaviour or pay."
                ),
                reason=(
                    "A target audience is defined, but the workspace does "
                    "not prove that the problem has been validated directly "
                    "with customers."
                ),
                recommended_action=(
                    "Interview 8–12 representative customers using the same "
                    "problem and willingness-to-act questions."
                ),
                evidence_required=(
                    "Interview notes, recurring pain points, current "
                    "alternatives, urgency, objections, and buying signals."
                ),
                category="customer",
                priority="critical",
                confidence_score=25,
                risk_score=88,
            )
        )

    tasks.append(
        ResearchTaskDefinition(
            key="competitor_landscape",
            title="Map direct and indirect competitors",
            description=(
                "Understand which alternatives already solve part of the "
                "problem and where a defensible market gap may exist."
            ),
            reason=(
                "The workspace and business plan do not constitute verified "
                "competitor research."
            ),
            recommended_action=(
                "Identify at least five alternatives and compare audience, "
                "offer, pricing approach, strengths, and weaknesses."
            ),
            evidence_required=(
                "Competitor websites, product pages, pricing evidence, "
                "customer reviews, and a comparison table."
            ),
            category="competition",
            priority="high",
            confidence_score=20,
            risk_score=82,
        )
    )

    tasks.append(
        ResearchTaskDefinition(
            key="pricing_validation",
            title="Validate pricing and willingness to pay",
            description=(
                "Test whether the proposed business model and price logic "
                "match customer value and budget."
            ),
            reason=(
                "A business model can be selected without evidence that "
                "customers accept the price, billing frequency, or package."
            ),
            recommended_action=(
                "Test three pricing options with customers and compare them "
                "with credible alternatives."
            ),
            evidence_required=(
                "Customer price feedback, competitor price references, "
                "cost assumptions, and preferred billing model."
            ),
            category="finance",
            priority="high",
            confidence_score=20,
            risk_score=84,
        )
    )

    if not company.country:
        tasks.append(
            ResearchTaskDefinition(
                key="select_market",
                title="Select the first target market",
                description=(
                    "Define the initial country, region, or city before "
                    "performing demographic and location research."
                ),
                reason=(
                    "Market opportunity cannot be assessed without a clear "
                    "geographic scope."
                ),
                recommended_action=(
                    "Choose one launch geography and document why it is the "
                    "best first validation market."
                ),
                evidence_required=(
                    "Country, region, city, customer concentration, access, "
                    "and launch constraints."
                ),
                category="market",
                priority="critical",
                confidence_score=8,
                risk_score=92,
            )
        )
    else:
        tasks.append(
            ResearchTaskDefinition(
                key="market_demand",
                title="Verify demand in the target market",
                description=(
                    "Collect credible evidence that the problem and audience "
                    "exist at a meaningful level in the selected location."
                ),
                reason=(
                    "The selected location is a workspace assumption until "
                    "supported by demographic, behavioural, or demand data."
                ),
                recommended_action=(
                    "Collect authoritative demographic data, customer-demand "
                    "signals, and local industry evidence."
                ),
                evidence_required=(
                    "Government or industry data, search or survey demand, "
                    "customer concentration, and source dates."
                ),
                category="market",
                priority="critical",
                confidence_score=18,
                risk_score=90,
            )
        )

    tasks.append(
        ResearchTaskDefinition(
            key="regulation",
            title="Check legal, regulatory, and accessibility obligations",
            description=(
                "Identify rules that affect the offer, customer data, "
                "communications, contracts, or service delivery."
            ),
            reason=(
                "GrowthOS must not infer current legal requirements from a "
                "business description alone."
            ),
            recommended_action=(
                "Review official guidance and obtain professional advice "
                "for high-impact obligations."
            ),
            evidence_required=(
                "Official regulations, regulator guidance, compliance "
                "requirements, effective dates, and professional review."
            ),
            category="risk",
            priority="high",
            confidence_score=15,
            risk_score=86,
        )
    )

    tasks.append(
        ResearchTaskDefinition(
            key="unit_economics",
            title="Build an initial unit-economics model",
            description=(
                "Test whether expected revenue can realistically exceed "
                "customer acquisition and delivery costs."
            ),
            reason=(
                "A launch budget and business model do not prove that the "
                "business is financially sustainable."
            ),
            recommended_action=(
                "Estimate price, gross margin, acquisition cost, retention, "
                "delivery cost, and break-even volume."
            ),
            evidence_required=(
                "Cost estimates, price assumptions, sales-cycle assumptions, "
                "gross margin, and break-even calculation."
            ),
            category="finance",
            priority="high",
            confidence_score=18,
            risk_score=85,
        )
    )

    if processed_documents == 0:
        tasks.append(
            ResearchTaskDefinition(
                key="evidence_library",
                title="Create the first evidence library",
                description=(
                    "Upload trusted reports, research, interviews, or market "
                    "documents so recommendations can be grounded."
                ),
                reason=(
                    "No processed intelligence assets are available in this "
                    "workspace."
                ),
                recommended_action=(
                    "Upload at least two independent sources and label what "
                    "each source proves or does not prove."
                ),
                evidence_required=(
                    "Processed documents with identifiable authors, dates, "
                    "and relevance to the target market."
                ),
                category="evidence",
                priority="critical",
                confidence_score=5,
                risk_score=94,
            )
        )
    elif processed_documents < 3:
        tasks.append(
            ResearchTaskDefinition(
                key="evidence_diversity",
                title="Diversify the evidence base",
                description=(
                    "Reduce reliance on a single source or document type."
                ),
                reason=(
                    f"Only {processed_documents} processed intelligence "
                    "asset(s) are available."
                ),
                recommended_action=(
                    "Add independent customer, competitor, market, and "
                    "financial evidence."
                ),
                evidence_required=(
                    "At least three independent sources covering different "
                    "research categories."
                ),
                category="evidence",
                priority="medium",
                confidence_score=35,
                risk_score=68,
            )
        )

    return tasks


def generate_research_tasks(
    database: Session,
    company: Company,
) -> list[ResearchTask]:
    """Create missing system tasks while preserving user status changes."""

    definitions = build_research_task_definitions(
        database,
        company,
    )

    existing = {
        task.task_key: task
        for task in database.scalars(
            select(ResearchTask).where(
                ResearchTask.company_id == company.id
            )
        ).all()
    }

    for definition in definitions:
        task = existing.get(definition.key)

        if task is None:
            task = ResearchTask(
                company_id=company.id,
                task_key=definition.key,
                title=definition.title,
                description=definition.description,
                reason=definition.reason,
                recommended_action=definition.recommended_action,
                evidence_required=definition.evidence_required,
                category=definition.category,
                priority=definition.priority,
                status="missing",
                confidence_score=definition.confidence_score,
                risk_score=definition.risk_score,
                source="system",
            )
            database.add(task)
            continue

        task.title = definition.title
        task.description = definition.description
        task.reason = definition.reason
        task.recommended_action = definition.recommended_action
        task.evidence_required = definition.evidence_required
        task.category = definition.category
        task.priority = definition.priority
        task.confidence_score = definition.confidence_score
        task.risk_score = definition.risk_score
        database.add(task)

    database.commit()

    return list(
        database.scalars(
            select(ResearchTask)
            .where(
                ResearchTask.company_id == company.id
            )
            .order_by(
                ResearchTask.risk_score.desc(),
                ResearchTask.id.asc(),
            )
        ).all()
    )
