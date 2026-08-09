const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  "http://127.0.0.1:8000/api/v1";


export type ExecutiveRole = "auto" | "ceo" | "cfo" | "cmo" | "coo" | "research" | "board";


export type DevelopmentStage =
  | "idea"
  | "validation"
  | "pre_launch"
  | "launched"
  | "growing"
  | "established";


export type Company = {
  id: number;
  name: string;
  website: string | null;
  industry: string;
  target_audience: string;
  brand_tone: string;
  product_description: string;
  business_idea: string | null;
  problem_statement: string | null;
  proposed_solution: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  business_model: string | null;
  launch_budget: string | number | null;
  budget_currency: string | null;
  primary_goal: string | null;
  development_stage: DevelopmentStage | null;
  created_at: string;
  updated_at: string;
};


export type DocumentRecord = {
  id: number;
  company_id: number;
  original_filename: string;
  content_type: string;
  file_size: number;
  processing_status: string;
  page_count: number | null;
  character_count: number | null;
  processing_error: string | null;
  uploaded_at: string;
  processed_at: string | null;
  entity_mapping_status: "unavailable" | "not_mapped" | "processing" | "completed" | "partial" | "failed";
  entity_count: number;
  entity_mapping_error: string | null;
  entity_mapped_at: string | null;
  project_space_id: number | null;
  project_space_name: string | null;
};




export type DocumentRelevance = {
  document_id: number;
  company_id: number;
  company_name: string;
  level: "high" | "medium" | "low";
  confidence: number;
  recommendation: string;
  reasons: string[];
  suggested_company_id: number | null;
  suggested_company_name: string | null;
  target_space_id: number | null;
  target_space_name: string | null;
  suggested_space_id: number | null;
  suggested_space_name: string | null;
  suggested_new_space_name: string | null;
  target_confidence: number | null;
  best_space_id: number | null;
  best_space_name: string | null;
  best_confidence: number | null;
  best_is_stronger: boolean;
  no_confident_existing_match: boolean;
  method: string;
};

export type IntelligentIngestionAssessment = {
  document_id: number;
  company_id: number;
  asset_kind: string;
  category: string;
  classification_confidence: number;
  classification_signals: string[];
  decision: "strong_match" | "review" | "unrelated";
  relevance: DocumentRelevance;
  recommended_actions: string[];
};

export type AnswerSource = {
  source_id: string;
  chunk_id: number;
  document_id: number;
  document_name: string;
  page_number: number | null;
  similarity_score: number;
  text: string;
};


export type GroundedAnswer = {
  company_id: number;
  document_id: number | null;
  document_name: string | null;
  question: string;
  answer: string;
  model: string;
  source_count: number;
  sources: AnswerSource[];
};


export type MarketingPlatform =
  | "linkedin"
  | "instagram"
  | "facebook"
  | "google_ads"
  | "email";


export type MarketingObjective =
  | "brand_awareness"
  | "lead_generation"
  | "product_launch"
  | "sales"
  | "engagement";


export type MarketingVariant = {
  variant_number: number;
  headline: string;
  body: string;
  call_to_action: string;
  hashtags: string[];
  citations: string[];
};


export type MarketingSource = {
  source_id: string;
  document_id: number;
  document_name: string;
  page_number: number | null;
  similarity_score: number;
  text: string;
};


export type MarketingCampaign = {
  company_id: number;
  document_id: number | null;
  document_name: string | null;
  platform: MarketingPlatform;
  objective: MarketingObjective;
  model: string;
  variants: MarketingVariant[];
  sources: MarketingSource[];
};


export type CustomerSegment = {
  name: string;
  description: string;
  needs: string[];
  recommended_message: string;
};


export type RoadmapPhase = {
  period: string;
  objective: string;
  actions: string[];
  success_measure: string;
};


export type BusinessPlanContent = {
  executive_summary: string;
  opportunity: string;
  target_market: string;
  customer_segments: CustomerSegment[];
  value_proposition: string;
  business_model_recommendations: string[];
  go_to_market_strategy: string[];
  marketing_strategy: string[];
  swot: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  key_risks: string[];
  research_priorities: string[];
  ninety_day_roadmap: RoadmapPhase[];
  next_actions: string[];
  assumptions_and_limitations: string[];
};


