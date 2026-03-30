/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { Upload, FileText, Zap, Clock, CheckCircle2, AlertCircle, ChevronRight, Copy, Database, BarChart3, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { extractReceiptData, ExtractionResult, ReceiptData } from './services/gemini';

// ─── Free providers only — grouped by API provider ──────────────────────────
const PROVIDERS = [
  {
    id: 'google',
    name: 'Google Gemini',
    quota: '1 500 req/jour — Gratuit',
    link: 'https://aistudio.google.com/app/apikey',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Rapide, 97% précision, support PDF natif' },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', description: 'Ultra-rapide, optimisé basse latence' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Génération précédente, très stable' },
    ]
  },
  {
    id: 'groq',
    name: 'Groq',
    quota: 'Quota quotidien — Gratuit',
    link: 'https://console.groq.com/keys',
    models: [
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout (Vision)', description: 'Nouveau modèle multimodal puissant' },
      { id: 'groq/compound', name: 'Groq Compound (Vision)', description: 'Modèle vision optimisé par Groq' },
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', description: 'Modèle texte ultra-performant' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', description: 'Modèle rapide et léger' },
    ]
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    quota: 'Crédits offerts — Gratuit',
    link: 'https://console.mistral.ai/api-keys',
    models: [
      { id: 'pixtral-12b-2409', name: 'Pixtral 12B', description: 'Modèle vision open-weights, excellent sur PDF' },
      { id: 'mistral-ocr-latest', name: 'Mistral OCR API', description: 'Spécialisé OCR, gère les mises en page complexes' },
    ]
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    quota: 'API — Gratuit',
    link: 'https://platform.deepseek.com/api_keys',
    models: [
      { id: 'deepseek-ai/deepseek-vl2', name: 'DeepSeek-VL2', description: 'Vision model via SiliconFlow/HF API' },
    ]
  },
  {
    id: 'hf',
    name: 'HuggingFace',
    quota: 'API Interface — Gratuit',
    link: 'https://huggingface.co/settings/tokens',
    models: [
      { id: 'meta-llama/Llama-3.2-11B-Vision-Instruct', name: 'Llama 3.2 Vision 11B', description: 'Meta, open-weights, bon équilibre' },
      { id: 'OpenGVLab/InternVL2-8B', name: 'InternVL2-8B', description: 'Excellent sur documents structurés' },
      { id: 'microsoft/Phi-4-multimodal-instruct', name: 'Phi-4 Vision', description: 'Microsoft, modèle compact haute précision' },
      { id: 'llava-hf/llava-1.5-7b-hf', name: 'LLaVA-1.5 7B', description: 'Référence vision open-source classique' },
      { id: 'Qwen/Qwen2.5-VL-7B-Instruct', name: 'Qwen2.5-VL 7B', description: 'Alibaba, 75% OlmOCR-Bench, multilingue' },
    ]
  },
  {
    id: 'ocrspace',
    name: 'OCR.space',
    quota: '25 000 req/mois — Gratuit',
    link: 'https://ocr.space/ocrapi',
    models: [
      { id: 'ocr-space-engine2', name: 'OCR.space Engine 2', description: 'Moteur IA pour reçus/factures, 26 langues' },
    ]
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    quota: 'Local — Gratuit (VRAM dépendant)',
    link: 'https://ollama.com',
    isLocal: true,
    models: [
      { id: 'MedAIBase/PaddleOCR-VL:0.9b', name: 'PaddleOCR-VL (#1)', description: 'SOTA document parser (0.9B params)' },
      { id: 'moondream', name: 'Moondream (Ultra-Rapide)', description: 'Modèle vision minuscule pour démos rapides' },
      { id: 'qwen3-vl:8b', name: 'Qwen3-VL (SOTA)', description: 'Modèle vision avancé présent sur votre PC' },
      { id: 'qwen2.5-vl', name: 'Qwen2.5-VL (Flagship)', description: 'Nouveau standard (nouveau pull requis)' },
      { id: 'richardyoung/olmocr2:7b-q8', name: 'OlmOCR-2 (#5)', description: 'SOTA vision OCR par AI2' },
      { id: 'maternion/lightonocr-2:latest', name: 'LightOnOCR-2 (#7)', description: 'Ultra-rapide, ~2 Go VRAM' },
      { id: 'llava:latest', name: 'LLaVA (Standard)', description: 'Modèle vision polyvalent' },
    ]
  },
  {
    id: 'python',
    name: 'Microservice Python',
    quota: 'Local — Gratuit',
    link: 'http://localhost:8001',
    isLocal: true,
    models: [
      { id: 'tesseract', name: 'Tesseract', description: 'Moteur classique robuste' },
      { id: 'easyocr', name: 'EasyOCR', description: 'Supporte 80+ langues, basé sur PyTorch' },
      { id: 'paddleocr', name: 'PaddleOCR', description: 'Baidu, excellent sur les reçus' },
      { id: 'docling', name: 'Docling', description: 'IBM, spécialisé structuration document' },
      { id: 'rapidocr', name: 'RapidOCR', description: 'Version légère et performante de Paddle' },
    ]
  },
];

