import type { VercelRequest, VercelResponse } from '@vercel/node';

// Types and helper functions from server.ts
interface ExtractRequest {
  fileBase64: string;
  mimeType: string;
  prompt: string;
  provider: string;
  modelId: string;
  ollamaUrl?: string;
  pythonUrl?: string;
}

interface ExtractResult {
  vendorName: string;
  date?: string;
  invoiceNumber?: string;
  totalAmount: number;
  taxAmount?: number;
  currency: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    expenseAccount?: string;
  }>;
  rawText?: string;
}

function parseJson(content: string): ExtractResult {
  const clean = content.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch (e) {
    return {
      vendorName: "Parse Error",
      totalAmount: 0,
      currency: "N/A",
      items: [],
      rawText: clean
    };
  }
}

function requireKey(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`${name} is not set in environment`);
  return val;
}

// ─── Provider Handlers ───────────────────────────────────────────────────────

async function handleOpenAICompatible(
  body: ExtractRequest,
  apiKey: string,
  baseUrl: string
): Promise<ExtractResult> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: body.modelId,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `${body.prompt}\n\nReturn ONLY valid JSON, no markdown.` },
            { type: "image_url", image_url: { url: `data:${body.mimeType};base64,${body.fileBase64}` } }
          ]
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 2048
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${baseUrl} error ${response.status}: ${text.slice(0, 100)}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`${baseUrl} returned invalid JSON: ${text.slice(0, 100)}`);
  }

  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from API");
  return parseJson(content);
}

async function handleMistralOCR(
  body: ExtractRequest,
  apiKey: string
): Promise<ExtractResult> {
  const response = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: body.modelId,
      document: {
        type: "document_url",
        document_url: `data:${body.mimeType};base64,${body.fileBase64}`
      }
    })
  });

  const json = await response.json() as any;
  if (!response.ok) throw new Error(`Mistral OCR error ${response.status}: ${JSON.stringify(json)}`);
  
  const fullText = (json.pages || []).map((p: any) => p.markdown || "").join("\n\n");
  
  return {
    vendorName: "Mistral OCR (raw)",
    totalAmount: 0,
    currency: "N/A",
    items: [],
    rawText: fullText
  };
}

async function handleHuggingFace(body: ExtractRequest): Promise<ExtractResult> {
  const apiKey = requireKey("HF_API_KEY");

  const response = await fetch(`https://router.huggingface.co/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: body.modelId,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `${body.prompt}\n\nReturn ONLY valid JSON, no markdown.` },
            { type: "image_url", image_url: { url: `data:${body.mimeType};base64,${body.fileBase64}` } }
          ]
        }
      ],
      max_tokens: 2048
    })
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`HuggingFace error ${response.status}: ${text.slice(0, 100)}`);

  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`HuggingFace returned invalid JSON: ${text.slice(0, 100)}`);
  }

  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from HuggingFace");
  return parseJson(content);
}

async function handleOcrSpace(body: ExtractRequest): Promise<ExtractResult> {
  const apiKey = requireKey("OCR_SPACE_API_KEY");

  const formData = new URLSearchParams();
  formData.append("base64Image", `data:${body.mimeType};base64,${body.fileBase64}`);
  formData.append("apikey", apiKey);
  formData.append("language", "fre");
  formData.append("isOverlayRequired", "false");

  const response = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    body: formData
  });

  const json = await response.json() as any;
  if (!response.ok) throw new Error(`OCR.space error: ${JSON.stringify(json)}`);

  const text = json.ParsedResults?.[0]?.ParsedText || "";
  
  return {
    vendorName: "OCR.space (raw)",
    totalAmount: 0,
    currency: "N/A",
    items: [],
    rawText: text
  };
}

// ─── Local Handlers (Ollama & Python) ───────────────────────────────────────

async function handleOllama(body: ExtractRequest): Promise<ExtractResult> {
  const baseUrl = body.ollamaUrl ? `${body.ollamaUrl}/api/chat` : "http://localhost:11434/api/chat";
  
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: body.modelId,
      messages: [
        {
          role: "user",
          content: body.prompt,
          images: [body.fileBase64]
        }
      ],
      stream: false,
      format: "json"
    })
  });

  const json = await response.json() as any;
  if (!response.ok) throw new Error(`Ollama error ${response.status}: ${JSON.stringify(json)}`);
  
  const content = json.message?.content || "";
  return parseJson(content);
}

async function handlePythonOCR(body: ExtractRequest): Promise<ExtractResult> {
  const engine = body.modelId; // tesseract, easyocr, paddleocr, etc.
  const baseUrl = body.pythonUrl ? `${body.pythonUrl}/ocr/${engine}` : `http://localhost:8001/ocr/${engine}`;
  
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_base64: body.fileBase64,
      mime_type: body.mimeType
    })
  });

  const json = await response.json() as any;
  if (!response.ok) throw new Error(`Python Microservice (${engine}) error ${response.status}: ${JSON.stringify(json)}`);
  
  // Adapt this based on the actual Python microservice response structure
  return {
    vendorName: json.vendor || `Python-${engine}`,
    totalAmount: json.total || 0,
    currency: json.currency || "EUR",
    items: json.items || [],
    rawText: json.raw_text || ""
  };
}

// ─── Main Handler ───────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Setup
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const body = req.body as ExtractRequest;

  try {
    let result: ExtractResult;

    switch (body.provider) {
      case "groq":
        result = await handleOpenAICompatible(body, requireKey("GROQ_API_KEY"), "https://api.groq.com/openai/v1");
        break;
      case "mistral":
        if (body.modelId === "mistral-ocr-latest") {
          result = await handleMistralOCR(body, requireKey("MISTRAL_API_KEY"));
        } else {
          result = await handleOpenAICompatible(body, requireKey("MISTRAL_API_KEY"), "https://api.mistral.ai/v1");
        }
        break;
      case "deepseek":
        const siliconKey = process.env.SILICONFLOW_API_KEY || "";
        const deepseekKey = process.env.DEEPSEEK_API_KEY || "";
        
        // Default to DeepSeek official
        let targetKey = deepseekKey || siliconKey;
        let targetBase = "https://api.deepseek.com/v1";
        
        // FORCE SiliconFlow if vision is required (VL models) because DeepSeek official is text-only
        if (body.modelId.toLowerCase().includes("vl") || (!deepseekKey && siliconKey)) {
          if (!siliconKey) throw new Error("SiliconFlow API Key is required for DeepSeek Vision/VL models.");
          targetKey = siliconKey;
          targetBase = "https://api.siliconflow.cn/v1";
        }
        
        result = await handleOpenAICompatible(body, targetKey, targetBase);
        break;
      case "hf":
        result = await handleHuggingFace(body);
        break;
      case "ocrspace":
        result = await handleOcrSpace(body);
        break;
      case "ollama":
        result = await handleOllama(body);
        break;
      case "python":
        result = await handlePythonOCR(body);
        break;
      default:
        throw new Error(`Unknown provider: ${body.provider}`);
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error(`[${body.provider}/${body.modelId}] Error:`, error.message);
    return res.status(500).json({ error: error.message });
  }
}
