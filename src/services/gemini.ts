import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

export interface ReceiptData {
  vendorName: string;
  date: string;
  invoiceNumber: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    expenseAccount?: string;
  }>;
  taxAmount: number;
  totalAmount: number;
  currency: string;
}

export const receiptSchema = {
  type: Type.OBJECT,
  properties: {
    vendorName: { type: Type.STRING, description: "Name of the store or vendor" },
    date: { type: Type.STRING, description: "Date of the transaction (ISO format if possible)" },
    invoiceNumber: { type: Type.STRING, description: "Invoice or receipt number" },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING },
          quantity: { type: Type.NUMBER },
          unitPrice: { type: Type.NUMBER },
          totalPrice: { type: Type.NUMBER },
          expenseAccount: { type: Type.STRING, description: "Matching expense account (e.g., 6061 - Supplies, 6251 - Travel)" },
        },
        required: ["description", "totalPrice"],
      },
    },
    taxAmount: { type: Type.NUMBER },
    totalAmount: { type: Type.NUMBER },
    currency: { type: Type.STRING, description: "Currency code (e.g., EUR, USD)" },
  },
  required: ["vendorName", "totalAmount", "currency"],
};

export interface ExtractionResult {
  id: string;
  data: ReceiptData | null;
  executionTime: number;
  model: string;
  status: 'pending' | 'success' | 'error';
  error?: string;
}

export async function extractReceiptData(
  fileBase64: string,
  mimeType: string,
  modelId: string,
  provider: string,
  ollamaUrl?: string,
  pythonUrl?: string
): Promise<ExtractionResult> {
  const startTime = performance.now();
  const prompt = `Extract all relevant data from this receipt or invoice into the specified JSON format. 
  For each item, try to attribute a logical "expenseAccount" (accounting code) based on the product name (e.g., '6061 - Office Supplies', '6251 - Travel', '6047 - Software'). 
  Be precise with numbers and descriptions. Return ONLY valid JSON.`;

  try {
    if (provider === 'google') {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string;
      if (!apiKey) throw new Error("VITE_GEMINI_API_KEY is not set in .env");

      const ai = new GoogleGenAI({ apiKey });
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: modelId,
        contents: [
          {
            parts: [
              { inlineData: { data: fileBase64, mimeType: mimeType } },
              { text: prompt },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: receiptSchema,
        },
      });

      const endTime = performance.now();
      const data = JSON.parse(response.text || "{}") as ReceiptData;
      return { 
        id: Math.random().toString(36).substr(2, 9),
        data, 
        executionTime: Math.round(endTime - startTime), 
        model: modelId,
        status: 'success'
      };
    } else {
      // Call our local Express server for external providers
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64,
          mimeType,
          modelId,
          provider,
          prompt,
          schema: receiptSchema,
          ollamaUrl,
          pythonUrl
        })
      });

      const text = await response.text();
      if (!response.ok) {
        let errMessage = "Server error during extraction";
        try {
          const errData = JSON.parse(text);
          errMessage = errData.error || errMessage;
        } catch (e) {
          errMessage = text || errMessage;
        }
        throw new Error(errMessage);
      }

      if (!text) {
        throw new Error("Empty response from server");
      }

      const data = JSON.parse(text) as ReceiptData;
      const endTime = performance.now();
      return { 
        id: Math.random().toString(36).substr(2, 9),
        data, 
        executionTime: Math.round(endTime - startTime), 
        model: modelId,
        status: 'success'
      };
    }
  } catch (error: any) {
    const endTime = performance.now();
    return {
      id: Math.random().toString(36).substr(2, 9),
      data: null,
      executionTime: Math.round(endTime - startTime),
      model: modelId,
      status: 'error',
      error: error.message || "An unknown error occurred",
    };
  }
}