interface ProviderConfig {
  enabled: boolean;
  selectedModelIds: string[];
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [results, setResults] = useState<ExtractionResult[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [ollamaUrl, setOllamaUrl] = useState("");
  const [pythonUrl, setPythonUrl] = useState("");

  // Initialize one entry per provider
  const [activeProviders, setActiveProviders] = useState<Record<string, ProviderConfig>>(() => {
    const initial: Record<string, ProviderConfig> = {};
    PROVIDERS.forEach(p => {
      initial[p.id] = {
        enabled: p.isLocal === true,
        selectedModelIds: p.id === 'ollama' ? ['moondream'] : (p.id === 'python' ? ['paddleocr'] : [])
      };
    });
    return initial;
  });

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
      setResults([]);
    }
  };

  const toggleProvider = (providerId: string) => {
    setActiveProviders(prev => ({
      ...prev,
      [providerId]: { ...prev[providerId], enabled: !prev[providerId].enabled }
    }));
  };

  const toggleModelSelection = (providerId: string, modelId: string) => {
    setActiveProviders(prev => {
      const current = prev[providerId].selectedModelIds;
      const next = current.includes(modelId)
        ? current.filter(id => id !== modelId)
        : [...current, modelId];
      return {
        ...prev,
        [providerId]: { ...prev[providerId], selectedModelIds: next }
      };
    });
  };

  const handleExtract = async () => {
    if (!file || !preview) return;

    const selectedTasks: { providerId: string, modelId: string }[] = [];
    (Object.entries(activeProviders) as [string, ProviderConfig][]).forEach(([providerId, config]) => {
      if (config.enabled) {
        config.selectedModelIds.forEach(modelId => {
          selectedTasks.push({ providerId, modelId });
        });
      }
    });

    if (selectedTasks.length === 0) return;

    setIsExtracting(true);
    setResults([]);

    const base64Data = preview.split(',')[1];
    const mimeType = file.type;

    const extractionPromises = selectedTasks.map(({ providerId, modelId }) =>
      extractReceiptData(base64Data, mimeType, modelId, providerId, ollamaUrl, pythonUrl)
    );

    try {
      const newResults = await Promise.all(extractionPromises);
      setResults(newResults);
    } catch (error) {
      console.error("Extraction failed:", error);
    } finally {
      setIsExtracting(false);
    }
  };

  const clearResults = () => {
    setResults([]);
  };

  const getModelInfo = (modelId: string) => {
    for (const p of PROVIDERS) {
      const m = p.models.find(mod => mod.id === modelId);
      if (m) return { provider: p.name, name: m.name };
    }
    return { provider: 'Unknown', name: modelId };
  };

  const calculateAccuracyScore = (data: ReceiptData | null) => {
    if (!data) return 0;
    let score = 0;
    if (data.vendorName) score += 20;
    if (data.totalAmount > 0) score += 20;
    if (data.date) score += 15;
    if (data.currency) score += 15;
    if (data.items && data.items.length > 0) score += 30;
    return score;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Header */}
      <header className="border-b border-[#141414] p-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter uppercase italic font-serif">
            Extractor <span className="not-italic">v1.0</span>
          </h1>
          <p className="text-xs font-mono opacity-60 uppercase tracking-widest mt-1">
            Receipt to ERP JSON Pipeline
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] font-mono opacity-50 uppercase">System Status</p>
            <p className="text-xs font-bold flex items-center gap-1 justify-end">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              Operational
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Upload & Config */}
        <div className="lg:col-span-4 space-y-8">
          <section className="space-y-4">
            <h2 className="text-xs font-mono font-bold uppercase tracking-widest opacity-50 border-b border-[#141414]/10 pb-2">
              01. Source Input
            </h2>
            <div className="relative group">
              <input
                type="file"
                onChange={onFileChange}
                accept="image/*,application/pdf"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className={`border-2 border-dashed border-[#141414] rounded-xl p-8 transition-all duration-300 flex flex-col items-center justify-center gap-4 ${file ? 'bg-white/50' : 'hover:bg-white/30'}`}>
                {preview ? (
                  <div className="relative w-full aspect-[3/4] rounded-lg overflow-hidden border border-[#141414]/20 shadow-xl">
                    <img src={preview} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <p className="text-white text-xs font-bold uppercase">Change File</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-full border border-[#141414] flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Upload size={20} />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold uppercase">Drop Receipt Here</p>
                      <p className="text-[10px] font-mono opacity-50 mt-1">PNG, JPG, PDF (Max 10MB)</p>
                    </div>
                  </>
                )}
              </div>
            </div>
            {file && (
              <div className="flex items-center gap-2 p-3 bg-white/50 rounded-lg border border-[#141414]/10">
                <FileText size={14} className="opacity-50" />
                <span className="text-xs font-mono truncate flex-1">{file.name}</span>
                <span className="text-[10px] font-mono opacity-50">{(file.size / 1024).toFixed(1)} KB</span>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-xs font-mono font-bold uppercase tracking-widest opacity-50 border-b border-[#141414]/10 pb-2">
              02. Cloud-to-Local Tunnels
            </h2>
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 space-y-3">
              <div className="flex flex-col gap-1">
                <p className="text-[10px] font-mono text-amber-800 uppercase leading-tight font-bold">
                  Cloud-to-Local Tunnels (Shared Access)
                </p>
              </div>
              <div className="space-y-2">
                <div>
                  <label className="text-[9px] font-bold uppercase opacity-60 ml-1">Ollama Proxy URL (ex: ngrok)</label>
                  <input
                    type="text"
                    placeholder="http://localhost:11434"
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                    className="w-full bg-white border border-[#141414]/10 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#141414]"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase opacity-60 ml-1">Python OCR Proxy URL</label>
                  <input
                    type="text"
                    placeholder="http://localhost:8001"
                    value={pythonUrl}
                    onChange={(e) => setPythonUrl(e.target.value)}
                    className="w-full bg-white border border-[#141414]/10 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#141414]"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xs font-mono font-bold uppercase tracking-widest opacity-50 border-b border-[#141414]/10 pb-2">
              03. Provider Configuration
            </h2>
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {PROVIDERS.map((provider) => {
                const config = activeProviders[provider.id];
                const activeCount = config.selectedModelIds.length;

                return (
                  <div
                    key={provider.id}
                    className={`p-4 rounded-xl border transition-all ${config.enabled
                      ? 'bg-white border-[#141414] shadow-sm'
                      : 'bg-white/20 border-[#141414]/5 opacity-60'
                      }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${config.enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}></div>
                        <h3 className="text-xs font-bold uppercase tracking-tight">
                          {provider.name}
                          {activeCount > 0 && config.enabled && (
                            <span className="ml-2 bg-[#141414] text-white text-[8px] px-1.5 py-0.5 rounded-full">
                              {activeCount}
                            </span>
                          )}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleProvider(provider.id)}
                          className={`text-[10px] font-mono uppercase px-2 py-1 rounded border transition-colors ${config.enabled
                            ? 'bg-[#141414] text-white border-[#141414]'
                            : 'border-[#141414]/20 hover:bg-[#141414]/5'
                            }`}
                        >
                          {config.enabled ? 'Enabled' : 'Disabled'}
                        </button>
                      </div>

                    </div>

                    {config.enabled && (
                      <div className="space-y-2 mt-4 border-t border-[#141414]/5 pt-3">
                        <div className="grid grid-cols-1 gap-2">
                          {provider.models.map(m => (
                            <label
                              key={m.id}
                              className={`flex items-start gap-2 p-2 rounded-lg transition-colors cursor-pointer border ${config.selectedModelIds.includes(m.id)
                                ? 'bg-[#141414]/5 border-[#141414]/10'
                                : 'border-transparent hover:bg-[#141414]/5'
                                }`}
                            >
                              <input
                                type="checkbox"
                                checked={config.selectedModelIds.includes(m.id)}
                                onChange={() => toggleModelSelection(provider.id, m.id)}
                                className="mt-1 accent-[#141414]"
                              />
                              <div className="flex-1">
                                <p className="text-[11px] font-bold uppercase leading-none">{m.name}</p>
                                <p className="text-[9px] font-mono opacity-50 mt-1 line-clamp-1">{m.description}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <button
            onClick={handleExtract}
            disabled={!file || !(Object.values(activeProviders) as ProviderConfig[]).some(p => p.enabled && p.selectedModelIds.length > 0) || isExtracting}
            className="w-full py-6 bg-[#141414] text-[#E4E3E0] rounded-xl font-bold uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-[#2a2a2a] disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
          >
            {isExtracting ? (
              <>
                <div className="w-5 h-5 border-2 border-[#E4E3E0]/30 border-t-[#E4E3E0] rounded-full animate-spin"></div>
                <span>Processing...</span>
              </>
            ) : (
              <>
                <Zap size={20} fill="currentColor" />
                <span>Execute Extraction</span>
              </>
            )}
          </button>
        </div>

        {/* Right Column: Results */}
        <div className="lg:col-span-8 space-y-8">
          <section className="space-y-4">
            <div className="flex justify-between items-end border-b border-[#141414]/10 pb-2">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-mono font-bold uppercase tracking-widest opacity-50">
                  03. Extraction Results
                </h2>
                {results.length > 0 && (
                  <button
                    onClick={clearResults}
                    className="text-[10px] font-mono text-red-500 hover:underline uppercase flex items-center gap-1 ml-4"
                  >
                    <Trash2 size={10} />
                    Clear
                  </button>
                )}
              </div>
              {results.length > 0 && (
                <p className="text-[10px] font-mono opacity-50">
                  {results.length} Models Compared
                </p>
              )}
            </div>

            {results.length === 0 && !isExtracting ? (
              <div className="h-[600px] border border-[#141414]/10 rounded-2xl flex flex-col items-center justify-center text-center p-12 bg-white/10">
                <div className="w-16 h-16 rounded-full bg-white/30 flex items-center justify-center mb-4 opacity-20">
                  <Database size={32} />
                </div>
                <p className="text-sm font-bold opacity-30 uppercase tracking-widest">Awaiting Input Data</p>
                <p className="text-xs font-mono opacity-20 mt-2 max-w-xs">
                  Upload a document and select models to begin the extraction and performance analysis.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Comparison Table */}
                {results.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl border border-[#141414] overflow-hidden shadow-lg"
                  >
                    <div className="bg-[#141414] text-[#E4E3E0] p-4 flex items-center gap-2">
                      <BarChart3 size={16} />
                      <h3 className="text-xs font-bold uppercase tracking-wider">Performance Comparison Matrix</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[#141414]/10 bg-[#E4E3E0]/30">
                            <th className="p-4 text-[10px] font-mono uppercase opacity-50">Model</th>
                            <th className="p-4 text-[10px] font-mono uppercase opacity-50">Provider</th>
                            <th className="p-4 text-[10px] font-mono uppercase opacity-50">Latency</th>
                            <th className="p-4 text-[10px] font-mono uppercase opacity-50">Data Score</th>
                            <th className="p-4 text-[10px] font-mono uppercase opacity-50">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.map((result) => {
                            const info = getModelInfo(result.model);
                            const score = calculateAccuracyScore(result.data);
                            return (
                              <tr key={result.model} className="border-b border-[#141414]/5 hover:bg-[#141414]/5 transition-colors">
                                <td className="p-4 text-xs font-bold">{info.name}</td>
                                <td className="p-4 text-[10px] font-mono opacity-60 uppercase">{info.provider}</td>
                                <td className="p-4 text-xs font-mono">
                                  <span className={`px-2 py-1 rounded ${result.executionTime < 2000 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {result.executionTime}ms
                                  </span>
                                </td>
                                <td className="p-4">
                                  <div className="flex items-center gap-2">
                                    <div className="w-16 h-1.5 bg-[#E4E3E0] rounded-full overflow-hidden">
                                      <div
                                        className={`h-full transition-all duration-1000 ${score > 80 ? 'bg-emerald-500' : score > 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                        style={{ width: `${score}%` }}
                                      ></div>
                                    </div>
                                    <span className="text-[10px] font-mono font-bold">{score}%</span>
                                  </div>
                                </td>
                                <td className="p-4">
                                  {result.error ? (
                                    <span className="text-[10px] font-mono text-red-500 uppercase font-bold">Error</span>
                                  ) : (
                                    <span className="text-[10px] font-mono text-emerald-500 uppercase font-bold">Success</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}

                <AnimatePresence mode="popLayout">
                  {results.map((result, idx) => (
                    <motion.div
                      key={result.model}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="bg-white rounded-2xl border border-[#141414]/10 overflow-hidden shadow-sm"
                    >
                      {/* Result Header */}
                      <div className="bg-[#141414] text-[#E4E3E0] p-4 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center font-mono text-xs font-bold">
                            0{idx + 1}
                          </div>
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wider">
                              {(() => {
                                for (const p of PROVIDERS) {
                                  const m = p.models.find(mod => mod.id === result.model);
                                  if (m) return `${p.name} - ${m.name}`;
                                }
                                return result.model;
                              })()}
                            </p>
                            <p className="text-[10px] font-mono opacity-50">{result.model}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="text-[9px] font-mono opacity-50 uppercase">Latency</p>
                            <p className="text-sm font-bold flex items-center gap-1">
                              <Clock size={12} className="text-emerald-500" />
                              {result.executionTime}ms
                            </p>
                          </div>
                          <button
                            onClick={() => copyToClipboard(JSON.stringify(result.data, null, 2))}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                            title="Copy JSON"
                          >
                            <Copy size={16} />
                          </button>
                        </div>
                      </div>

                      {/* Result Content */}
                      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                        {result.error ? (
                          <div className="col-span-2 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3">
                            <AlertCircle className="text-red-500 shrink-0" size={18} />
                            <div>
                              <p className="text-sm font-bold text-red-900">Extraction Failed</p>
                              <p className="text-xs text-red-700 mt-1 font-mono">{result.error}</p>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Structured Data View */}
                            <div className="space-y-6">
                              <div className="space-y-1">
                                <p className="text-[10px] font-mono opacity-50 uppercase tracking-widest">Vendor Information</p>
                                <p className="text-lg font-serif italic font-bold">{result.data?.vendorName}</p>
                                <div className="flex gap-4 mt-2">
                                  <div>
                                    <p className="text-[9px] font-mono opacity-50 uppercase">Date</p>
                                    <p className="text-xs font-bold">{result.data?.date || 'N/A'}</p>
                                  </div>
                                  <div>
                                    <p className="text-[9px] font-mono opacity-50 uppercase">Invoice #</p>
                                    <p className="text-xs font-bold">{result.data?.invoiceNumber || 'N/A'}</p>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <p className="text-[10px] font-mono opacity-50 uppercase tracking-widest">Line Items</p>
                                <div className="space-y-1">
                                  {result.data?.items.map((item, i) => (
                                    <div key={i} className="flex justify-between items-start p-2 bg-[#E4E3E0]/30 rounded-lg text-xs">
                                      <div className="flex-1">
                                        <p className="font-bold">{item.description}</p>
                                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                          <p className="text-[10px] opacity-50 font-mono">
                                            {item.quantity} x {item.unitPrice} {result.data?.currency}
                                          </p>
                                          {item.expenseAccount && (
                                            <span className="text-[9px] font-bold bg-[#141414]/10 text-[#141414] px-1.5 py-0.5 rounded border border-[#141414]/20 uppercase tracking-tighter">
                                              Compte: {item.expenseAccount}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <p className="font-bold shrink-0 ml-2">{item.totalPrice} {result.data?.currency}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div className="pt-4 border-t border-[#141414]/10 flex justify-between items-end">
                                <div>
                                  <p className="text-[9px] font-mono opacity-50 uppercase">Tax</p>
                                  <p className="text-sm font-bold">{result.data?.taxAmount} {result.data?.currency}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-[9px] font-mono opacity-50 uppercase">Total Amount</p>
                                  <p className="text-2xl font-bold tracking-tighter">
                                    {result.data?.totalAmount} <span className="text-sm font-normal opacity-50">{result.data?.currency}</span>
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Raw JSON View */}
                            <div className="space-y-2">
                              <p className="text-[10px] font-mono opacity-50 uppercase tracking-widest">Raw JSON Payload</p>
                              <div className="bg-[#141414] rounded-xl p-4 h-[300px] overflow-auto">
                                <pre className="text-[10px] font-mono text-emerald-500/80 leading-relaxed">
                                  {JSON.stringify(result.data, null, 2)}
                                </pre>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {isExtracting && (
                  <div className="p-8 border-2 border-dashed border-[#141414]/10 rounded-2xl flex flex-col items-center justify-center gap-4 bg-white/5 animate-pulse">
                    <div className="w-10 h-10 border-2 border-[#141414]/10 border-t-[#141414] rounded-full animate-spin"></div>
                    <p className="text-xs font-mono opacity-50 uppercase tracking-widest">Analyzing with remaining models...</p>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto p-6 border-t border-[#141414]/10 mt-12 flex flex-col sm:flex-row justify-between items-center gap-4 opacity-40">
        <p className="text-[10px] font-mono uppercase tracking-widest">
          © 2026 AI Studio Build • Performance Benchmarking Tool
        </p>
        <div className="flex gap-6 text-[10px] font-mono uppercase tracking-widest">
          <a href="#" className="hover:underline">Documentation</a>
          <a href="#" className="hover:underline">API Reference</a>
          <a href="#" className="hover:underline">Privacy</a>
        </div>
      </footer>
    </div>
  );
}
