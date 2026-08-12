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
    detected_at:datetime; updated_at:datetime
class ContradictionStatusUpdate(BaseModel):
    status:ContradictionStatus
