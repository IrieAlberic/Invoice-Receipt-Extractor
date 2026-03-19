import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExtractRequest {
  fileBase64: string;
  mimeType: string;
  modelId: string;
  provider: string;
  prompt: string;
  schema: object;
}

interface ExtractResult {
  [key: string]: unknown;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireKey(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`${name} is not set in .env`);
  return val;
}

/**
 * Strip markdown code fences from model output before JSON.parse().
 * Many models wrap their output in ```json ... ```.
 */
function parseJson(raw: string): ExtractResult {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/, "")
    .trim();
  return JSON.parse(cleaned);
}

// ─── Provider Handlers ────────────────────────────────────────────────────────

/**
 * Generic OpenAI-compatible handler.
 * Used by: Groq, Mistral, DeepSeek (all share the same API contract).
 */
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

/**
 * Mistral OCR API.
 * Uses the specialized /v1/ocr endpoint instead of chat completions.
 */
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
        type: "content",
        content: `data:${body.mimeType};base64,${body.fileBase64}`
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

/**
 * HuggingFace Inference API.
 * For vision-language models, uses the chat completions compatible endpoint.
 */
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

/**
 * OCR.space: submits base64 image, returns raw text.
 * Free tier: 25,000 requests/month.
 */
async function handleOcrSpace(body: ExtractRequest): Promise<ExtractResult> {
  const apiKey = requireKey("OCR_SPACE_API_KEY");

  const formData = new FormData();
  formData.append("base64Image", `data:${body.mimeType};base64,${body.fileBase64}`);
  formData.append("language", "eng");
  formData.append("isOverlayRequired", "false");
  formData.append("detectOrientation", "true");
  formData.append("scale", "true");
  formData.append("OCREngine", "2"); // Engine 2 = better for receipts

  const response = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    headers: { "apikey": apiKey },
    body: formData
  });

  const json = await response.json() as {
    ParsedResults?: Array<{ ParsedText?: string }>;
    IsErroredOnProcessing?: boolean;
    ErrorMessage?: string | string[];
  };

  if (json.IsErroredOnProcessing) {
    const msg = Array.isArray(json.ErrorMessage) ? json.ErrorMessage.join(", ") : json.ErrorMessage;
    throw new Error(`OCR.space error: ${msg}`);
  }

  const rawText = json.ParsedResults?.[0]?.ParsedText || "";
  // Return raw text extraction — structured parsing would need an additional LLM call
  return {
    vendorName: "OCR.space (raw)",
    totalAmount: 0,
    currency: "N/A",
    items: [],
    rawText: rawText.trim()
  };
}

/**
 * Mindee Invoice API v4.
 * Free tier: 250 predictions/month.
 */
async function handleMindee(body: ExtractRequest): Promise<ExtractResult> {
  const apiKey = requireKey("MINDEE_API_KEY");

  const formData = new FormData();
  const blob = new Blob(
    [Buffer.from(body.fileBase64, "base64")],
    { type: body.mimeType }
  );
  formData.append("document", blob, "document");

  const response = await fetch("https://api.mindee.net/v1/products/mindee/invoices/v4/predict", {
    method: "POST",
    headers: { "Authorization": `Token ${apiKey}` },
    body: formData
  });

  const json = await response.json() as {
    document?: {
      inference?: {
        prediction?: {
          supplier_name?: { value?: string };
          date?: { value?: string };
          invoice_number?: { value?: string };
          total_amount?: { value?: number };
          total_tax?: { value?: number };
          line_items?: Array<{
            description?: string;
            quantity?: number;
            unit_price?: number;
            total_amount?: number;
          }>;
          locale?: { currency?: string };
        }
      }
    };
    api_request?: { error?: { message?: string } };
  };

  if (!response.ok) throw new Error(`Mindee error ${response.status}: ${json.api_request?.error?.message}`);
  const p = json.document?.inference?.prediction;

  return {
    vendorName: p?.supplier_name?.value || "Unknown",
    date: p?.date?.value || "",
    invoiceNumber: p?.invoice_number?.value || "",
    totalAmount: p?.total_amount?.value || 0,
    taxAmount: p?.total_tax?.value || 0,
    currency: p?.locale?.currency || "EUR",
    items: (p?.line_items || []).map(item => ({
      description: item.description || "",
      quantity: item.quantity || 1,
      unitPrice: item.unit_price || 0,
      totalPrice: item.total_amount || 0
    }))
  };
}

