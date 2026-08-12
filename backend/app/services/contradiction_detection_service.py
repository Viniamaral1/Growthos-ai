from __future__ import annotations
import base64,binascii,hashlib,json,re
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.contradiction import ContradictionRecord
from app.models.document import Document
from app.models.knowledge_item import KnowledgeItem
from app.models.knowledge_space import KnowledgeSpace

def _tags(item):
    try:return [x for x in json.loads(item.tags_json or '[]') if isinstance(x,str)]
    except Exception:return []
def _dec(tag,prefix):
    if not tag.startswith(prefix+':'): return None
    s=tag.split(':',1)[1]
    try:return base64.urlsafe_b64decode((s+'='*(-len(s)%4)).encode()).decode()
    except (ValueError,UnicodeDecodeError,binascii.Error):return None
def _prev(tags):
    out=[]
    for t in tags:
        v=_dec(t,'previous-value-b64')
        if v and v not in out: out.append(v)
    return out
def _source_ids(tags):
    out=[]
    for t in tags:
        if t.startswith('source-document:'):
            try:i=int(t.split(':',1)[1])
            except ValueError:continue
            if i not in out:out.append(i)
    return out
def _tag(tags,p):
    m=p+':'
    return next((t[len(m):] for t in reversed(tags) if t.startswith(m)),None)
def _classify(name):
    n=(name or '').lower()
    for k,words in [('invoice',['invoice']),('contract',['contract','agreement']),('amendment',['amendment','addendum']),('meeting',['meeting','minutes']),('quotation',['quote','quotation']),('policy',['policy']),('email',['email'])]:
        if any(w in n for w in words):return k
    return 'document'
def _num(v):
    m=re.search(r'[-+]?\d[\d,]*(?:\.\d+)?',v or '')
    return float(m.group(0).replace(',','')) if m else None
def _kind(item):
    s=(item.title+' '+item.item_type).lower()
    if any(x in s for x in ['price','cost','rate','commercial value','contract value']):return 'price'
    if 'payment' in s and ('term' in s or 'day' in s):return 'payment_terms'
    if any(x in s for x in ['date','expiry','expiration','deadline','renewal']):return 'date'
    if any(x in s for x in ['volume','quantity','minimum order']):return 'quantity'
    if any(x in s for x in ['supplier','vendor','provider']):return 'supplier'
    if any(x in s for x in ['reference','quotation id','contract id']):return 'reference'
    return 'generic'
def _material(kind,a,b):
    if a.strip().lower()==b.strip().lower():return False
    if kind in {'price','quantity','payment_terms'}:
        x,y=_num(a),_num(b)
        return x is not None and y is not None and abs(x-y)>1e-9
    return True
def _eligible(classes,kind):
    cs=set(classes)
    if len(cs)<2:return False
    if cs=={'quotation'}:return False
    if kind=='price' and ('invoice' in cs and ('contract'in cs or 'quotation'in cs)):return True
    if kind=='payment_terms' and ('contract'in cs and ('meeting'in cs or 'quotation'in cs)):return True
    if kind=='date' and ('contract'in cs and ('amendment'in cs or 'meeting'in cs)):return True
    if kind=='quantity' and ('contract'in cs and 'quotation'in cs):return True
    if kind in {'supplier','reference'} and ('contract'in cs and ('meeting'in cs or 'quotation'in cs)):return True
    return False

def detect_contradictions(db:Session,company_id:int,space_id:int|None=None):
    q=select(KnowledgeItem).where(KnowledgeItem.company_id==company_id)
    if space_id is not None:q=q.where(KnowledgeItem.space_id==space_id)
    items=list(db.scalars(q).all()); results=[]
    for item in items:
        tags=_tags(item); history=_prev(tags); ids=_source_ids(tags)
        if not history or len(ids)<2:continue
        previous,current=history[-1],(item.content or '').strip(); kind=_kind(item)
        if not _material(kind,previous,current):continue
        docs=[db.get(Document,i) for i in ids[-2:]]
        classes=[_classify(d.original_filename if d else None) for d in docs]
        if not _eligible(classes,kind):continue
        space=db.get(KnowledgeSpace,item.space_id) if item.space_id else None
        pair=' vs '.join(classes)
        severity='high' if kind in {'price','payment_terms'} else 'medium'
        confidence=94 if all(docs) else 86
        reason=f"Two different business sources describe the same {item.title} with incompatible values ({pair})."
        impact={'price':'A pricing mismatch may lead to overpayment or an incorrect purchasing decision.','payment_terms':'Conflicting payment terms can cause cash-flow or supplier disputes.','date':'Conflicting dates can cause missed renewals, deadlines or obligations.','quantity':'Conflicting quantities can affect inventory, spend and fulfilment planning.','supplier':'Different supplier records may cause an approval or contracting error.','reference':'Different references may indicate the wrong commercial version is being used.'}.get(kind,'The business record is inconsistent and should be verified.')
        rec='Open both sources and confirm which value is authoritative before relying on this fact.'
        sig=hashlib.sha1(f'{company_id}|{item.space_id}|{item.id}|{kind}|{previous}|{current}'.encode()).hexdigest()
        evidence=[]
        vals=[previous,current]
        roles=['statement_a','statement_b']
        for idx,d in enumerate(docs):
            evidence.append({'knowledge_item_id':item.id,'document_id':d.id if d else None,'document_name':d.original_filename if d else None,'label':item.title,'value':vals[idx],'role':roles[idx],'source_quality':_tag(tags,'source-quality') or 'direct_document'})
        payload={'summary':f'{item.title} conflicts across business evidence.','confidence':confidence,'severity':severity,'statement_a':previous,'statement_b':current,'reason':reason,'business_impact':impact,'recommended_verification':rec,'evidence':evidence,'space_name':space.name if space else None}
        record=db.scalar(select(ContradictionRecord).where(ContradictionRecord.company_id==company_id,ContradictionRecord.signature==sig))
        if record is None:
            record=ContradictionRecord(company_id=company_id,space_id=item.space_id,signature=sig,status='detected',contradiction_type=kind,title=f'Possible {item.title} contradiction',payload_json=json.dumps(payload))
        else:
            record.payload_json=json.dumps(payload); record.space_id=item.space_id
        db.add(record); results.append(record)
    db.commit()
    for r in results:db.refresh(r)
    return results

def serialize_contradiction(db,record):
    p=json.loads(record.payload_json)
    return {'id':record.id,'company_id':record.company_id,'space_id':record.space_id,'space_name':p.get('space_name'),'status':record.status,'contradiction_type':record.contradiction_type,'title':record.title,**{k:p[k] for k in ['summary','confidence','severity','statement_a','statement_b','reason','business_impact','recommended_verification','evidence']},'detected_at':record.detected_at,'updated_at':record.updated_at}
