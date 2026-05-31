import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, FileText, Loader2, CheckCircle2, XCircle, Pencil, Trash2,
  Save, X, Battery, TrendingUp, AlertTriangle, ChevronDown, ChevronUp,
  Zap, Car, Thermometer, Wind, Waves, Flame, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAiHeaders } from "@/lib/ai-key";
import MonthlyHistoryGrid, { type MesOrigem } from "@/components/monthly-history-grid";
import TariffPeriodEditor from "@/components/tariff-period-editor";
import ConfidenceIndicator, { calcConfidence } from "@/components/confidence-indicator";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Types ────────────────────────────────────────────────────────────────────
export interface LeituraMensal { mes: string; consumo: number; }

export interface InvoiceData {
  consumoTotal?: number;
  consumoMensal?: number;
  consumoAnual?: number;
  consumoPonta?: number;
  consumoCheio?: number;
  consumoVazio?: number;
  potenciaContratada?: number;
  precoKwh?: number;
  operador?: string;
  tarifario?: string;
  dataInicio?: string;
  dataFim?: string;
  periodoMeses?: number;
  leiturasMensais?: LeituraMensal[];
  historicoMensalGrafico?: LeituraMensal[];
  mesesNoGrafico?: number;
  consumoAnualGrafico?: number;
  sazonalidade?: string;
  confianca: number;
  notas?: string;
}

interface ParsedInvoice {
  id: string;
  fileName: string;
  status: "pending" | "parsing" | "done" | "error";
  data?: InvoiceData;
  edits?: Partial<InvoiceData>;
  showEdit?: boolean;
  error?: string;
}

export interface ConsumoData {
  consumoAnual: number;
  coberturaMeta: number;
  crescimentoFuturo: number;
  incluirBateria: boolean;
  horasAutonomia: number;
  percVazio: number;
  percCheio: number;
  percPonta: number;
  perfilConsumo: "residencial" | "comercial" | "industrial";
  equipamentosFuturos: string[];
  precoKwh: number;
  /** 12 monthly values (Jan–Dez) in kWh — populated from invoice charts or manual entry */
  historicoMensal?: (number | null)[];
  /** 12 origin tags aligned with `historicoMensal`: "fatura" | "estimado" | "manual" | null */
  mesesOrigem?: MesOrigem[];
}

export const DEFAULT_CONSUMO_DATA: ConsumoData = {
  consumoAnual: 3500,
  coberturaMeta: 80,
  crescimentoFuturo: 0,
  incluirBateria: false,
  horasAutonomia: 4,
  percVazio: 40,
  percCheio: 35,
  percPonta: 25,
  perfilConsumo: "residencial",
  equipamentosFuturos: [],
  precoKwh: 0.18,
};

// ─── Appliances catalogue ─────────────────────────────────────────────────────
const APPLIANCES = [
  { id: "ve",          label: "Veículo Elétrico",        kwhAno: 2500, hint: "~40 km/dia",                  Icon: Car },
  { id: "ve2",         label: "2.º Veículo Elétrico",    kwhAno: 2500, hint: "~40 km/dia",                  Icon: Car },
  { id: "bombaCalor",  label: "Bomba de Calor (AVAC)",   kwhAno: 2500, hint: "aquecimento + arrefecimento",  Icon: Thermometer },
  { id: "ar",          label: "Ar Condicionado",         kwhAno: 800,  hint: "uso moderado < 6h/dia",        Icon: Wind },
  { id: "piscina",     label: "Piscina",                 kwhAno: 2000, hint: "bomba + aquecimento",          Icon: Waves },
  { id: "aquec",       label: "Aquecimento Elétrico",    kwhAno: 1500, hint: "convectores ou resistências",  Icon: Flame },
];

// ─── Month mapping ────────────────────────────────────────────────────────────
const MES_MAP: Record<string, number> = {
  jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12
};
const MES_LABELS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
function parseMesIndex(mes: string): number {
  return (MES_MAP[mes.toLowerCase().slice(0,3)] ??1) - 1;
}

// ─── Consolidation ────────────────────────────────────────────────────────────
async function readApiError(resp: Response): Promise<string> {
  try {
    const json = await resp.json() as { error?: unknown; message?: unknown };
    const msg = json.error ?? json.message;
    if (msg) return String(msg);
  } catch {
    try {
      const text = await resp.text();
      if (text.trim()) return text.trim();
    } catch {
      // ignore
    }
  }
  return `HTTP ${resp.status}`;
}

type FonteEstimativa = "grafico_12m" | "grafico_parcial" | "faturas_multiplas" | "fatura_unica" | "extrapolacao";

interface ConsolidatedData {
  consumoAnualEstimado: number;
  consumoMensalMedio: number;
  mesesCobertos: number;
  percVazio: number | null;
  percCheio: number | null;
  percPonta: number | null;
  operador?: string;
  tarifario?: string;
  potenciaContratada?: number;
  precoKwh?: number;
  monthlyKwh: (number | null)[];
  monthlyOrigins: MesOrigem[];
  sazonalidade?: string;
  fonteEstimativa: FonteEstimativa;
  mesesNoGrafico: number;
  alertas: string[];
}

