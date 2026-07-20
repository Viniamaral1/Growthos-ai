const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  "http://127.0.0.1:8000/api/v1";


export type Company = {
  id: number;
  name: string;
  website: string | null;
  industry: string;
  target_audience: string;
  brand_tone: string;
  product_description: string;
  created_at: string;
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


type CreateCompanyPayload = {
  name: string;
  website: string | null;
  industry: string;
  target_audience: string;
  brand_tone: string;
  product_description: string;
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
      return String(
        (data as { detail: unknown }).detail,
      );
    }
  } catch {
    // Ignore malformed error bodies.
  }

  return `Request failed with status ${response.status}.`;
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
