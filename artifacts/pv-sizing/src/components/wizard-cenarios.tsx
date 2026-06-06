import { memo } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  TrendingDown,
  Target,
  TrendingUp,
  AlertTriangle,
  Info,
  CircleCheck,
  Sun,
} from "lucide-react";

type CenarioTipo = "conservador" | "equilibrado" | "agressivo";

interface Alerta {
  tipo: "info" | "aviso" | "erro";
  mensagem: string;
}

export interface CenarioComparacao {
  tipo: CenarioTipo;
  label: string;
  descricao: string;
  potenciaInstalada: number;
  numPaineis: number;
  energiaAnualEstimada: number;
  coberturaReal: number;
  autoconsumoAnual: number;
  excessoAnual: number;
  autoconsumoPerc: number;
  investimentoEstimado: number;
  poupancaAnual: number;
  paybackAnos: number;
  capacidadeBateriaRecomendada: number | null;
  alertas?: Alerta[];
}

interface Props {
  cenarios: CenarioComparacao[];
  recomendado: string;
  selectedTipo: string | null;
  coberturaMeta: number;
  onSelect: (tipo: CenarioTipo) => void;
  panelNome?: string;
}

const CARD_META: Record<
  CenarioTipo,
  { Icon: React.ElementType; accent: string; ring: string; headerBg: string }
> = {
  conservador: {
    Icon: TrendingDown,
    accent: "text-blue-600 dark:text-blue-400",
    ring: "ring-blue-400 dark:ring-blue-500",
    headerBg: "bg-blue-50 dark:bg-blue-950/40",
  },
  equilibrado: {
    Icon: Target,
    accent: "text-amber-500 dark:text-amber-400",
    ring: "ring-amber-400 dark:ring-amber-500",
    headerBg: "bg-amber-50 dark:bg-amber-950/40",
  },
  agressivo: {
    Icon: TrendingUp,
    accent: "text-emerald-600 dark:text-emerald-400",
    ring: "ring-emerald-400 dark:ring-emerald-500",
    headerBg: "bg-emerald-50 dark:bg-emerald-950/40",
  },
};

function fmt(n: number) {
  return n.toLocaleString("pt-PT");
}