// ─── Provider Router ──────────────────────────────────────────────────────────

async function routeToProvider(body: ExtractRequest): Promise<ExtractResult> {
  const { provider } = body;

  switch (provider) {
    // ✅ Groq — FREE quota daily (LPU inference)
    case "groq":
      return handleOpenAICompatible(body, requireKey("GROQ_API_KEY"), "https://api.groq.com/openai/v1");

    // ✅ Mistral — Free credits / free tier models
    case "mistral":
      if (body.modelId === "mistral-ocr-latest") {
        return handleMistralOCR(body, requireKey("MISTRAL_API_KEY"));
      }
      return handleOpenAICompatible(body, requireKey("MISTRAL_API_KEY"), "https://api.mistral.ai/v1");

    // ✅ DeepSeek — Generous free tier (official API is text-only, use HF or SiliconFlow for vision)
    case "deepseek":
      // If the user has a SiliconFlow key, it's better for vision. Otherwise we use official which might fail for vision.
      const deepseekKey = process.env.SILICONFLOW_API_KEY || process.env.DEEPSEEK_API_KEY || "";
      const deepseekBase = process.env.SILICONFLOW_API_KEY ? "https://api.siliconflow.cn/v1" : "https://api.deepseek.com/v1";
      return handleOpenAICompatible(body, deepseekKey, deepseekBase);

    // ✅ HuggingFace — Free Inference API (rate-limited)
    case "hf":
      return handleHuggingFace(body);

    // ✅ OCR.space — FREE: 25,000 req/month
    case "ocrspace":
      return handleOcrSpace(body);

    // Local models or unknown — placeholder
    case "local":
    default:
      return {
        vendorName: `Local: ${body.modelId}`,
        totalAmount: 0,
        currency: "N/A",
        items: [],
        note: `"${body.modelId}" runs locally. Install it on your machine to run extraction. This is a placeholder for benchmarking visualization.`
      };
  }
}

// NOTE: Google Gemini is handled client-side in src/services/gemini.ts
// (uses VITE_GEMINI_API_KEY exposed to the browser by Vite)

// ─── Express App ──────────────────────────────────────────────────────────────

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json({ limit: "20mb" }));

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      freeProviders: ["google (client-side)", "groq", "mistral", "deepseek", "hf", "ocrspace"]
    });
  });

  // Extraction endpoint
  app.post("/api/extract", async (req, res) => {
    const body = req.body as ExtractRequest;

    if (!body.fileBase64 || !body.mimeType || !body.modelId || !body.provider) {
      res.status(400).json({ error: "Missing required fields: fileBase64, mimeType, modelId, provider" });
      return;
    }

    const startTime = Date.now();

    try {
      const data = await routeToProvider(body);
      const executionTime = Date.now() - startTime;
      res.json({ data, executionTime, model: body.modelId });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown server error";
      console.error(`❌ [${body.provider}/${body.modelId}]`, message);
      res.status(500).json({ error: message });
    }
  });

  // Vite dev middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🚀 Server ready → http://localhost:${PORT}`);
    console.log(`\n   Free providers enabled:`);
    console.log(`   ✅ Google Gemini  (client-side, 1500 req/day)`);
    console.log(`   ✅ Groq           (daily free quota)`);
    console.log(`   ✅ Mistral        (free credits)`);
    console.log(`   ✅ DeepSeek       (free tier)`);
    console.log(`   ✅ HuggingFace    (rate-limited free API)`);
    console.log(`   ✅ OCR.space      (25,000 req/month)\n`);
  });
}

startServer();