function consolidateInvoices(invoices: ParsedInvoice[]): ConsolidatedData | null {
  const done = invoices.filter(i => i.status === "done" && i.data);
  if (!done.length) return null;

  let totalKwh = 0, totalMonths = 0;
  let pontaTotal = 0, cheioTotal = 0, vazioTotal = 0, tarifaCount = 0;
  const operadoresSet = new Set<string>();
  const tarifariosSet = new Set<string>();
  const potencias: number[] = [];
  const precos: number[] = [];
  const monthlyKwh: (number | null)[] = Array(12).fill(null);
  const monthlyOrigins: MesOrigem[] = Array(12).fill(null);

  // Collect chart-based monthly history across all invoices
  const graficoMeses: LeituraMensal[] = [];
  const sazonalidades: string[] = [];

  // Best AI-computed chart annual value across all invoices
  let melhorConsumoAnualGrafico: number | null = null;
  let melhorMesesNoGrafico = 0;

  for (const inv of done) {
    const d = { ...inv.data!, ...inv.edits };
    const meses = d.periodoMeses ?? 1;
    const kwh = d.consumoTotal ?? (d.consumoMensal ? d.consumoMensal * meses : d.consumoAnual ? d.consumoAnual / 12 * meses : null);
    if (kwh != null) { totalKwh += kwh; totalMonths += meses; }

    if (d.consumoPonta != null && d.consumoCheio != null && d.consumoVazio != null) {
      const t = d.consumoPonta + d.consumoCheio + d.consumoVazio || 1;
      pontaTotal += (d.consumoPonta / t) * 100;
      cheioTotal += (d.consumoCheio / t) * 100;
      vazioTotal += (d.consumoVazio / t) * 100;
      tarifaCount++;
    }
    if (d.operador) operadoresSet.add(d.operador);
    if (d.tarifario) tarifariosSet.add(d.tarifario);
    if (d.potenciaContratada) potencias.push(d.potenciaContratada);
    if (d.precoKwh) precos.push(d.precoKwh);
    if (d.sazonalidade) sazonalidades.push(d.sazonalidade);

    // Track the best AI-computed chart estimate (most months wins)
    const invMesesGrafico = d.mesesNoGrafico ?? (d.historicoMensalGrafico?.length ?? 0);
    if (d.consumoAnualGrafico != null && invMesesGrafico > melhorMesesNoGrafico) {
      melhorConsumoAnualGrafico = d.consumoAnualGrafico;
      melhorMesesNoGrafico = invMesesGrafico;
    }

    // Build monthly bar chart: prefer chart history over text readings
    const historico = (d.historicoMensalGrafico?.length ??0) > 0
      ?d.historicoMensalGrafico!
      : (d.leiturasMensais ??[]);

    for (const l of historico) {
      const idx = parseMesIndex(l.mes);
      if (idx >= 0 && idx < 12) {
        monthlyKwh[idx] = (monthlyKwh[idx] ??0) + l.consumo;
        monthlyOrigins[idx] = "fatura";
      }
    }

    // Accumulate unique chart readings from array (de-dup by parsed month index)
    for (const l of d.historicoMensalGrafico ??[]) {
      const idx = parseMesIndex(l.mes);
      if (!graficoMeses.some(g => parseMesIndex(g.mes) === idx)) graficoMeses.push(l);
    }
  }

  // ─── Choose best annual estimate ──────────────────────────────────────────
  // Priority:
  //   1. chart array ≥ 12 months  → real sum
  //   2. AI consumoAnualGrafico ≥ 12 months → direct AI value
  //   3. AI consumoAnualGrafico  3–11 months → direct AI value (média×12 done by AI)
  //   4. chart array 3–11 months → frontend média × 12
  //   5. multiple invoices       → weighted average
  //   6. single invoice          → extrapolation (with warning)
  const totalMesesGraficoArray = graficoMeses.length;
  let consumoAnualEstimado: number;
  let fonteEstimativa: FonteEstimativa;
  let mesesNoGraficoFinal = 0;

  if (totalMesesGraficoArray >= 12) {
    consumoAnualEstimado = Math.round(graficoMeses.reduce((s, l) => s + l.consumo, 0));
    fonteEstimativa = "grafico_12m";
    mesesNoGraficoFinal = totalMesesGraficoArray;
  } else if (melhorConsumoAnualGrafico != null && melhorMesesNoGrafico >= 12) {
    // AI read a 12-month chart and computed the annual total directly
    consumoAnualEstimado = Math.round(melhorConsumoAnualGrafico);
    fonteEstimativa = "grafico_12m";
    mesesNoGraficoFinal = melhorMesesNoGrafico;
  } else if (melhorConsumoAnualGrafico != null && melhorMesesNoGrafico >= 3) {
    // AI read a partial chart and extrapolated to 12 months
    consumoAnualEstimado = Math.round(melhorConsumoAnualGrafico);
    fonteEstimativa = "grafico_parcial";
    mesesNoGraficoFinal = melhorMesesNoGrafico;
  } else if (totalMesesGraficoArray >= 3) {
    // Frontend has individual readings from chart array
    const mediaGrafico = graficoMeses.reduce((s, l) => s + l.consumo, 0) / totalMesesGraficoArray;
    consumoAnualEstimado = Math.round(mediaGrafico * 12);
    fonteEstimativa = "grafico_parcial";
    mesesNoGraficoFinal = totalMesesGraficoArray;
  } else if (done.length > 1 && totalMonths >= 2) {
    const media = totalKwh / totalMonths;
    consumoAnualEstimado = Math.round(media * 12);
    fonteEstimativa = "faturas_multiplas";
    mesesNoGraficoFinal = 0;
  } else {
    const media = totalMonths > 0 ?totalKwh / totalMonths : 0;
    consumoAnualEstimado = Math.round(media * 12);
    fonteEstimativa = totalMonths === 1 ?"fatura_unica" : "extrapolacao";
    mesesNoGraficoFinal = 0;
  }

  const consumoMensalMedio = Math.round(consumoAnualEstimado / 12);

  const alertas: string[] = [];
  if (fonteEstimativa === "grafico_parcial") {
    alertas.push(`Gráfico com ${mesesNoGraficoFinal} ${mesesNoGraficoFinal === 1 ?"mês" : "meses"} — consumo anual estimado por média mensal × 12.`);
  } else if (fonteEstimativa === "fatura_unica" || fonteEstimativa === "extrapolacao") {
    alertas.push(`Sem gráfico de histórico na fatura — estimativa anual por extrapolação do mês atual. Considere carregar mais faturas para maior precisão.`);
  }
  if (totalMonths > 14) alertas.push("Mais de 12 meses de dados detetados — verifique faturas duplicadas.");

  // Determine dominant seasonality
  const sazonalidade = sazonalidades.length > 0
    ?sazonalidades.sort((a, b) =>
        sazonalidades.filter(s => s === b).length - sazonalidades.filter(s => s === a).length
      )[0]
    : undefined;

  return {
    consumoAnualEstimado,
    consumoMensalMedio,
    mesesCobertos: Math.min(mesesNoGraficoFinal > 0 ?mesesNoGraficoFinal : totalMonths, 12),
    percVazio:  tarifaCount > 0 ?Math.round(vazioTotal  / tarifaCount) : null,
    percCheio:  tarifaCount > 0 ?Math.round(cheioTotal  / tarifaCount) : null,
    percPonta:  tarifaCount > 0 ?Math.round(pontaTotal  / tarifaCount) : null,
    operador:            [...operadoresSet].join(", ") || undefined,
    tarifario:           [...tarifariosSet].join(", ") || undefined,
    potenciaContratada:  potencias[0],
    precoKwh:            precos.length ?precos.reduce((a,b)=>a+b,0)/precos.length : undefined,
    monthlyKwh,
    monthlyOrigins,
    sazonalidade,
    fonteEstimativa,
    mesesNoGrafico: mesesNoGraficoFinal,
    alertas,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
interface Props { data: ConsumoData; onChange: (d: ConsumoData) => void; }

export default function WizardStep1({ data, onChange }: Props) {
  const [inputMode, setInputMode] = useState<"faturas" | "manual">("faturas");
  const [manualSubMode, setManualSubMode] = useState<"anual" | "mensal" | "avancado">("anual");
  const [monthlyInputs, setMonthlyInputs] = useState<string[]>(() =>
    data.historicoMensal?.map(v => (v != null ? String(v) : "")) ?? Array(12).fill("")
  );
  const [showMonthlyGrid, setShowMonthlyGrid] = useState(false);
  const [invoices, setInvoices] = useState<ParsedInvoice[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [invoiceText, setInvoiceText] = useState("");
  const [isParsingText, setIsParsingText] = useState(false);
  const [showAppliances, setShowAppliances] = useState(false);
  const [autoApplied, setAutoApplied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Stable refs so the auto-apply effect never has stale closures
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const dataRef = useRef(data);
  dataRef.current = data;

  const set = useCallback((patch: Partial<ConsumoData>) => onChange({ ...data, ...patch }), [data, onChange]);

  // Auto-apply consolidated invoice data to parent state whenever invoices change
  useEffect(() => {
    if (inputMode !== "faturas") return;
    const c = consolidateInvoices(invoices);
    if (!c || c.consumoAnualEstimado <= 0) return;
    const patch: Partial<ConsumoData> = { consumoAnual: c.consumoAnualEstimado };
    if (c.percVazio != null) {
      patch.percVazio = c.percVazio;
      patch.percCheio = c.percCheio!;
      patch.percPonta = c.percPonta!;
    }
    if (c.precoKwh) patch.precoKwh = c.precoKwh;
    // Carry monthly chart history + origins into ConsumoData
    if (c.monthlyKwh.some(v => v != null)) {
      patch.historicoMensal = c.monthlyKwh;
      patch.mesesOrigem = c.monthlyOrigins;
    }
    onChangeRef.current({ ...dataRef.current, ...patch });
    setAutoApplied(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, inputMode]);

  // Derived: total appliance consumption
  const extraKwh = APPLIANCES
    .filter(a => data.equipamentosFuturos.includes(a.id))
    .reduce((s, a) => s + a.kwhAno, 0);
  const extraPerc = data.consumoAnual > 0 ?Math.round((extraKwh / data.consumoAnual) * 100) : 0;

  // ── Invoice parsing ─────────────────────────────────────────────────────────
  const parseFile = useCallback(async (file: File) => {
    const id = Math.random().toString(36).slice(2);
    setInvoices(prev => [...prev, { id, fileName: file.name, status: "parsing" }]);
    try {
      const aiHeaders = getAiHeaders();
      if (!("x-anthropic-api-key" in aiHeaders)) {
        throw new Error("Adicione a chave de IA nas Definições da Empresa antes de carregar faturas.");
      }
      const fd = new FormData();
      fd.append("file", file);
      const resp = await fetch(`${BASE}/api/tools/parse-invoice`, { method: "POST", headers: aiHeaders, body: fd });
      if (!resp.ok) throw new Error(await readApiError(resp));
      const invData: InvoiceData = await resp.json();
      setInvoices(prev => prev.map(i => i.id === id ?{ ...i, status: "done", data: invData } : i));
    } catch (err) {
      const message = err instanceof Error ?err.message : "Erro ao processar fatura";
      setInvoices(prev => prev.map(i => i.id === id ?{ ...i, status: "error", error: message } : i));
      toast({ title: `Erro ao processar ${file.name}`, description: message, variant: "destructive" });
    }
  }, [toast]);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const valid = Array.from(files).filter(f =>
      f.type === "application/pdf" || f.type.startsWith("image/")
    );
    if (!valid.length) { toast({ title: "Formato não suportado. Use PDF ou imagem.", variant: "destructive" }); return; }
    valid.forEach(parseFile);
  }, [parseFile, toast]);

  const parseInvoiceText = useCallback(async () => {
    if (invoiceText.trim().length < 20) {
      toast({ title: "Cole texto da fatura primeiro", variant: "destructive" });
      return;
    }
    const id = Math.random().toString(36).slice(2);
    setIsParsingText(true);
    setInvoices(prev => [...prev, { id, fileName: "Texto da fatura", status: "parsing" }]);
    try {
      const resp = await fetch(`${BASE}/api/tools/parse-invoice-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAiHeaders() },
        body: JSON.stringify({ texto: invoiceText }),
      });
      if (!resp.ok) throw new Error(await readApiError(resp));
      const invData: InvoiceData = await resp.json();
      setInvoices(prev => prev.map(i => i.id === id ?{ ...i, status: "done", data: invData } : i));
      toast({ title: "Texto da fatura analisado com IA" });
    } catch (err) {
      const message = err instanceof Error ?err.message : "Erro ao analisar texto da fatura";
      setInvoices(prev => prev.map(i => i.id === id ?{ ...i, status: "error", error: message } : i));
      toast({ title: "Erro ao analisar texto da fatura", description: message, variant: "destructive" });
    } finally {
      setIsParsingText(false);
    }
  }, [invoiceText, toast]);

  const applyConsolidated = useCallback(() => {
    const c = consolidateInvoices(invoices);
    if (!c) return;
    const patch: Partial<ConsumoData> = { consumoAnual: c.consumoAnualEstimado };
    if (c.percVazio != null) { patch.percVazio = c.percVazio; patch.percCheio = c.percCheio!; patch.percPonta = c.percPonta!; }
    if (c.precoKwh) patch.precoKwh = c.precoKwh;
    onChange({ ...data, ...patch });
    setAutoApplied(true);
    toast({ title: `Consumo atualizado: ${c.consumoAnualEstimado.toLocaleString("pt-PT")} kWh/ano` });
  }, [invoices, data, onChange, toast]);

  const saveInvoiceEdit = useCallback((id: string, edits: Partial<InvoiceData>) => {
    setInvoices(prev => prev.map(i => i.id === id ?{ ...i, edits, showEdit: false } : i));
  }, []);

  // Tariff sliders — Vazio + Cheio; Ponta = 100 - V - C (min 0)
  const setTarifa = (field: "percVazio" | "percCheio", val: number) => {
    const other = field === "percVazio" ?data.percCheio : data.percVazio;
    const cap = Math.min(val, 100 - other);
    const ponta = Math.max(0, 100 - (field === "percVazio" ?cap : data.percVazio) - (field === "percCheio" ?cap : data.percCheio));
    set({ [field]: cap, percPonta: ponta });
  };

  const consolidated = consolidateInvoices(invoices);
  const doneInvoices = invoices.filter(i => i.status === "done");

  // Merge consolidated origins with any user manual edits (stored in data.mesesOrigem)
  const effectiveOrigins: MesOrigem[] = Array.from({ length: 12 }, (_, i) =>
    data.mesesOrigem?.[i] ?? consolidated?.monthlyOrigins[i] ?? null,
  );
  const effectiveMonthly: (number | null)[] = Array.from({ length: 12 }, (_, i) =>
    data.historicoMensal?.[i] ?? consolidated?.monthlyKwh[i] ?? null,
  );

  const tarifaCompleta =
    (data.percVazio + data.percCheio + data.percPonta) >= 99 &&
    !(data.percVazio === 40 && data.percCheio === 35 && data.percPonta === 25);

  const handleMonthlyGridChange = (vals: (number | null)[], origs: MesOrigem[]) => {
    const filled = vals.filter((v): v is number => v != null && v > 0);
    const newAnnual = filled.length === 12
      ?filled.reduce((s, v) => s + v, 0)
      : filled.length > 0
        ?Math.round((filled.reduce((s, v) => s + v, 0) / filled.length) * 12)
        : data.consumoAnual;
    set({
      historicoMensal: vals,
      mesesOrigem: origs,
      consumoAnual: newAnnual > 0 ?newAnnual : data.consumoAnual,
    });
  };

  const handleTariffChange = (next: { percVazio: number; percCheio: number; percPonta: number; consumoAnual: number }) => {
    set(next);
  };

  return (
    <div className="space-y-5">
      {/* ── Input mode tabs ─────────────────────────────────────────────── */}
      <Tabs value={inputMode} onValueChange={v => setInputMode(v as "faturas" | "manual")}>
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="faturas" className="flex items-center gap-2">
            <FileText size={14} /> Faturas Elétricas
          </TabsTrigger>
          <TabsTrigger value="manual" className="flex items-center gap-2">
            <Zap size={14} /> Introdução Manual
          </TabsTrigger>
        </TabsList>

        {/* ── FATURAS TAB ──────────────────────────────────────────────── */}
        <TabsContent value="faturas" className="mt-4 space-y-4">
          {/* Drop zone */}
          <div
            className={cn(
              "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors select-none",
              isDragging ?"border-primary bg-primary/5" : "border-muted hover:border-primary/50"
            )}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
          >
            <Upload size={28} className="mx-auto mb-2 text-muted-foreground" />
            <p className="font-medium text-sm">Arraste faturas aqui ou clique para selecionar</p>
            <p className="text-xs text-muted-foreground mt-1">PDF ou imagem · até 12 faturas · extração automática com IA</p>
            <input
              ref={fileInputRef} type="file" multiple accept="application/pdf,image/*" className="hidden"
              onChange={e => {
                handleFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />
          </div>

          <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
            <Textarea
              value={invoiceText}
              onChange={(event) => setInvoiceText(event.target.value)}
              placeholder="Ou cole aqui texto da fatura: consumo, potência contratada, período, preço/kWh, leituras por período..."
              rows={3}
            />
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={parseInvoiceText}
                disabled={isParsingText || invoiceText.trim().length < 20}
              >
                {isParsingText ?<Loader2 size={14} className="mr-1.5 animate-spin" /> : <Sparkles size={14} className="mr-1.5" />}
                Analisar texto com IA
              </Button>
            </div>
          </div>

          {/* Invoice list */}
          {invoices.length > 0 && (
            <div className="space-y-2">
              {invoices.map(inv => (
                <InvoiceCard
                  key={inv.id}
                  inv={inv}
                  onRemove={() => setInvoices(prev => prev.filter(i => i.id !== inv.id))}
                  onToggleEdit={() => setInvoices(prev => prev.map(i => i.id === inv.id ?{ ...i, showEdit: !i.showEdit } : i))}
                  onSaveEdit={edits => saveInvoiceEdit(inv.id, edits)}
                />
              ))}
            </div>
          )}

          {/* Consolidated summary */}
          {doneInvoices.length > 0 && consolidated && (
            <div className="rounded-xl border bg-muted/30 overflow-hidden">
              <div className="px-4 py-3 bg-muted/50 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">Resumo Consolidado</p>
                  <Badge variant="outline" className="text-xs">{doneInvoices.length} {doneInvoices.length === 1 ?"fatura" : "faturas"}</Badge>
                  {/* Source badge */}
                  {consolidated.fonteEstimativa === "grafico_12m" && (
                    <Badge className="text-xs bg-emerald-500 hover:bg-emerald-500 gap-1">
                      <CheckCircle2 size={10} /> Gráfico 12 meses
                    </Badge>
                  )}
                  {consolidated.fonteEstimativa === "grafico_parcial" && (
                    <Badge className="text-xs bg-blue-500 hover:bg-blue-500 gap-1">
                      <TrendingUp size={10} /> Gráfico {consolidated.mesesNoGrafico}m
                    </Badge>
                  )}
                  {consolidated.fonteEstimativa === "faturas_multiplas" && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <FileText size={10} /> {consolidated.mesesCobertos} meses
                    </Badge>
                  )}
                  {(consolidated.fonteEstimativa === "fatura_unica" || consolidated.fonteEstimativa === "extrapolacao") && (
                    <Badge variant="outline" className="text-xs gap-1 border-amber-300 text-amber-700 dark:text-amber-400">
                      <AlertTriangle size={10} /> Extrapolação
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {autoApplied ?(
                    <div className="flex items-center gap-1.5">
                      <Badge variant="secondary" className="text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800 gap-1">
                        <CheckCircle2 size={11} /> Aplicado ao estudo
                      </Badge>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={applyConsolidated}>Atualizar</Button>
                    </div>
                  ) : (
                    <Button size="sm" onClick={applyConsolidated}>Aplicar ao Estudo</Button>
                  )}
                </div>
              </div>
              <div className="p-4 space-y-4">
                {/* Key stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Consumo Mensal Médio", value: `${consolidated.consumoMensalMedio} kWh` },
                    { label: "Consumo Anual Estimado", value: `${consolidated.consumoAnualEstimado.toLocaleString("pt-PT")} kWh`, highlight: true },
                    consolidated.potenciaContratada ?{ label: "Potência Contratada", value: `${consolidated.potenciaContratada} kVA` } : null,
                    consolidated.precoKwh ?{ label: "Preço Médio (fatura)", value: `${consolidated.precoKwh.toFixed(4)} €/kWh`, isPrice: true } : null,
                  ].filter(Boolean).map(s => s && (
                    <div
                      key={s.label}
                      onClick={() => s.isPrice && consolidated.precoKwh && set({ precoKwh: consolidated.precoKwh })}
                      className={cn(
                        "rounded-lg p-3 text-center",
                        s.highlight ?"bg-primary/10 border border-primary/20" : "bg-background border",
                        s.isPrice ?"cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors" : ""
                      )}
                      title={s.isPrice ?"Clique para usar este preço no cálculo financeiro" : undefined}
                    >
                      <p className="text-xs text-muted-foreground">{s.label}{s.isPrice ?" ↗" : ""}</p>
                      <p className={cn("font-bold text-sm mt-0.5", s.highlight ?"text-primary" : s.isPrice ?"text-amber-600 dark:text-amber-400" : "")}>{s.value}</p>
                      {s.isPrice && <p className="text-[10px] text-muted-foreground mt-0.5">toque para usar</p>}
                    </div>
                  ))}
                </div>

                {/* Operator/tariff + seasonality info */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {(consolidated.operador || consolidated.tarifario) && (
                    <p className="text-xs text-muted-foreground">
                      {consolidated.operador && <><span className="font-medium">{consolidated.operador}</span>{consolidated.tarifario ?" · " : ""}</>}
                      {consolidated.tarifario && consolidated.tarifario}
                    </p>
                  )}
                  {consolidated.sazonalidade && consolidated.sazonalidade !== "uniforme" && (
                    <p className="text-xs text-muted-foreground">
                      Sazonalidade:{" "}
                      <span className="font-medium">
                        {consolidated.sazonalidade === "verao_pico" ?"pico no verão ☀️" : "pico no inverno 🌧️"}
                      </span>
                    </p>
                  )}
                </div>

                {/* Confidence */}
                <ConfidenceIndicator result={calcConfidence({ origins: effectiveOrigins, tarifaCompleta })} />

                {/* Editable monthly history (12 months with origin tracking) */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Histórico mensal de consumo — edite ou complete os meses em falta
                  </p>
                  <MonthlyHistoryGrid
                    values={effectiveMonthly}
                    origins={effectiveOrigins}
                    onChange={handleMonthlyGridChange}
                  />
                </div>

                {/* Tariff period editor (absolute kWh per period + day/night split) */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Distribuição por períodos tarifários — edite os kWh por período
                  </p>
                  <TariffPeriodEditor
                    percVazio={data.percVazio}
                    percCheio={data.percCheio}
                    percPonta={data.percPonta}
                    consumoAnual={data.consumoAnual}
                    onChange={handleTariffChange}
                  />
                </div>

                {/* Alerts */}
                {consolidated.alertas.map(a => (
                  <div key={a} className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2.5 border border-amber-200 dark:border-amber-800">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {a}
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── MANUAL TAB ───────────────────────────────────────────────── */}
        <TabsContent value="manual" className="mt-4 space-y-4">
          <div className="flex gap-2 flex-wrap">
            {([
              { id: "anual",    label: "Consumo Anual" },
              { id: "mensal",   label: "Consumo Mensal" },
              { id: "avancado", label: "Avançado" },
            ] as const).map(m => (
              <button key={m.id} onClick={() => setManualSubMode(m.id)}
                className={cn("px-4 py-1.5 rounded-full text-sm font-medium border transition-colors",
                  manualSubMode === m.id ?"bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50")}>
                {m.label}
              </button>
            ))}
          </div>

          {/* ── ANUAL mode ───────────────────────────────────────────── */}
          {manualSubMode === "anual" && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Consumo Anual (kWh)</label>
              <Input
                type="number" step="10" min={100} value={data.consumoAnual}
                onChange={e => set({ consumoAnual: Math.max(100, Number(e.target.value)), historicoMensal: undefined })}
              />
              <p className="text-xs text-muted-foreground">
                ≈ {Math.round(data.consumoAnual / 12).toLocaleString("pt-PT")} kWh/mês · {(data.consumoAnual / 365).toFixed(1)} kWh/dia
              </p>
            </div>
          )}

          {/* ── MENSAL mode ──────────────────────────────────────────── */}
          {manualSubMode === "mensal" && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Introduza o consumo de cada mês (kWh). Os valores serão marcados como <strong>manuais</strong>.
                O consumo anual é recalculado automaticamente.
              </p>
              <MonthlyHistoryGrid
                values={effectiveMonthly}
                origins={effectiveOrigins}
                onChange={handleMonthlyGridChange}
              />
              <ConfidenceIndicator result={calcConfidence({ origins: effectiveOrigins, tarifaCompleta })} />
            </div>
          )}

          {manualSubMode === "avancado" && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Consumo Anual (kWh)</label>
              <Input
                type="number" step="10" min={100} value={data.consumoAnual}
                onChange={e => set({ consumoAnual: Math.max(100, Number(e.target.value)) })}
              />
              <p className="text-xs text-muted-foreground">
                ≈ {Math.round(data.consumoAnual / 12).toLocaleString("pt-PT")} kWh/mês · {(data.consumoAnual / 365).toFixed(1)} kWh/dia
              </p>
            </div>
          )}

          {manualSubMode === "avancado" && (
            <div className="space-y-5">
              <Separator />

              {/* Consumption profile */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Perfil de Consumo</label>
                <Select value={data.perfilConsumo} onValueChange={v => set({ perfilConsumo: v as ConsumoData["perfilConsumo"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="residencial">Residencial — consumo principalmente diurno/noturno doméstico</SelectItem>
                    <SelectItem value="comercial">Comercial — consumo predominantemente diurno</SelectItem>
                    <SelectItem value="industrial">Industrial — consumo contínuo ou turnos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Tariff periods */}
              <div className="space-y-2">
                <div>
                  <p className="text-sm font-medium">Distribuição por Períodos Tarifários</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Edite os kWh por período — disponível em faturas bi/tri-horárias</p>
                </div>
                <TariffPeriodEditor
                  percVazio={data.percVazio}
                  percCheio={data.percCheio}
                  percPonta={data.percPonta}
                  consumoAnual={data.consumoAnual}
                  onChange={handleTariffChange}
                />
              </div>

              {/* Future appliances */}
              <div className="space-y-2">
                <button
                  className="flex items-center gap-2 text-sm font-medium w-full text-left"
                  onClick={() => setShowAppliances(!showAppliances)}
                >
                  <TrendingUp size={15} className="text-orange-500" />
                  Equipamentos Futuros
                  {data.equipamentosFuturos.length > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs">{data.equipamentosFuturos.length}</Badge>
                  )}
                  {showAppliances ?<ChevronUp size={14} className="ml-auto" /> : <ChevronDown size={14} className="ml-auto" />}
                </button>
                {showAppliances && (
                  <div className="space-y-2 pl-5">
                    <p className="text-xs text-muted-foreground">Selecione equipamentos que planeia adquirir nos próximos anos</p>
                    {APPLIANCES.map(({ id, label, kwhAno, hint, Icon }) => {
                      const selected = data.equipamentosFuturos.includes(id);
                      return (
                        <label key={id} className={cn(
                          "flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors",
                          selected ?"border-orange-400 bg-orange-50 dark:bg-orange-950/20" : "border-border hover:border-orange-300"
                        )}>
                          <input type="checkbox" checked={selected} className="sr-only"
                            onChange={() => set({ equipamentosFuturos: selected ?data.equipamentosFuturos.filter(e => e !== id) : [...data.equipamentosFuturos, id] })} />
                          <Icon size={16} className={selected ?"text-orange-500" : "text-muted-foreground"} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{label}</p>
                            <p className="text-xs text-muted-foreground">{hint}</p>
                          </div>
                          <span className={cn("text-xs font-semibold shrink-0", selected ?"text-orange-600" : "text-muted-foreground")}>
                            +{kwhAno.toLocaleString("pt-PT")} kWh/ano
                          </span>
                        </label>
                      );
                    })}
                    {data.equipamentosFuturos.length > 0 && (
                      <div className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-800">
                        <div>
                          <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">
                            +{extraKwh.toLocaleString("pt-PT")} kWh/ano adicional
                          </p>
                          <p className="text-xs text-orange-600 dark:text-orange-500 mt-0.5">
                            +{extraPerc}% sobre o consumo atual · Sugerimos definir crescimento futuro em ≥{Math.min(Math.ceil(extraPerc / 10) * 10, 100)}%
                          </p>
                        </div>
                        <Button size="sm" variant="outline" className="border-orange-400 text-orange-700 shrink-0"
                          onClick={() => set({ crescimentoFuturo: Math.min(Math.ceil(extraPerc / 10) * 10, 100) })}>
                          Aplicar
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Separator />

      {/* ── Common bottom section ─────────────────────────────────────────── */}

      {/* Electricity price */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Preço Médio de Eletricidade</label>
          <span className="text-xs text-muted-foreground">usado no cálculo financeiro</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              type="number" step="0.001" min={0.01} max={1}
              defaultValue={data.precoKwh}
              key={data.precoKwh}
              onChange={e => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v > 0) set({ precoKwh: Math.round(v * 10000) / 10000 });
              }}
              onBlur={e => {
                const v = parseFloat(e.target.value);
                const clamped = isNaN(v) || v <= 0 ?0.18 : Math.min(2, Math.round(v * 10000) / 10000);
                if (clamped !== data.precoKwh) set({ precoKwh: clamped });
                e.target.value = String(clamped);
              }}
              className="pr-12"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">€/kWh</span>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-foreground">{(data.precoKwh * data.consumoAnual).toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €/ano</p>
            <p className="text-[10px] text-muted-foreground">fatura estimada atual</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Valor médio ponderado (inclui energia + redes + impostos). EDP Simples: ~0,1862 €/kWh</p>
      </div>

      {/* Coverage target */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label className="text-sm font-medium">Meta de Cobertura Solar</label>
          <span className="text-sm font-bold text-primary">{data.coberturaMeta}%</span>
        </div>
        <Slider min={10} max={100} step={5} value={[data.coberturaMeta]} onValueChange={([v]) => set({ coberturaMeta: v })} />
        <p className="text-xs text-muted-foreground">Percentagem do consumo anual a cobrir com energia solar</p>
      </div>

      {/* Future growth */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <div>
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <TrendingUp size={14} className="text-muted-foreground" /> Crescimento de Consumo Futuro
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Para VE, nova divisão, ar condicionado, etc.</p>
          </div>
          <span className={cn("text-sm font-bold", data.crescimentoFuturo > 0 ?"text-orange-500" : "text-muted-foreground")}>
            {data.crescimentoFuturo > 0 ?`+${data.crescimentoFuturo}%` : "0%"}
          </span>
        </div>
        <Slider min={0} max={100} step={5} value={[data.crescimentoFuturo]} onValueChange={([v]) => set({ crescimentoFuturo: v })} />
        {data.crescimentoFuturo > 0 && (
          <p className="text-xs text-orange-600 dark:text-orange-400">
            Dimensionamento para {Math.round(data.consumoAnual * (1 + data.crescimentoFuturo / 100)).toLocaleString("pt-PT")} kWh/ano
          </p>
        )}
      </div>

      {/* Battery */}
      <div className={cn("rounded-lg border p-4 space-y-3", data.incluirBateria && "border-amber-300 bg-amber-50/40 dark:bg-amber-950/20")}>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Battery size={16} className="text-amber-500" /> Incluir Armazenamento em Bateria
            </div>
            <p className="text-xs text-muted-foreground">Dimensiona a capacidade necessária para autonomia noturna</p>
          </div>
          <Switch checked={data.incluirBateria} onCheckedChange={v => set({ incluirBateria: v })} />
        </div>
        {data.incluirBateria && (
          <div className="space-y-2 pt-1">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium">Autonomia Pretendida</label>
              <span className="text-sm font-bold text-amber-600">{data.horasAutonomia}h</span>
            </div>
            <Slider min={1} max={24} step={1} value={[data.horasAutonomia]} onValueChange={([v]) => set({ horasAutonomia: v })} />
            <p className="text-xs text-muted-foreground">
              Horas de funcionamento sem produção solar · Profundidade de descarga: 80%
              {data.percVazio !== 40 && ` · Usando ${data.percVazio}% vazio para cálculo`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Invoice Card sub-component ───────────────────────────────────────────────
interface InvoiceCardProps {
  inv: ParsedInvoice;
  onRemove: () => void;
  onToggleEdit: () => void;
  onSaveEdit: (edits: Partial<InvoiceData>) => void;
}

function InvoiceCard({ inv, onRemove, onToggleEdit, onSaveEdit }: InvoiceCardProps) {
  const d = { ...inv.data, ...inv.edits };
  const [editConsimo, setEditConsumo] = useState(String(d.consumoTotal ?? d.consumoMensal ?? ""));
  const [editPonta, setEditPonta] = useState(String(d.consumoPonta ?? ""));
  const [editCheio, setEditCheio] = useState(String(d.consumoCheio ?? ""));
  const [editVazio, setEditVazio] = useState(String(d.consumoVazio ??""));

  const statusConfig = {
    parsing: { icon: <Loader2 size={14} className="animate-spin text-primary" />, label: "A processar...", cls: "border-primary/30 bg-primary/5" },
    done:    { icon: <CheckCircle2 size={14} className="text-green-500" />, label: `${(d.confianca! * 100).toFixed(0)}% confiança`, cls: "border-border" },
    error:   { icon: <XCircle size={14} className="text-red-500" />, label: "Erro",  cls: "border-red-200 bg-red-50 dark:bg-red-950/20" },
    pending: { icon: <Loader2 size={14} className="animate-spin" />, label: "...", cls: "border-border" },
  }[inv.status];

  return (
    <Card className={cn("overflow-hidden transition-all", statusConfig.cls)}>
      <CardContent className="p-3">
        {/* Header row */}
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-muted-foreground shrink-0" />
          <span className="text-sm font-medium flex-1 truncate">{inv.fileName}</span>
          <div className="flex items-center gap-1 shrink-0">
            {statusConfig.icon}
            <span className="text-xs text-muted-foreground">{statusConfig.label}</span>
          </div>
          {inv.status === "done" && (
            <button onClick={onToggleEdit} className="p-1 rounded hover:bg-muted transition-colors">
              {inv.showEdit ?<X size={14} /> : <Pencil size={14} className="text-muted-foreground" />}
            </button>
          )}
          <button onClick={onRemove} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
            <Trash2 size={14} />
          </button>
        </div>

        {inv.status === "error" && inv.error && (
          <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {inv.error}
          </p>
        )}

        {/* Summary chips */}
        {inv.status === "done" && !inv.showEdit && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {d.consumoTotal != null && <Badge variant="secondary" className="text-xs">{d.consumoTotal} kWh</Badge>}
            {d.periodoMeses != null && <Badge variant="outline" className="text-xs">{d.periodoMeses} mês{d.periodoMeses > 1 ?"es" : ""}</Badge>}
            {d.dataInicio && d.dataFim && (
              <Badge variant="outline" className="text-xs">{d.dataInicio} → {d.dataFim}</Badge>
            )}
            {d.tarifario && <Badge variant="outline" className="text-xs">{d.tarifario}</Badge>}
            {d.consumoVazio != null && (
              <Badge variant="secondary" className="text-xs">
                V:{d.consumoVazio} / C:{d.consumoCheio} / P:{d.consumoPonta} kWh
              </Badge>
            )}
            {/* Chart extraction result */}
            {(d.mesesNoGrafico != null && d.mesesNoGrafico > 0) ?(
              <Badge className="text-xs bg-emerald-500 hover:bg-emerald-500 gap-1">
                <CheckCircle2 size={10} /> Gráfico: {d.mesesNoGrafico}m · {d.consumoAnualGrafico?.toLocaleString("pt-PT")} kWh/ano
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs gap-1 border-amber-300 text-amber-600 dark:text-amber-400">
                <AlertTriangle size={10} /> Sem gráfico
              </Badge>
            )}
          </div>
        )}

        {/* Inline editor */}
        {inv.showEdit && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Consumo Total (kWh)</label>
                <Input className="mt-1 h-8 text-sm" type="number" value={editConsimo} onChange={e => setEditConsumo(e.target.value)} />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium mb-1.5">Períodos Tarifários (kWh)</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Vazio", val: editVazio, set: setEditVazio, cls: "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800" },
                  { label: "Cheio", val: editCheio, set: setEditCheio, cls: "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800" },
                  { label: "Ponta", val: editPonta, set: setEditPonta, cls: "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800" },
                ].map(({ label, val, set: s, cls }) => (
                  <div key={label} className={cn("rounded-lg border p-2", cls)}>
                    <label className="text-xs font-medium">{label}</label>
                    <Input className="mt-1 h-7 text-xs" type="number" value={val} onChange={e => s(e.target.value)} />
                  </div>
                ))}
              </div>
            </div>
            <Button size="sm" className="w-full" onClick={() => onSaveEdit({
              consumoTotal: editConsimo ?Number(editConsimo) : undefined,
              consumoPonta: editPonta ?Number(editPonta) : undefined,
              consumoCheio: editCheio ?Number(editCheio) : undefined,
              consumoVazio: editVazio ?Number(editVazio) : undefined,
            })}>
              <Save size={13} className="mr-1.5" /> Guardar Alterações
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
