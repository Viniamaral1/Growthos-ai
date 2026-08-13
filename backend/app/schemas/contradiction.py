from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field

ContradictionStatus = Literal['detected','confirmed','dismissed','resolved']
class ContradictionEvidence(BaseModel):
    knowledge_item_id:int|None=None; document_id:int|None=None; document_name:str|None=None
    label:str; value:str; role:Literal['statement_a','statement_b','supporting']='supporting'; source_quality:str|None=None
class ContradictionResponse(BaseModel):
    id:int; company_id:int; space_id:int|None; space_name:str|None; status:ContradictionStatus
    contradiction_type:str; title:str; summary:str; confidence:int=Field(ge=0,le=100)
    severity:Literal['low','medium','high','critical']; statement_a:str; statement_b:str
    reason:str; business_impact:str; recommended_verification:str; evidence:list[ContradictionEvidence]
    resolution: dict | None = None
    detected_at:datetime; updated_at:datetime
class ContradictionStatusUpdate(BaseModel):
    status:ContradictionStatus
    resolution_choice: Literal[
        'confirm_contradiction',
        'source_a_authoritative',
        'source_b_authoritative',
        'different_contexts',
        'need_more_evidence',
        'dismiss_false_positive',
    ] | None = None
    note: str | None = Field(default=None, max_length=1200)

class ContradictionLifecycleImpact(BaseModel):
    contradiction_id: int
    title: str
    knowledge_facts: int
    source_documents: int
    calendar_candidates: int
    graph_entities: int
    linked_opportunities: int
    evidence: list[ContradictionEvidence]
    guidance: list[str]

class ContradictionDeleteRequest(BaseModel):
    mode: Literal['contradiction_only','contradiction_and_knowledge','remove_evidence'] = 'contradiction_only'
    knowledge_item_ids: list[int] = Field(default_factory=list)
    reason: Literal['duplicate','incorrect_extraction','wrong_source','no_longer_relevant','other'] | None = None
    note: str | None = Field(default=None, max_length=1200)