function MetricTooltip({ label, tip }: { label: string; tip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-muted-foreground cursor-help underline decoration-dashed decoration-muted-foreground/40 underline-offset-2">
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[220px] text-xs leading-snug" side="left">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

function AlertBadge({ tipo }: { tipo: "info" | "aviso" | "erro" }) {
  if (tipo === "erro") return <AlertTriangle size={11} className="text-red-500 shrink-0 mt-0.5" />;
  if (tipo === "aviso") return <AlertTriangle size={11} className="text-amber-500 shrink-0 mt-0.5" />;
  return <Info size={11} className="text-blue-500 shrink-0 mt-0.5" />;
}

function WizardCenarios({ cenarios, recomendado, selectedTipo, coberturaMeta, onSelect, panelNome }: Props) {
  if (!cenarios || cenarios.length === 0) return null;

  return (
    <TooltipProvider delayDuration={400}>
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold">Comparação de Cenários</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Seleccione o cenário energético que melhor se adapta ao seu perfil de consumo
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cenarios.map(c => {
          const meta = CARD_META[c.tipo as CenarioTipo];
          const isSelected = c.tipo === selectedTipo;
          const isRec = c.tipo === recomendado;
          const Icon = meta?.Icon ?? Sun;
          const alertas = c.alertas ?? [];

          return (
            <Card
              key={c.tipo}
              className={cn(
                "relative overflow-hidden transition-all duration-200 cursor-pointer select-none",
                isSelected
                  ? `ring-2 ${meta?.ring} shadow-md`
                  : "hover:shadow-sm hover:ring-1 hover:ring-border/60",
              )}
              onClick={() => onSelect(c.tipo as CenarioTipo)}
            >
              {isRec && (
                <div className="absolute top-0 inset-x-0 flex justify-center z-10 pointer-events-none">
                  <Badge className="rounded-none rounded-b-md text-[10px] py-0 px-2.5 bg-primary text-primary-foreground border-0 shadow">
                    ⭐ Recomendado
                  </Badge>
                </div>
              )}

              {/* ── Card header ── */}
              <div className={cn("px-4 pb-3 pt-4", isRec && "pt-7", meta?.headerBg)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={cn("p-1.5 rounded-lg bg-background/70 shrink-0", meta?.accent)}>
                      <Icon size={15} />
                    </div>
                    <div className="min-w-0">
                      <p className={cn("font-bold text-sm leading-tight", meta?.accent)}>{c.label}</p>
                      <p className="text-[10px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                        {c.descricao}
                      </p>
                    </div>
                  </div>
                  {isSelected && (
                    <CircleCheck size={17} className="text-primary shrink-0 mt-0.5" />
                  )}
                </div>
              </div>

              <CardContent className="px-4 py-3 space-y-3">
                {/* ── System metrics ── */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <MetricTooltip label="Potência FV" tip="Potência de pico total do sistema fotovoltaico instalado (kWp)" />
                    <span className="font-bold text-sm tabular-nums">{c.potenciaInstalada} kWp</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <MetricTooltip label="Produção anual" tip="Estimativa de energia eléctrica produzida anualmente, baseada em dados PVGIS para a localização definida" />
                    <span className="font-semibold tabular-nums">{fmt(c.energiaAnualEstimada)} kWh</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <MetricTooltip label="Cobertura solar" tip="Percentagem do consumo anual coberta pela produção solar (autoconsumo + excedente utilizado)" />
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
                        c.coberturaReal >= coberturaMeta
                          ? "text-green-600 dark:text-green-400"
                          : "text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {c.coberturaReal}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <MetricTooltip label="Autoconsumo" tip="Percentagem da energia solar produzida que é consumida directamente no local (vs. injectada na rede)" />
                    <span className="font-semibold tabular-nums">{c.autoconsumoPerc}%</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <MetricTooltip label="Excedente rede" tip="Energia solar produzida em excesso face ao consumo, injectada na rede (kWh/ano)" />
                    <span className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">{fmt(c.excessoAnual)} kWh</span>
                  </div>
                </div>

                {/* ── Alerts ── */}
                {alertas.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-1">
                      {alertas.slice(0, 2).map((a, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-1.5 text-[11px] text-muted-foreground leading-snug"
                        >
                          <AlertBadge tipo={a.tipo} />
                          <span>{a.mensagem}</span>
                        </div>
                      ))}
                      {alertas.length > 2 && (
                        <p className="text-[10px] text-muted-foreground pl-4">
                          +{alertas.length - 2} alerta(s) adicionais
                        </p>
                      )}
                    </div>
                  </>
                )}

                {/* ── CTA ── */}
                <Button
                  type="button"
                  size="sm"
                  variant={isSelected ? "default" : "outline"}
                  className="w-full text-xs mt-1"
                  onClick={e => {
                    e.stopPropagation();
                    onSelect(c.tipo as CenarioTipo);
                  }}
                >
                  {isSelected ? (
                    <>
                      <CircleCheck size={13} className="mr-1.5" />
                      Cenário Seleccionado
                    </>
                  ) : (
                    "Seleccionar este cenário"
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-muted-foreground px-0.5">
        <span className="flex items-center gap-1">
          <TrendingDown size={11} className="text-blue-500" />
          <strong>Económico</strong> — menor potência, maior autoconsumo relativo
        </span>
        <span className="flex items-center gap-1">
          <Target size={11} className="text-amber-500" />
          <strong>Equilibrado</strong> — compromisso ideal cobertura / autoconsumo
        </span>
        <span className="flex items-center gap-1">
          <TrendingUp size={11} className="text-emerald-500" />
          <strong>Premium</strong> — máxima cobertura solar e produção anual
        </span>
      </div>
    </div>
    </TooltipProvider>
  );
}

export default memo(WizardCenarios);