export type BusinessPlan = {
  company_id: number;
  company_name: string;
  model: string;
  generated_at: string;
  plan: BusinessPlanContent;
};





export type ConversationSummary = {
  id: number;
  company_id: number;
  title: string;
  document_id: number | null;
  document_name: string | null;
  message_count: number;
  last_message_preview: string | null;
  created_at: string;
  updated_at: string;
};


export type ChatMessage = {
  id: number;
  conversation_id: number;
  role: "user" | "assistant";
  content: string;
  model: string | null;
  executive_role: ExecutiveRole | null;
  confidence_level: "high" | "medium" | "low" | null;
  confidence_score: number | null;
  confidence_reason: string | null;
  context_mode?: string;
  context_sources?: string[];
  context_reason?: string;
  memory_proposal?: ExecutiveMemoryProposal | null;
  sources: AnswerSource[];
  created_at: string;
};


export type ConversationDetail =
  ConversationSummary & {
    messages: ChatMessage[];
  };


export type CofounderStreamEvent =
  | {
      type: "metadata";
      conversation_id: number;
      conversation_title: string;
      user_message: ChatMessage;
      sources: AnswerSource[];
      model: string;
      executive_role?: ExecutiveRole;
      confidence_level?: "high" | "medium" | "low";
      confidence_score?: number;
      confidence_reason?: string;
      context_mode?: string;
      context_sources?: string[];
      context_reason?: string;
      memory_proposal?: ExecutiveMemoryProposal | null;
    }
  | {
      type: "token";
      content: string;
    }
  | {
      type: "done";
      assistant_message: ChatMessage;
      context_mode?: string;
      context_sources?: string[];
      context_reason?: string;
      memory_proposal?: ExecutiveMemoryProposal | null;
      research_project_id?: number;
      research_project_status?: ResearchProjectStatus;
    }
  | {
      type: "cancelled";
      assistant_message?: ChatMessage;
    }
  | {
      type: "error";
      message: string;
      assistant_message?: ChatMessage;
    };





export type ResearchPriority =
  | "critical"
  | "high"
  | "medium"
  | "low";


export type ResearchStatus =
  | "missing"
  | "planned"
  | "in_progress"
  | "validated"
  | "dismissed";


export type ResearchEvidence = {
  id: number;
  research_task_id: number;
  document_id: number | null;
  document_name: string | null;
  title: string;
  summary: string;
  evidence_type: string;
  created_at: string;
};


export type ResearchTask = {
  id: number;
  company_id: number;
  task_key: string;
  title: string;
  description: string;
  reason: string;
  recommended_action: string;
  evidence_required: string;
  category: string;
  priority: ResearchPriority;
  status: ResearchStatus;
  confidence_score: number;
  risk_score: number;
  source: string;
  evidence: ResearchEvidence[];
  created_at: string;
  updated_at: string;
};


export type ResearchSummary = {
  company_id: number;
  total_tasks: number;
  validated_tasks: number;
  open_tasks: number;
  critical_tasks: number;
  evidence_count: number;
  research_health_score: number;
  average_confidence: number;
  average_risk: number;
  tasks: ResearchTask[];
};


export type ResearchProjectStatus =
  | "discovery"
  | "ready"
  | "planned"
  | "archived";

export type ResearchQuestion = {
  id: string;
  question: string;
  why_it_matters: string;
  required: boolean;
  suggested_answer: string | null;
};

export type ResearchPlanSection = {
  title: string;
  purpose: string;
  research_questions: string[];
  evidence_needed: string[];
  analysis_method: string;
};

export type ResearchPlanContent = {
  objective: string;
  scope: string[];
  exclusions: string[];
  sections: ResearchPlanSection[];
  source_strategy: string[];
  evaluation_criteria: string[];
  assumptions: string[];
  risks_and_limitations: string[];
  proposed_deliverables: string[];
  next_actions: string[];
};

