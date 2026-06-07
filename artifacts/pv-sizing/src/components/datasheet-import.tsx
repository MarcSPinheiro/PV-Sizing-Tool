import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  Sparkles,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAiHeaders } from "@/lib/ai-key";
import { fetchWithTimeout, validateAiUpload } from "@/lib/ai-upload";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type TipoEquipamento = "painel" | "inversor" | "bateria";

interface DatasheetResult {
  tipoEquipamento: TipoEquipamento;
  modelos?: Record<string, unknown>[];
  dados?: Record<string, unknown>;
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

function firstText(d: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = d[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function firstNumber(d: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = d[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(",", ".").replace(/[^\d.-]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function modelName(d: Record<string, unknown>) {
  return (
    firstText(d, ["nome", "modelo", "model", "referencia", "reference", "name"]) ||
    "Modelo detetado"
  );
}

function modelLabel(tipo: TipoEquipamento, d: Record<string, unknown>) {
  const nome = modelName(d);

  if (tipo === "inversor") {
    const potenciaAc = firstNumber(d, ["potenciaAc", "potencia_ac", "acPower", "powerAc"]);
    const mppt = firstNumber(d, ["numMppt", "mppt", "mppts", "numeroMppt"]);
    return [
      nome,
      potenciaAc ? `${(potenciaAc / 1000).toFixed(1)} kW AC` : "",
      mppt ? `${mppt} MPPT` : "",
    ]
      .filter(Boolean)
      .join(" - ");
  }

  if (tipo === "painel") {
    const potencia = firstNumber(d, ["potencia", "wp", "potenciaWp", "power"]);
    const voc = firstNumber(d, ["voc", "Voc", "openCircuitVoltage"]);
    return [
      nome,
      potencia ? `${potencia} Wp` : "",
      voc ? `Voc ${voc} V` : "",
    ]
      .filter(Boolean)
      .join(" - ");
  }

  const capacidade = firstNumber(d, [
    "capacidade",
    "capacidadeKwh",
    "capacidadeUtil",
    "usableCapacity",
    "energy",
  ]);
  const tensao = firstNumber(d, ["tensao", "tensaoNominal", "voltagem", "voltage"]);
  const tecnologia = firstText(d, ["tecnologia", "technology", "quimica", "chemistry"]);
  return [
    nome,
    capacidade ? `${capacidade} kWh` : "",
    tensao ? `${tensao} V` : "",
    tecnologia,
  ]
    .filter(Boolean)
    .join(" - ");
}

function pluralLabel(tipo: TipoEquipamento) {
  if (tipo === "painel") return "painel(is)";
  if (tipo === "inversor") return "inversor(es)";
  return "bateria(s)";
}

export function DatasheetImport({ tipoEquipamento, onExtracted, onBatchCreate }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isBatchCreating, setIsBatchCreating] = useState(false);
  const [result, setResult] = useState<DatasheetResult | null>(null);
  const [modelos, setModelos] = useState<ModeloItem[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [textInput, setTextInput] = useState("");
  const { toast } = useToast();

  const tipoLabel =
    tipoEquipamento === "painel"
      ? "painel"
      : tipoEquipamento === "inversor"
        ? "inversor"
        : "bateria";

  const reset = () => {
    setResult(null);
    setModelos([]);
    setExpanded(true);
  };

  const applyResult = (r: DatasheetResult) => {
    const rawModels =
      Array.isArray(r.modelos) && r.modelos.length > 0
        ? r.modelos
        : r.dados
          ? [r.dados]
          : [];
    const items = rawModels.map((dados) => ({ dados, selecionado: true }));

    setResult({ ...r, modelos: rawModels, dados: rawModels[0] ?? r.dados ?? {} });
    setModelos(items);
    setExpanded(true);

    if (items.length > 0) {
      onExtracted(items[0].dados);
    }

    toast({
      title:
        items.length <= 1
          ? `Dados extraidos (${(r.confianca * 100).toFixed(0)}% confianca)`
          : `${items.length} modelo(s) detetado(s) - ${(r.confianca * 100).toFixed(0)}% confianca`,
      description:
        r.notas ??
        (items.length <= 1
          ? "Dados pre-preenchidos no formulario abaixo."
          : "Selecione os modelos a criar."),
    });
  };

  const handleFile = async (file: File) => {
    setIsLoading(true);
    reset();
    try {
      validateAiUpload(file);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tipoEquipamento", tipoEquipamento);

      const resp = await fetchWithTimeout(`${BASE}/api/tools/import-datasheet`, {
        method: "POST",
        headers: getAiHeaders(),
        body: fd,
      });
      if (!resp.ok) {
        throw new Error(await readErrorMessage(resp, "Erro ao processar ficha tecnica"));
      }

      applyResult(await resp.json());
    } catch (error) {
      toast({
        title: "Erro ao processar ficha tecnica",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  const handleTextImport = async () => {
    if (textInput.trim().length < 10) {
      toast({ title: "Cole o modelo ou especificacoes primeiro", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    reset();
    try {
      const resp = await fetchWithTimeout(`${BASE}/api/tools/import-datasheet-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAiHeaders() },
        body: JSON.stringify({ tipoEquipamento, texto: textInput }),
      });
      if (!resp.ok) {
        throw new Error(await readErrorMessage(resp, "Erro ao processar texto com IA"));
      }

      applyResult(await resp.json());
    } catch (error) {
      toast({
        title: "Erro ao processar texto com IA",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleModelo = (i: number) => {
    setModelos((prev) =>
      prev.map((modelo, idx) =>
        idx === i ? { ...modelo, selecionado: !modelo.selecionado } : modelo
      )
    );
  };

  const toggleAll = (value: boolean) => {
    setModelos((prev) => prev.map((modelo) => ({ ...modelo, selecionado: value })));
  };

  const selectedCount = modelos.filter((modelo) => modelo.selecionado).length;

  const handleBatchCreate = async () => {
    if (!onBatchCreate) return;
    const selected = modelos.filter((modelo) => modelo.selecionado).map((modelo) => modelo.dados);
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

  return (
    <div className="mb-4 space-y-3">
      <div
        className={cn(
          "cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-colors",
          isLoading
            ? "border-primary/30 bg-primary/5"
            : result
              ? "border-green-400/50 bg-green-50/30 dark:bg-green-950/10"
              : "border-primary/30 hover:border-primary/60 hover:bg-primary/5"
        )}
        onClick={() => !isLoading && fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 size={18} className="animate-spin text-primary" />
            <span className="text-sm">A analisar ficha tecnica com IA e a detetar modelos...</span>
          </div>
        ) : result ? (
          <div className="flex flex-wrap items-center justify-center gap-2 text-green-700 dark:text-green-400">
            <CheckCircle2 size={18} />
            <span className="text-sm font-medium">{modelos.length} modelo(s) detetado(s)</span>
            <Badge variant="secondary">{(result.confianca * 100).toFixed(0)}% confianca</Badge>
            <button
              type="button"
              className="ml-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                reset();
              }}
            >
              <RefreshCw size={12} /> nova ficha
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Sparkles size={18} className="text-primary" />
            <div className="text-sm">
              <span className="font-medium">Importar ficha tecnica com IA</span>
              <span className="text-muted-foreground">
                {" "}
                - PDF ou imagem - deteta todos os modelos automaticamente
              </span>
            </div>
            <Upload size={15} className="text-muted-foreground" />
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
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
          placeholder={`Cole aqui o modelo ou dados tecnicos do ${tipoLabel}.`}
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
            {isLoading ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <Sparkles size={14} className="mr-1.5" />
            )}
            Pesquisar / preencher com IA
          </Button>
        </div>
      </div>

      {onBatchCreate && result && modelos.length > 0 && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">{modelos.length} modelo(s) pronto(s)</p>
              <p className="text-xs text-muted-foreground">
                {selectedCount} selecionado(s). Pode criar os modelos detetados de uma vez.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={handleBatchCreate}
              disabled={isBatchCreating || selectedCount === 0}
              className="w-full sm:w-auto"
            >
              {isBatchCreating ? (
                <>
                  <Loader2 size={14} className="mr-1.5 animate-spin" />A criar...
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} className="mr-1.5" />
                  Criar {selectedCount} {pluralLabel(tipoEquipamento)}
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {result && modelos.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <button
            type="button"
            className="flex w-full items-center justify-between bg-muted/40 px-3 py-2 text-left"
            onClick={() => setExpanded((value) => !value)}
          >
            <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
              <Sparkles size={14} className="shrink-0 text-primary" />
              <span className="shrink-0">{modelos.length} modelo(s) encontrado(s)</span>
              {result.notas && (
                <span className="truncate text-xs font-normal text-muted-foreground">
                  - {result.notas}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-muted-foreground">{selectedCount} selecionado(s)</span>
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          </button>

          {expanded && (
            <>
              {modelos.length > 1 && (
                <div className="flex items-center gap-3 border-b bg-background px-3 py-1.5 text-xs text-muted-foreground">
                  <button
                    type="button"
                    className="hover:text-foreground"
                    onClick={() => toggleAll(true)}
                  >
                    Selecionar todos
                  </button>
                  <span>-</span>
                  <button
                    type="button"
                    className="hover:text-foreground"
                    onClick={() => toggleAll(false)}
                  >
                    Desselecionar todos
                  </button>
                </div>
              )}

              <ul className="divide-y">
                {modelos.map((modelo, index) => (
                  <li
                    key={index}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/30",
                      !modelo.selecionado && "opacity-50"
                    )}
                    onClick={() => toggleModelo(index)}
                  >
                    <Checkbox
                      checked={modelo.selecionado}
                      onCheckedChange={() => toggleModelo(index)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{modelName(modelo.dados)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {modelLabel(tipoEquipamento, modelo.dados)}
                      </p>
                    </div>
                    {index === 0 && (
                      <Badge variant="outline" className="shrink-0 text-xs">
                        Ref.
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap gap-2 border-t bg-muted/20 px-3 py-2.5">
                {onBatchCreate && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleBatchCreate}
                    disabled={isBatchCreating || selectedCount === 0}
                  >
                    {isBatchCreating ? (
                      <>
                        <Loader2 size={14} className="mr-1.5 animate-spin" />A criar...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={14} className="mr-1.5" />
                        Criar {selectedCount} {pluralLabel(tipoEquipamento)}
                      </>
                    )}
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const first = modelos.find((modelo) => modelo.selecionado);
                    if (first) {
                      onExtracted(first.dados);
                      toast({ title: "Dados pre-preenchidos no formulario" });
                    }
                  }}
                  disabled={selectedCount === 0}
                >
                  Pre-preencher formulario (1.o)
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {result && result.confianca < 0.6 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-600 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertCircle size={13} />
          Confianca baixa ({(result.confianca * 100).toFixed(0)}%). Verifique os valores antes
          de guardar.
        </div>
      )}
    </div>
  );
}
