import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Upload, Loader2, Sparkles, RefreshCw, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAiHeaders } from "@/lib/ai-key";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type TipoEquipamento = "painel" | "inversor" | "bateria";

interface DatasheetResult {
  tipoEquipamento: TipoEquipamento;
  modelos: Record<string, unknown>[];
  dados: Record<string, unknown>;
  confianca: number;
  notas?: string | null;
}

interface ModeloItem {
  dados: Record<string, unknown>;
  selecionado: boolean;
}

interface Props {
  tipoEquipamento: TipoEquipamento;
  onExtracted: (dados: Record<string, unknown>) => void;
  onBatchCreate?: (modelos: Array<Record<string, unknown>>) => Promise<void>;
}

async function readErrorMessage(resp: Response, fallback: string) {
  try {
    const body = await resp.json();
    return typeof body?.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}

function modelLabel(tipo: TipoEquipamento, d: Record<string, unknown>): string {
  const nome = String(d.nome ??"—");
  if (tipo === "inversor") {
    const kw = d.potenciaAc ?`${(Number(d.potenciaAc) / 1000).toFixed(1)} kW AC` : "";
    const mppt = d.numMppt ?`${d.numMppt} MPPT` : "";
    return [nome, kw, mppt].filter(Boolean).join(" · ");
  }
  if (tipo === "painel") {
    const wp = d.potencia ?`${d.potencia} Wp` : "";
    const voc = d.voc ?`Voc ${d.voc} V` : "";
    return [nome, wp, voc].filter(Boolean).join(" · ");
  }
  if (tipo === "bateria") {
    const kwh = d.capacidade ?`${d.capacidade} kWh` : "";
    const v   = d.tensao ?`${d.tensao} V` : "";
    return [nome, kwh, v, String(d.tecnologia ??"")].filter(Boolean).join(" · ");
  }
  return nome;
}

export function DatasheetImport({ tipoEquipamento, onExtracted, onBatchCreate }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading]           = useState(false);
  const [isBatchCreating, setIsBatchCreating] = useState(false);
  const [result, setResult]                 = useState<DatasheetResult | null>(null);
  const [modelos, setModelos]               = useState<ModeloItem[]>([]);
  const [expanded, setExpanded]             = useState(true);
  const [textInput, setTextInput]           = useState("");
  const { toast } = useToast();

  const reset = () => { setResult(null); setModelos([]); setExpanded(true); };

  const applyResult = (r: DatasheetResult) => {
    setResult(r);
    const items: ModeloItem[] = (r.modelos ??[r.dados]).map(d => ({ dados: d, selecionado: true }));
    setModelos(items);

    if (items.length === 1 && !onBatchCreate) {
      onExtracted(items[0].dados);
      toast({
        title: `Dados extraídos (${(r.confianca * 100).toFixed(0)}% confiança)`,
        description: r.notas ??"Dados pré-preenchidos no formulário abaixo.",
      });
    } else {
      toast({
        title: `${items.length} modelo(s) detetado(s) · ${(r.confianca * 100).toFixed(0)}% confiança`,
        description: r.notas ??"Selecione os modelos a criar.",
      });
    }
  };

  const handleFile = async (file: File) => {
    setIsLoading(true);
    reset();
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tipoEquipamento", tipoEquipamento);
      const resp = await fetch(`${BASE}/api/tools/import-datasheet`, { method: "POST", headers: getAiHeaders(), body: fd });
      if (!resp.ok) throw new Error(await readErrorMessage(resp, "Erro ao processar ficha técnica"));
      const r: DatasheetResult = await resp.json();
      applyResult(r);
      return;
      setResult(r);
      const items: ModeloItem[] = (r.modelos ??[r.dados]).map(d => ({ dados: d, selecionado: true }));
      setModelos(items);

      if (items.length === 1 && !onBatchCreate) {
        onExtracted(items[0].dados);
        toast({
          title: `Ficha técnica extraída (${(r.confianca * 100).toFixed(0)}% confiança)`,
          description: r.notas ??"Dados pré-preenchidos no formulário abaixo.",
        });
      } else {
        toast({
          title: `${items.length} modelo(s) detetado(s) · ${(r.confianca * 100).toFixed(0)}% confiança`,
          description: r.notas ??"Selecione os modelos a criar.",
        });
      }
    } catch {
      toast({ title: "Erro ao processar ficha técnica", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleTextImport = async () => {
    if (textInput.trim().length < 10) {
      toast({ title: "Cole o modelo ou especificações primeiro", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    reset();
    try {
      const resp = await fetch(`${BASE}/api/tools/import-datasheet-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAiHeaders() },
        body: JSON.stringify({ tipoEquipamento, texto: textInput }),
      });
      if (!resp.ok) throw new Error(await readErrorMessage(resp, "Erro ao processar texto com IA"));
      const r: DatasheetResult = await resp.json();
      applyResult(r);
    } catch {
      toast({ title: "Erro ao processar texto com IA", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleModelo = (i: number) =>
    setModelos(prev => prev.map((m, idx) => idx === i ?{ ...m, selecionado: !m.selecionado } : m));

  const toggleAll = (v: boolean) =>
    setModelos(prev => prev.map(m => ({ ...m, selecionado: v })));

  const selectedCount = modelos.filter(m => m.selecionado).length;

  const handleBatchCreate = async () => {
    if (!onBatchCreate) return;
    const selected = modelos.filter(m => m.selecionado).map(m => m.dados);
    if (selected.length === 0) {
      toast({ title: "Selecione pelo menos um modelo", variant: "destructive" });
      return;
    }
    setIsBatchCreating(true);
    try {
      await onBatchCreate(selected);
    } finally {
      setIsBatchCreating(false);
    }
  };

  const tipoLabel = tipoEquipamento === "painel" ?"painel" : tipoEquipamento === "inversor" ?"inversor" : "bateria";

  return (
    <div className="space-y-3 mb-4">
      {/* Upload zone */}
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
          isLoading
            ?"border-primary/30 bg-primary/5"
            : result
            ?"border-green-400/50 bg-green-50/30 dark:bg-green-950/10"
            : "border-primary/30 hover:border-primary/60 hover:bg-primary/5"
        )}
        onClick={() => !isLoading && fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
      >
        {isLoading ?(
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 size={18} className="animate-spin text-primary" />
            <span className="text-sm">A analisar ficha técnica com IA… a detetar modelos…</span>
          </div>
        ) : result ?(
          <div className="flex items-center justify-center gap-2 text-green-700 dark:text-green-400">
            <CheckCircle2 size={18} />
            <span className="text-sm font-medium">
              {modelos.length} modelo(s) detetado(s)
            </span>
            <Badge variant="secondary">{(result.confianca * 100).toFixed(0)}% confiança</Badge>
            <button
              className="ml-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              onClick={e => { e.stopPropagation(); reset(); }}
            >
              <RefreshCw size={12} /> nova ficha
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Sparkles size={18} className="text-primary" />
            <div className="text-sm">
              <span className="font-medium">Importar ficha técnica com IA</span>
              <span className="text-muted-foreground"> · PDF ou imagem · deteta todos os modelos automaticamente</span>
            </div>
            <Upload size={15} className="text-muted-foreground" />
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
        />
      </div>

      <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles size={15} className="text-primary" />
          Pesquisar modelo ou preencher ficha com IA
        </div>
        <Textarea
          value={textInput}
          onChange={(event) => setTextInput(event.target.value)}
          placeholder={`Cole aqui o modelo ou dados técnicos do ${tipoLabel}.`}
          rows={3}
        />
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTextImport}
            disabled={isLoading || textInput.trim().length < 3}
          >
            {isLoading ?<Loader2 size={14} className="mr-1.5 animate-spin" /> : <Sparkles size={14} className="mr-1.5" />}
            Pesquisar / preencher com IA
          </Button>
        </div>
      </div>

      {/* Multi-model review panel */}
      {result && modelos.length > 0 && (modelos.length > 1 || onBatchCreate) && (
        <div className="border rounded-lg overflow-hidden">
          {/* Header */}
          <div
            className="flex items-center justify-between px-3 py-2 bg-muted/40 cursor-pointer select-none"
            onClick={() => setExpanded(v => !v)}
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles size={14} className="text-primary" />
              {modelos.length} modelo(s) encontrado(s)
              {result.notas && (
                <span className="text-xs text-muted-foreground font-normal">· {result.notas}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{selectedCount} selecionado(s)</span>
              {expanded ?<ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          </div>

          {expanded && (
            <>
              {/* Select all / deselect all */}
              {modelos.length > 1 && (
                <div className="flex items-center gap-3 px-3 py-1.5 border-b bg-background text-xs text-muted-foreground">
                  <button className="hover:text-foreground" onClick={() => toggleAll(true)}>Selecionar todos</button>
                  <span>·</span>
                  <button className="hover:text-foreground" onClick={() => toggleAll(false)}>Desselecionar todos</button>
                </div>
              )}

              {/* Model list */}
              <ul className="divide-y">
                {modelos.map((m, i) => (
                  <li
                    key={i}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors",
                      !m.selecionado && "opacity-50"
                    )}
                    onClick={() => toggleModelo(i)}
                  >
                    <Checkbox
                      checked={m.selecionado}
                      onCheckedChange={() => toggleModelo(i)}
                      onClick={e => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{String(m.dados.nome ??"—")}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {modelLabel(tipoEquipamento, m.dados)}
                      </p>
                    </div>
                    {i === 0 && <Badge variant="outline" className="text-xs shrink-0">Ref.</Badge>}
                  </li>
                ))}
              </ul>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 px-3 py-2.5 border-t bg-muted/20">
                {onBatchCreate && (
                  <Button
                    size="sm"
                    onClick={handleBatchCreate}
                    disabled={isBatchCreating || selectedCount === 0}
                  >
                    {isBatchCreating
                      ?<><Loader2 size={14} className="mr-1.5 animate-spin" />A criar…</>
                      : <><CheckCircle2 size={14} className="mr-1.5" />Criar {selectedCount} {tipoLabel}(s)</>}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const first = modelos.find(m => m.selecionado);
                    if (first) {
                      onExtracted(first.dados);
                      toast({ title: "Dados pré-preenchidos no formulário" });
                    }
                  }}
                  disabled={selectedCount === 0}
                >
                  Pré-preencher formulário (1.º)
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Warning for zero confidence */}
      {result && result.confianca < 0.6 && (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
          <AlertCircle size={13} />
          Confiança baixa ({(result.confianca * 100).toFixed(0)}%). Verifique os valores antes de guardar.
        </div>
      )}
    </div>
  );
}
