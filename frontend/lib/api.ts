const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  "http://127.0.0.1:8000/api/v1";


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
    }
  | {
      type: "token";
      content: string;
    }
  | {
      type: "done";
      assistant_message: ChatMessage;
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
  useAllDocuments: boolean,
  onEvent: (event: CofounderStreamEvent) => void,
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
        use_all_documents: useAllDocuments,
      }),
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

  while (true) {
    const { value, done } = await reader.read();

    buffer += decoder.decode(
      value,
      { stream: !done },
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

    if (done) {
      break;
    }
  }

  if (buffer.trim()) {
    onEvent(
      JSON.parse(buffer) as CofounderStreamEvent,
    );
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