export type ResearchProject = {
  id: number;
  company_id: number;
  title: string;
  goal: string;
  context: string | null;
  status: ResearchProjectStatus;
  project_type: string | null;
  deliverable_type: string;
  questions: ResearchQuestion[];
  answers: Record<string, string>;
  plan: ResearchPlanContent | null;
  assumptions: string[];
  model: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateCompanyPayload = {
  name: string;
  website: string | null;
  industry: string;
  target_audience: string;
  brand_tone: string;
  product_description: string;
  business_idea: string | null;
  problem_statement: string | null;
  proposed_solution: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  business_model: string | null;
  launch_budget: number | null;
  budget_currency: string | null;
  primary_goal: string | null;
  development_stage: DevelopmentStage | null;
};


export type MarketingCampaignPayload = {
  company_id: number;
  document_id: number | null;
  platform: MarketingPlatform;
  objective: MarketingObjective;
  campaign_brief: string;
  target_audience: string | null;
  tone: string | null;
  number_of_variants: number;
  retrieval_limit: number;
  minimum_score: number;
};


async function readError(
  response: Response,
): Promise<string> {
  try {
    const data: unknown = await response.json();

    if (
      typeof data === "object" &&
      data !== null &&
      "detail" in data
    ) {
      const detail = (
        data as { detail: unknown }
      ).detail;

      if (typeof detail === "string") {
        return detail;
      }

      if (Array.isArray(detail)) {
        return detail
          .map((item) => {
            if (
              typeof item === "object" &&
              item !== null
            ) {
              const errorItem = item as {
                msg?: unknown;
                loc?: unknown;
              };

              const location = Array.isArray(
                errorItem.loc,
              )
                ? errorItem.loc.join(" → ")
                : "request";

              const message =
                typeof errorItem.msg === "string"
                  ? errorItem.msg
                  : JSON.stringify(item);

              return `${location}: ${message}`;
            }

            return String(item);
          })
          .join("\n");
      }

      return JSON.stringify(detail);
    }

    return JSON.stringify(data);
  } catch {
    return `Request failed with status ${response.status}.`;
  }
}


export async function getCompanies(): Promise<Company[]> {
  const response = await fetch(
    `${API_URL}/companies`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}


export async function createCompany(
  payload: CreateCompanyPayload,
): Promise<Company> {
  const response = await fetch(
    `${API_URL}/companies`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}


export async function getDocuments(
  companyId: number,
): Promise<DocumentRecord[]> {
  const response = await fetch(
    `${API_URL}/documents?company_id=${companyId}`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}



export type DocumentTextRecord = {
  id: number;
  original_filename: string;
  processing_status: string;
  page_count: number | null;
  character_count: number | null;
  extracted_text: string | null;
};

export async function getDocumentText(
  documentId: number,
): Promise<DocumentTextRecord> {
  const response = await fetch(
    `${API_URL}/documents/${documentId}/text`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}

export async function deleteDocument(
  documentId: number,
): Promise<void> {
  const response = await fetch(
    `${API_URL}/documents/${documentId}`,
    { method: "DELETE" },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }
}

export async function uploadDocument(
  companyId: number,
  file: File,
): Promise<DocumentRecord> {
  const formData = new FormData();

  formData.append("company_id", String(companyId));
  formData.append("file", file);

  const response = await fetch(
    `${API_URL}/documents/upload`,
    {
      method: "POST",
      body: formData,
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}


export async function processDocument(
  documentId: number,
): Promise<DocumentRecord> {
  const response = await fetch(
    `${API_URL}/documents/${documentId}/process`,
    {
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}






export type DuplicateCheck = {
  duplicate_type: "none" | "exact" | "same_name";
  existing_document_id: number | null;
  existing_filename: string | null;
  exact_content_match: boolean;
  same_filename: boolean;
  same_size: boolean;
  message: string;
};

export async function checkDocumentDuplicate(companyId: number, file: File): Promise<DuplicateCheck> {
  const formData = new FormData();
  formData.append("company_id", String(companyId));
  formData.append("file", file);
  const response = await fetch(`${API_URL}/documents/duplicate-check`, { method: "POST", body: formData });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function routeDocumentToProject(documentId: number, spaceId: number): Promise<{document_id:number;space_id:number;space_name:string;message:string}> {
  const response = await fetch(`${API_URL}/documents/${documentId}/route?space_id=${spaceId}`, { method: "POST" });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}


export type KnowledgeFactProposal = {
  key: string;
  title: string;
  value: string;
  summary: string;
  item_type: string;
  confidence: number;
  evidence: string;
  existing_item_id: number | null;
  existing_value: string | null;
  relationship: "new" | "same" | "changed";
};

export type DocumentKnowledgePreview = {
  document_id: number;
  space_id: number;
  space_name: string;
  ai_enriched: boolean;
  facts: KnowledgeFactProposal[];
};

export async function previewDocumentKnowledge(documentId: number, spaceId: number): Promise<DocumentKnowledgePreview> {
  const response = await fetch(`${API_URL}/documents/${documentId}/knowledge-preview?space_id=${spaceId}`, { cache: "no-store" });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function captureDocumentKnowledgeFacts(
  documentId: number,
  spaceId: number,
  facts: Array<{key:string;title?:string;value?:string;action?:"create"|"update"}>
): Promise<{document_id:number;space_id:number;knowledge_item_ids:number[];created_or_updated:number;message:string}> {
  const response = await fetch(`${API_URL}/documents/${documentId}/capture-knowledge-facts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ space_id: spaceId, facts }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function captureDocumentToKnowledge(documentId: number, spaceId: number): Promise<{document_id:number;space_id:number;knowledge_item_id:number;title:string;message:string}> {
  const response = await fetch(`${API_URL}/documents/${documentId}/capture-knowledge?space_id=${spaceId}`, { method: "POST" });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function getDocumentIngestionAssessment(
  companyId: number,
  documentId: number,
  targetSpaceId: number | null = null,
): Promise<IntelligentIngestionAssessment> {
  const target = targetSpaceId === null ? "" : `&target_space_id=${targetSpaceId}`;
  const response = await fetch(
    `${API_URL}/documents/${documentId}/ingestion?company_id=${companyId}${target}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}

export async function getDocumentRelevance(
  companyId: number,
  documentId: number,
  targetSpaceId: number | null = null,
): Promise<DocumentRelevance> {
  const target = targetSpaceId === null ? "" : `&target_space_id=${targetSpaceId}`;
  const response = await fetch(
    `${API_URL}/documents/${documentId}/relevance?company_id=${companyId}${target}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}

export async function moveDocumentToWorkspace(
  documentId: number,
  companyId: number,
): Promise<DocumentRecord> {
  const response = await fetch(
    `${API_URL}/documents/${documentId}/move?company_id=${companyId}`,
    { method: "POST" },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}

export async function askGroundedQuestion(
  companyId: number,
  question: string,
  documentId: number | null,
): Promise<GroundedAnswer> {
  const response = await fetch(
    `${API_URL}/answers/grounded`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        company_id: companyId,
        document_id: documentId,
        question,
        retrieval_limit: 3,
        minimum_score: 0.2,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}


export async function generateMarketingCampaign(
  payload: MarketingCampaignPayload,
): Promise<MarketingCampaign> {
  const response = await fetch(
    `${API_URL}/marketing/generate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}

export type GroundedAnswerStreamEvent =
  | ({ type: "metadata" } & Omit<GroundedAnswer, "answer">)
  | { type: "token"; content: string }
  | { type: "done" }
  | { type: "error"; message: string };


export async function streamGroundedQuestion(
  companyId: number,
  question: string,
  documentId: number | null,
  onEvent: (event: GroundedAnswerStreamEvent) => void,
): Promise<void> {
  const response = await fetch(
    `${API_URL}/answers/grounded/stream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        company_id: companyId,
        document_id: documentId,
        question,
        retrieval_limit: 3,
        minimum_score: 0.2,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  if (!response.body) {
    throw new Error("Streaming is not supported by this browser.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      onEvent(JSON.parse(line) as GroundedAnswerStreamEvent);
    }

    if (done) break;
  }

  if (buffer.trim()) {
    onEvent(JSON.parse(buffer) as GroundedAnswerStreamEvent);
  }
}



export async function getBusinessPlan(
  companyId: number,
): Promise<BusinessPlan | null> {
  const response = await fetch(
    `${API_URL}/business-plans/${companyId}`,
    {
      cache: "no-store",
    },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}


export async function generateBusinessPlan(
  companyId: number,
): Promise<BusinessPlan> {
  const response = await fetch(
    `${API_URL}/business-plans/${companyId}/generate`,
    {
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}



export async function getConversations(
  companyId: number,
): Promise<ConversationSummary[]> {
  const response = await fetch(
    `${API_URL}/conversations?company_id=${companyId}`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}


export async function createConversation(
  companyId: number,
  documentId: number | null,
): Promise<ConversationDetail> {
  const response = await fetch(
    `${API_URL}/conversations`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        company_id: companyId,
        document_id: documentId,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}


export async function getConversation(
  conversationId: number,
): Promise<ConversationDetail> {
  const response = await fetch(
    `${API_URL}/conversations/${conversationId}`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}


export async function renameConversation(
  conversationId: number,
  title: string,
): Promise<ConversationSummary> {
  const response = await fetch(
    `${API_URL}/conversations/${conversationId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}


export async function editConversationMessage(
  conversationId: number,
  messageId: number,
  content: string,
): Promise<ConversationDetail> {
  const response = await fetch(
    `${API_URL}/conversations/${conversationId}/messages/${messageId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}


export async function deleteConversation(
  conversationId: number,
): Promise<void> {
  const response = await fetch(
    `${API_URL}/conversations/${conversationId}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }
}


export async function streamCofounderMessage(
  conversationId: number,
  content: string,
  documentId: number | null,
  documentIds: number[],
  useAllDocuments: boolean,
  executiveRole: ExecutiveRole,
  researchMode: boolean,
  onEvent: (event: CofounderStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(
    `${API_URL}/conversations/${conversationId}/messages/stream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content,
        document_id: documentId,
        document_ids: documentIds,
        use_all_documents: useAllDocuments,
        executive_role: executiveRole,
        research_mode: researchMode,
      }),
      signal,
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  if (!response.body) {
    throw new Error(
      "Streaming is not supported by this browser.",
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const abortReader = () => {
    void reader.cancel("Generation stopped");
  };

  signal?.addEventListener(
    "abort",
    abortReader,
    { once: true },
  );

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException(
          "Generation stopped",
          "AbortError",
        );
      }

      const { value, done } =
        await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(
        value,
        { stream: true },
      );

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        onEvent(
          JSON.parse(line) as CofounderStreamEvent,
        );
      }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      onEvent(
        JSON.parse(buffer) as CofounderStreamEvent,
      );
    }
  } finally {
    signal?.removeEventListener(
      "abort",
      abortReader,
    );
    reader.releaseLock();
  }
}


export async function getResearchSummary(
  companyId: number,
): Promise<ResearchSummary> {
  const response = await fetch(
    `${API_URL}/research/${companyId}`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}


export async function regenerateResearchTasks(
  companyId: number,
): Promise<ResearchSummary> {
  const response = await fetch(
    `${API_URL}/research/${companyId}/generate`,
    {
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}


export async function updateResearchTask(
  taskId: number,
  status: ResearchStatus,
): Promise<ResearchTask> {
  const response = await fetch(
    `${API_URL}/research/tasks/${taskId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}


export async function addResearchEvidence(
  taskId: number,
  payload: {
    title: string;
    summary: string;
    evidence_type: string;
    document_id: number | null;
  },
): Promise<ResearchTask> {
  const response = await fetch(
    `${API_URL}/research/tasks/${taskId}/evidence`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}



export type DecisionStatus =
  | "proposed"
  | "accepted"
  | "rejected"
  | "in_progress"
  | "completed";


export type Decision = {
  id: number;
  company_id: number;
  conversation_id: number | null;
  message_id: number | null;
  title: string;
  summary: string;
  status: DecisionStatus;
  owner_role: string | null;
  source_executive_role: string | null;
  confidence_level: string | null;
  confidence_score: number | null;
  handoff_note: string | null;
  created_at: string;
  updated_at: string;
};


export type DecisionCreate = {
  company_id: number;
  conversation_id?: number | null;
  message_id?: number | null;
  title: string;
  summary: string;
  owner_role?: string | null;
  source_executive_role?: string | null;
  confidence_level?: string | null;
  confidence_score?: number | null;
};


export async function getDecisions(
  companyId: number,
): Promise<Decision[]> {
  const response = await fetch(
    `${API_URL}/decisions?company_id=${companyId}`,
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}


export async function createDecision(
  payload: DecisionCreate,
): Promise<Decision> {
  const response = await fetch(
    `${API_URL}/decisions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}


export async function updateDecision(
  decisionId: number,
  payload: Partial<{
    title: string;
    status: DecisionStatus;
    owner_role: string | null;
    handoff_note: string | null;
  }>,
): Promise<Decision> {
  const response = await fetch(
    `${API_URL}/decisions/${decisionId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}


export async function deleteDecision(
  decisionId: number,
): Promise<void> {
  const response = await fetch(
    `${API_URL}/decisions/${decisionId}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }
}



export type ResponseFeedbackRating =
  | "useful"
  | "not_useful";


export async function submitResponseFeedback(
  payload: {
    company_id: number;
    conversation_id: number;
    message_id: number;
    rating: ResponseFeedbackRating;
    reason?: string | null;
    note?: string | null;
  },
): Promise<void> {
  const response = await fetch(
    `${API_URL}/response-feedback`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }
}



export type DocumentClassification = {
  document_id: number;
  category:
    | "strategy"
    | "finance"
    | "marketing"
    | "operations"
    | "research"
    | "general";
  suggested_executive: ExecutiveRole;
  confidence: number;
  signals: string[];
};


export async function getDocumentClassification(
  documentId: number,
): Promise<DocumentClassification> {
  const response = await fetch(
    `${API_URL}/documents/${documentId}/classification`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}



export async function cancelConversationGeneration(
  conversationId: number,
): Promise<void> {
  const response = await fetch(
    `${API_URL}/conversations/${conversationId}/cancel`,
    {
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }
}



export type ExecutiveMemoryType =
  | "decision"
  | "fact"
  | "preference"
  | "goal"
  | "risk"
  | "customer"
  | "competitor"
  | "strategy"
  | "meeting"
  | "task";


export type ExecutiveMemory = {
  id: number;
  company_id: number;
  executive_role: string;
  memory_type: ExecutiveMemoryType;
  title: string;
  summary: string;
  details: string | null;
  importance: number;
  source_conversation_id: number | null;
  source_message_id: number | null;
  is_archived: boolean;
  times_used: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};



export type ExecutiveMemoryProposal = {
  executive_role: ExecutiveRole;
  memory_type: ExecutiveMemoryType;
  title: string;
  summary: string;
  details: string | null;
  importance: number;
  source_conversation_id: number;
  source_message_id: number;
  reason: string;
};


export async function getExecutiveMemories(
  companyId: number,
  executiveRole?: ExecutiveRole,
): Promise<ExecutiveMemory[]> {
  const parameters = new URLSearchParams({
    company_id: String(companyId),
  });

  if (executiveRole) {
    parameters.set(
      "executive_role",
      executiveRole,
    );
  }

  const response = await fetch(
    `${API_URL}/executive-memories?${parameters.toString()}`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}


export async function createExecutiveMemory(
  payload: {
    company_id: number;
    executive_role: ExecutiveRole;
    memory_type: ExecutiveMemoryType;
    title: string;
    summary: string;
    details?: string | null;
    importance: number;
    source_conversation_id?: number | null;
    source_message_id?: number | null;
  },
): Promise<ExecutiveMemory> {
  const response = await fetch(
    `${API_URL}/executive-memories`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}


export async function updateExecutiveMemory(
  memoryId: number,
  payload: Partial<{
    executive_role: ExecutiveRole;
    memory_type: ExecutiveMemoryType;
    title: string;
    summary: string;
    details: string | null;
    importance: number;
    is_archived: boolean;
  }>,
): Promise<ExecutiveMemory> {
  const response = await fetch(
    `${API_URL}/executive-memories/${memoryId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}


export async function deleteExecutiveMemory(
  memoryId: number,
): Promise<void> {
  const response = await fetch(
    `${API_URL}/executive-memories/${memoryId}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }
}


export async function getResearchProjects(
  companyId: number,
): Promise<ResearchProject[]> {
  const response = await fetch(
    `${API_URL}/research-projects/company/${companyId}`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function createResearchProject(
  companyId: number,
  payload: { goal: string; context: string | null; deliverable_type: string },
): Promise<ResearchProject> {
  const response = await fetch(
    `${API_URL}/research-projects/company/${companyId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function updateResearchProjectAnswers(
  projectId: number,
  answers: Record<string, string>,
): Promise<ResearchProject> {
  const response = await fetch(
    `${API_URL}/research-projects/${projectId}/answers`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    },
  );
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function generateResearchProjectPlan(
  projectId: number,
): Promise<ResearchProject> {
  const response = await fetch(
    `${API_URL}/research-projects/${projectId}/plan`,
    { method: "POST" },
  );
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function deleteResearchProject(
  projectId: number,
): Promise<void> {
  const response = await fetch(
    `${API_URL}/research-projects/${projectId}`,
    { method: "DELETE" },
  );
  if (!response.ok) throw new Error(await readError(response));
}

export type KnowledgeSpace = {
  id: number;
  company_id: number;
  name: string;
  description: string | null;
  color: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type KnowledgeItem = {
  id: number;
  company_id: number;
  space_id: number;
  item_type: string;
  title: string;
  summary: string;
  content: string;
  tags_json: string | null;
  source_conversation_id: number | null;
  source_message_id: number | null;
  created_at: string;
  updated_at: string;
};

export async function getKnowledgeSpaces(companyId: number): Promise<KnowledgeSpace[]> {
  const response = await fetch(`${API_URL}/knowledge-spaces?company_id=${companyId}`, { cache: "no-store" });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function createKnowledgeSpace(payload: {
  company_id: number;
  name: string;
  description?: string | null;
  color?: string;
}): Promise<KnowledgeSpace> {
  const response = await fetch(`${API_URL}/knowledge-spaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}



export async function updateKnowledgeSpace(
  spaceId: number,
  payload: {
    name?: string;
    description?: string | null;
    color?: string;
    is_archived?: boolean;
  },
): Promise<KnowledgeSpace> {
  const response = await fetch(`${API_URL}/knowledge-spaces/${spaceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function deleteKnowledgeSpace(spaceId: number): Promise<void> {
  const response = await fetch(`${API_URL}/knowledge-spaces/${spaceId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function captureKnowledgeItem(spaceId: number, payload: {
  company_id: number;
  item_type: string;
  title: string;
  summary: string;
  content: string;
  tags?: string[];
  source_conversation_id?: number | null;
  source_message_id?: number | null;
}): Promise<KnowledgeItem> {
  const response = await fetch(`${API_URL}/knowledge-spaces/${spaceId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, space_id: spaceId }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function getKnowledgeItems(spaceId: number, search = ""): Promise<KnowledgeItem[]> {
  const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
  const response = await fetch(`${API_URL}/knowledge-spaces/${spaceId}/items${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}


export async function updateKnowledgeItem(itemId: number, payload: {
  item_type?: string;
  title?: string;
  summary?: string;
  content?: string;
  tags?: string[];
  space_id?: number;
}): Promise<KnowledgeItem> {
  const response = await fetch(`${API_URL}/knowledge-spaces/items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function deleteKnowledgeItem(itemId: number): Promise<void> {
  const response = await fetch(`${API_URL}/knowledge-spaces/items/${itemId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(await readError(response));
}

export type WorkspaceSemanticSearchResult = {
  source_type: "knowledge" | "chat";
  source_id: number;
  title: string;
  snippet: string;
  content: string;
  similarity_score: number;
  created_at: string;
  space_id: number | null;
  space_name: string | null;
  item_type: string | null;
  conversation_id: number | null;
  conversation_title: string | null;
  message_role: string | null;
};

export type WorkspaceSemanticSearchResponse = {
  company_id: number;
  query: string;
  result_count: number;
  searched_knowledge: boolean;
  searched_chat: boolean;
  search_strategy: "semantic" | "safe_summary";
  indexed_history_available: boolean;
  results: WorkspaceSemanticSearchResult[];
};

export async function searchWorkspaceSemantically(
  payload: {
    company_id: number;
    query: string;
    active_space_id?: number | null;
    scope: "knowledge" | "chat";
    current_space_only?: boolean;
    chat_mode?: "summaries" | "current" | "recent_5" | "recent_20" | "saved" | "full_history";
    performance_mode?: "safe" | "balanced" | "deep";
    current_conversation_id?: number | null;
    limit?: number;
    minimum_score?: number;
  },
  signal?: AbortSignal,
): Promise<WorkspaceSemanticSearchResponse> {
  const response = await fetch(`${API_URL}/search/workspace`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}


export type CaptureRecommendation = {
  item_type: string;
  suggested_space_id: number | null;
  suggested_space_name: string | null;
  confidence: number;
  reason: string;
  evidence: string[];
  similar_items: string[];
  method: string;
};

export async function getCaptureRecommendation(
  payload: {
    company_id: number;
    content: string;
    item_type: string;
    active_space_id?: number | null;
  },
): Promise<CaptureRecommendation> {
  const response = await fetch(
    `${API_URL}/knowledge-spaces/capture-recommendation`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}


export type BusinessGraphNode = {
  id: string;
  kind: string;
  label: string;
  subtitle: string | null;
  status: string | null;
  importance: number;
  source_id: number | null;
  source_count: number;
  source_document_ids: number[];
};

export type BusinessEntityEvidenceSource = {
  source_kind: string;
  source_id: number;
  title: string;
  evidence: string | null;
  confidence: number;
};

export type BusinessEntityRelated = {
  id: number;
  name: string;
  entity_type: string;
  source_count: number;
  shared_source_count: number;
};

export type BusinessEntityDetail = {
  id: number;
  company_id: number;
  name: string;
  entity_type: string;
  description: string | null;
  confidence: number;
  source_count: number;
  evidence_sources: BusinessEntityEvidenceSource[];
  related_entities: BusinessEntityRelated[];
};

export type BusinessGraphEdge = {
  source: string;
  target: string;
  relationship: string;
};

export type BusinessGraphInsight = {
  level: string;
  title: string;
  summary: string;
  evidence: string[];
  recommended_action: string | null;
  target_kind: string | null;
};

export type BusinessEntityIndexStatus = {
  processed_documents: number;
  mapped_documents: number;
  pending_documents: number;
  failed_documents: number;
};

export type BusinessGraphResponse = {
  company_id: number;
  generated_from: Record<string, number>;
  health_score: number;
  health_label: string;
  executive_summary: string;
  nodes: BusinessGraphNode[];
  edges: BusinessGraphEdge[];
  insights: BusinessGraphInsight[];
  entity_index: BusinessEntityIndexStatus;
};

export async function getBusinessGraph(companyId: number, spaceId: number | null = null): Promise<BusinessGraphResponse> {
  const scope = spaceId === null ? "" : `&space_id=${spaceId}`;
  const response = await fetch(`${API_URL}/business-graph?company_id=${companyId}${scope}`, { cache: "no-store" });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function getBusinessEntityDetail(
  companyId: number,
  entityId: number,
): Promise<BusinessEntityDetail> {
  const response = await fetch(
    `${API_URL}/business-graph/${companyId}/entities/${entityId}`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export type BusinessEntityMapResponse = {
  company_id: number;
  source_kind: string;
  source_id: number;
  created: number;
  linked: number;
  model: string;
  pending_documents: number;
  message: string;
  partial?: boolean;
  ai_enriched?: boolean;
  warning?: string | null;
};

export type BusinessEntityBatchResponse = {
  company_id: number;
  processed: number;
  created: number;
  linked: number;
  failed: number;
  pending_documents: number;
  model: string;
  message: string;
  failures: string[];
};

export type BusinessEntityRebuildResponse = {
  company_id: number;
  queued_documents: number;
  model: string;
  message: string;
};

export async function mapDocumentEntities(
  companyId: number,
  documentId: number,
  signal?: AbortSignal,
): Promise<BusinessEntityMapResponse> {
  const response = await fetch(`${API_URL}/documents/${documentId}/entities/map?company_id=${companyId}`, {
    method: "POST",
    signal,
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function mapNewDocumentEntities(
  companyId: number,
  batchSize = 1,
  signal?: AbortSignal,
): Promise<BusinessEntityBatchResponse> {
  const response = await fetch(
    `${API_URL}/business-graph/${companyId}/entities/new-documents?batch_size=${batchSize}`,
    { method: "POST", signal },
  );
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function queueBusinessEntityRebuild(companyId: number): Promise<BusinessEntityRebuildResponse> {
  const response = await fetch(`${API_URL}/business-graph/${companyId}/entities/rebuild`, {
    method: "POST",
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

