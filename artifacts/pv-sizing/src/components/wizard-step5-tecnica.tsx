import { useMemo, useState, useEffect, useCallback, memo } from "react";
import { SolarPanel, Inverter, Battery } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, AlertTriangle, XCircle, Zap, Sun,
  Battery as BatteryIcon, GitBranch, RotateCcw, Pencil,
  ChevronLeft, ChevronRight, Plus, Trash2, ChevronDown,
  Lock, LockOpen, ArrowUp, ArrowDown,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  calcStringSizing, calcStringSizingManual, maxPaineisPerString,
  type StringSizingResult, type MpptConfig, type SemSolucaoInfo,
} from "@/lib/string-sizing";
import { checkPanelData, checkPanelInverter, checkBatteryInverter, type CompatResult } from "@/lib/compat-check";

/** Normalise a power field that may have been imported in W instead of kW (e.g. 32000 → 32). */
function normalizarKW(val: number): number {
  return val > 500 ? val / 1000 : val;
}

interface Props {
  panel: SolarPanel | null;
  inverter: Inverter | null;
  battery: Battery | null;
  numPaineis: number;
  potenciaInstalada: number;
  onNumPaineisChange?: (n: number) => void;
  mpptConfig: MpptConfig | null;
  onMpptConfigChange: (config: MpptConfig | null) => void;
}

/* ─────────────────────────────────────────────────────────────────────────────
   StatusBadge
───────────────────────────────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ok: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    aviso: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    erro: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
    info: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  };
  const label: Record<string, string> = { ok: "OK", aviso: "Atenção", erro: "Erro", info: "Info" };
  return (
    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", map[status] ?? map.info)}>
      {label[status] ?? status}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   CompatTable
───────────────────────────────────────────────────────────────────────────── */
function CompatTable({ result, title }: { result: CompatResult; title: string }) {
  const [open, setOpen] = useState(result.temErros || result.temAvisos);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-2 w-full text-left mb-2 hover:opacity-75 transition-opacity group">
          <ChevronDown
            size={13}
            className={cn(
              "text-muted-foreground transition-transform duration-200 shrink-0",
              open && "rotate-180",
            )}
          />
          <h3 className="font-semibold text-sm">{title}</h3>
          {result.temErros && <Badge variant="destructive" className="text-xs">Erros</Badge>}
          {!result.temErros && result.temAvisos && <Badge className="text-xs bg-amber-500 hover:bg-amber-500">Atenções</Badge>}
          {!result.temErros && !result.temAvisos && <Badge className="text-xs bg-emerald-500 hover:bg-emerald-500">Compatível</Badge>}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="rounded-lg border overflow-hidden mb-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-32">Verificação</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Descrição</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Obtido</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Limite</th>
                <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground w-20">Estado</th>
              </tr>
            </thead>
            <tbody>
              {result.itens.map((item, i) => (
                <tr key={i} className={cn("border-b last:border-0", item.status === "erro" && "bg-red-50/50 dark:bg-red-950/20", item.status === "aviso" && "bg-amber-50/50 dark:bg-amber-950/20")}>
                  <td className="px-3 py-2 font-medium text-xs text-muted-foreground">{item.categoria}</td>
                  <td className="px-3 py-2 text-xs">{item.descricao}</td>
                  <td className="px-3 py-2 text-right text-xs font-mono">{item.valorObtido}</td>
                  <td className="px-3 py-2 text-right text-xs font-mono text-muted-foreground">{item.valorLimite}</td>
                  <td className="px-3 py-2 text-center"><StatusBadge status={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Stepper
───────────────────────────────────────────────────────────────────────────── */
function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button
        className="w-7 h-7 rounded border flex items-center justify-center text-sm font-bold disabled:opacity-30 hover:bg-muted transition-colors"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >−</button>
      <span className="w-8 text-center text-sm font-semibold tabular-nums">{value}</span>
      <button
        className="w-7 h-7 rounded border flex items-center justify-center text-sm font-bold disabled:opacity-30 hover:bg-muted transition-colors"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >+</button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Comprehensive Technical Validation Table
   Covers ALL validation points from the spec in one consolidated view.
───────────────────────────────────────────────────────────────────────────── */
interface TechSummaryTableProps {
  sizing: StringSizingResult;
  invElec: {
    potenciaAc: number;
    potenciaDcMax: number;
    mpptMin: number;
    mpptMax: number;
    corrMaxMppt: number;
    numMppt: number;
    stringsPorMppt: number;
  };
  panelIsc: number;
  battery: { capacidade: number; tensao: number } | null;
}

function TechSummaryTable({ sizing, invElec, panelIsc, battery }: TechSummaryTableProps) {
  const { config, tMinPortugal, tMaxCelula, vdcMaxUsado } = sizing;

  const activeMppts      = config.mpptConfig.filter(s => s.length > 0).length;
  const maxStringsInMppt = config.mpptConfig.reduce((mx, s) => Math.max(mx, s.length), 0);
  const maxIscPerMppt    = maxStringsInMppt * panelIsc;
  const allPanelCounts   = config.mpptConfig.flat().filter(v => v > 0);
  const maxPaineisPorStr = allPanelCounts.length > 0 ? Math.max(...allPanelCounts) : config.paineisPerString;
  const minPaineisPorStr = allPanelCounts.length > 0 ? Math.min(...allPanelCounts) : config.paineisPerString;

  type Row = {
    label: string;
    sub?: string;
    obtido: string;
    limite: string;
    status: "ok" | "aviso" | "erro" | "info";
  };

  const rows: Row[] = [
    {
      label: "Potência DC Total",
      obtido: `${(config.potenciaDCTotal / 1000).toFixed(2)} kWp`,
      limite: `≤ ${invElec.potenciaDcMax} kW DC`,
      status: config.potenciaDCTotal / 1000 > invElec.potenciaDcMax * 1.05 ? "aviso" : "ok",
    },
    {
      label: "Potência AC Inversor",
      obtido: `${invElec.potenciaAc} kW AC`,
      limite: "referência dimensionamento",
      status: "info",
    },
    {
      label: "DC/AC Ratio",
      obtido: `${(config.dcAcRatio * 100).toFixed(1)}%`,
      limite: "90–130% excelente · 80–140% aceitável",
      status: (config.dcAcRatio < 0.6 || config.dcAcRatio > 1.7) ? "erro"
            : (config.dcAcRatio < 0.8 || config.dcAcRatio > 1.4) ? "aviso"
            : (config.dcAcRatio < 0.9 || config.dcAcRatio > 1.3) ? "aviso"
            : "ok",
    },
    {
      label: "Nº de MPPTs em uso",
      obtido: `${activeMppts} de ${invElec.numMppt} disponíveis`,
      limite: `≤ ${invElec.numMppt}`,
      status: activeMppts > invElec.numMppt ? "erro" : "ok",
    },
    {
      label: "Strings por MPPT",
      sub: maxStringsInMppt > 1 ? `${maxStringsInMppt} strings no MPPT mais carregado` : undefined,
      obtido: `máx. ${maxStringsInMppt}`,
      limite: `≤ ${invElec.stringsPorMppt}`,
      status: maxStringsInMppt > invElec.stringsPorMppt
        ? "erro"
        : maxStringsInMppt === invElec.stringsPorMppt
          ? "aviso"
          : "ok",
    },
    {
      label: "Painéis por String",
      sub: config.isMixed ? "configuração mista — pior caso para tensão" : undefined,
      obtido: config.isMixed
        ? `${minPaineisPorStr}–${maxPaineisPorStr} módulos`
        : `${config.paineisPerString} módulos`,
      limite: "janela de tensão Voc/Vmpp",
      status: "ok",
    },
    {
      label: `Voc em Frio (${tMinPortugal} °C)`,
      sub: "pior caso — string com mais painéis",
      obtido: `${config.vocFrio.toFixed(0)} V`,
      limite: `< ${vdcMaxUsado.toFixed(0)} V (Vdc máx.)`,
      status: config.vocFrio >= vdcMaxUsado
        ? "erro"
        : config.vocFrio >= vdcMaxUsado * 0.95
          ? "aviso"
          : "ok",
    },
    {
      label: `Vmpp em Calor (${tMaxCelula.toFixed(0)} °C célula)`,
      sub: "pior caso — string com menos painéis",
      obtido: `${config.vmpQuente.toFixed(0)} V`,
      limite: `> ${invElec.mpptMin} V (MPPT mín.)`,
      status: config.vmpQuente < invElec.mpptMin ? "aviso" : "ok",
    },
    {
      label: "Corrente Isc por MPPT",
      sub: maxStringsInMppt > 1
        ? `${maxStringsInMppt} strings em paralelo × ${panelIsc.toFixed(2)} A`
        : `${panelIsc.toFixed(2)} A por string`,
      obtido: `${maxIscPerMppt.toFixed(2)} A`,
      limite: `≤ ${invElec.corrMaxMppt} A`,
      status: maxIscPerMppt > invElec.corrMaxMppt
        ? "erro"
        : maxIscPerMppt > invElec.corrMaxMppt * 0.9
          ? "aviso"
          : "ok",
    },
  ];

  if (battery) {
    rows.push({
      label: "Compatibilidade Bateria",
      obtido: `${battery.tensao} V / ${battery.capacidade} kWh`,
      limite: "40–60 V (tensão típica LiFePO4/Li-ion)",
      status: battery.tensao >= 40 && battery.tensao <= 60 ? "ok" : "aviso",
    });
  }

  const hasErros  = rows.some(r => r.status === "erro");
  const hasAvisos = rows.some(r => r.status === "aviso");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 size={16} className="text-primary" />
              Verificações Técnicas
            </CardTitle>
            <CardDescription className="mt-0.5">
              Validação eléctrica completa do sistema dimensionado
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {hasErros  && <Badge variant="destructive" className="text-xs">Erros</Badge>}
            {!hasErros && hasAvisos && <Badge className="text-xs bg-amber-500 hover:bg-amber-500">Atenções</Badge>}
            {!hasErros && !hasAvisos && <Badge className="text-xs bg-emerald-500 hover:bg-emerald-500">Tudo OK</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 pb-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-t">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Parâmetro</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Obtido</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">Limite / Referência</th>
                <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground w-20">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={cn(
                  "border-b last:border-0",
                  row.status === "erro"  && "bg-red-50/50 dark:bg-red-950/20",
                  row.status === "aviso" && "bg-amber-50/50 dark:bg-amber-950/20",
                )}>
                  <td className="px-4 py-2.5">
                    <div className="text-xs font-medium">{row.label}</div>
                    {row.sub && <div className="text-[10px] text-muted-foreground mt-0.5">{row.sub}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs font-mono font-semibold">{row.obtido}</td>
                  <td className="px-3 py-2.5 text-right text-xs font-mono text-muted-foreground hidden sm:table-cell">{row.limite}</td>
                  <td className="px-3 py-2.5 text-center"><StatusBadge status={row.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   String sizing card — editable per-string configuration
───────────────────────────────────────────────────────────────────────────── */
interface StringSizingCardProps {
  autoResult: StringSizingResult;
  numMppt: number;
  maxStringsPorMppt: number;
  maxPaineisPorString: number;
  panelElec: { voc: number; vmp: number; isc: number; imp: number; potencia: number; coeficienteTemperaturaVoc: number | null; noct: number | null };
  invElec: { mpptMin: number; mpptMax: number; corrMaxMppt: number; numMppt: number; stringsPorMppt: number; potenciaAc: number; potenciaDcMax: number; vdcMax: number | null };
  numPaineisAuto: number;
  onConfigChange?: (mpptConfig: MpptConfig) => void;
}

function StringSizingCard({
  autoResult, numMppt, maxStringsPorMppt, maxPaineisPorString,
  panelElec, invElec, numPaineisAuto, onConfigChange,
}: StringSizingCardProps) {
  const [editMode, setEditMode] = useState(false);
  const [mpptConfigEdit, setMpptConfigEdit] = useState<MpptConfig>(() => autoResult.config.mpptConfig);

  useEffect(() => {
    if (!editMode) setMpptConfigEdit(autoResult.config.mpptConfig);
  }, [autoResult, editMode]);

  const result = useMemo<StringSizingResult>(() => {
    if (!editMode) return autoResult;
    return calcStringSizingManual(panelElec, invElec, mpptConfigEdit, numPaineisAuto);
  }, [editMode, autoResult, panelElec, invElec, mpptConfigEdit, numPaineisAuto]);

  const { config, alertas, tMinPortugal, tMaxCelula, vdcMaxUsado } = result;
  const erros = alertas.filter(a => a.tipo === "erro");
  const avisos = alertas.filter(a => a.tipo === "aviso");
  const ok = alertas.filter(a => a.tipo === "ok");

  const updateConfig = useCallback((next: MpptConfig) => {
    setMpptConfigEdit(next);
    onConfigChange?.(next);
  }, [onConfigChange]);

  function handleResetAuto() {
    setMpptConfigEdit(autoResult.config.mpptConfig);
    setEditMode(false);
    onConfigChange?.(autoResult.config.mpptConfig);
  }

  // Compute a global string index offset for each MPPT for display
  const mpptOffsets = mpptConfigEdit.reduce<number[]>((acc, strings, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + mpptConfigEdit[i - 1].length);
    return acc;
  }, []);

  function handleSetPanels(mi: number, si: number, val: number) {
    const next = mpptConfigEdit.map((strings, i) =>
      i === mi ? strings.map((p, j) => (j === si ? val : p)) : strings
    );
    updateConfig(next);
  }

  function handleAddString(mi: number) {
    // Default to same panel count as last string in this MPPT, or auto config value
    const cur = mpptConfigEdit[mi];
    const defaultPanels = cur.length > 0 ? cur[cur.length - 1] : autoResult.config.paineisPerString;
    const next = mpptConfigEdit.map((strings, i) => i === mi ? [...strings, defaultPanels] : strings);
    updateConfig(next);
  }

  function handleRemoveString(mi: number, si: number) {
    const next = mpptConfigEdit.map((strings, i) =>
      i === mi ? strings.filter((_, j) => j !== si) : strings
    );
    updateConfig(next);
  }

  function handleMoveString(mi: number, si: number, direction: "prev" | "next") {
    const targetMi = direction === "prev" ? mi - 1 : mi + 1;
    if (targetMi < 0 || targetMi >= mpptConfigEdit.length) return;
    const panels = mpptConfigEdit[mi][si];
    const next = mpptConfigEdit.map((strings, i) => {
      if (i === mi) return strings.filter((_, j) => j !== si);
      if (i === targetMi) return [...strings, panels];
      return strings;
    });
    updateConfig(next);
  }

  const totalStrings = mpptConfigEdit.reduce((a, m) => a + m.length, 0);
  const totalPaineis = mpptConfigEdit.flat().reduce((a, b) => a + b, 0);
  const totalKwp = (totalPaineis * panelElec.potencia) / 1000;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <GitBranch size={18} className="text-primary" />
              Dimensionamento de Strings
            </CardTitle>
            <CardDescription className="mt-0.5">
              {editMode ? "Modo edição — configure cada string individualmente" : "Cálculo automático da configuração elétrica"}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {editMode && (
              <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={handleResetAuto}>
                <RotateCcw size={12} /> Automático
              </Button>
            )}
            <Button
              variant={editMode ? "default" : "outline"}
              size="sm"
              className="text-xs gap-1"
              onClick={() => { if (editMode) { handleResetAuto(); } else { setEditMode(true); } }}
            >
              <Pencil size={12} />
              {editMode ? "Fechar edição" : "Editar config."}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* ── Edit panel ── */}
        {editMode && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Configuração por string
            </p>

            {mpptConfigEdit.map((strings, mi) => {
              const offset = mpptOffsets[mi];
              const canAddMore = strings.length < maxStringsPorMppt;
              const hasPrev = mi > 0;
              const hasNext = mi < mpptConfigEdit.length - 1;

              return (
                <div key={mi} className="rounded-lg border bg-background overflow-hidden">
                  {/* MPPT header */}
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b">
                    <span className="text-xs font-semibold text-primary">MPPT {mi + 1}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">
                        {strings.length} string{strings.length !== 1 ? "s" : ""}
                        {strings.length > 0 && ` · ${strings.reduce((a, b) => a + b, 0)} painéis`}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs gap-1"
                        disabled={!canAddMore}
                        onClick={() => handleAddString(mi)}
                      >
                        <Plus size={11} /> Adicionar string
                      </Button>
                    </div>
                  </div>

                  {/* String rows */}
                  {strings.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-muted-foreground italic text-center">
                      Sem strings neste MPPT — adicione ou mova strings de outro MPPT
                    </div>
                  ) : (
                    <div className="divide-y">
                      {strings.map((panels, si) => {
                        const globalIdx = offset + si;
                        return (
                          <div key={si} className="flex items-center gap-3 px-3 py-2.5">
                            <span className="text-xs text-muted-foreground w-16 shrink-0">String {globalIdx + 1}</span>
                            <Stepper
                              value={panels}
                              min={1}
                              max={maxPaineisPorString}
                              onChange={v => handleSetPanels(mi, si, v)}
                            />
                            <span className="text-xs text-muted-foreground">módulos</span>
                            <div className="flex items-center gap-1 ml-auto">
                              {hasPrev && (
                                <button
                                  title={`Mover para MPPT ${mi}`}
                                  className="h-6 w-6 rounded border flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30"
                                  onClick={() => handleMoveString(mi, si, "prev")}
                                >
                                  <ChevronLeft size={13} />
                                </button>
                              )}
                              {hasNext && (
                                <button
                                  title={`Mover para MPPT ${mi + 2}`}
                                  className="h-6 w-6 rounded border flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30"
                                  onClick={() => handleMoveString(mi, si, "next")}
                                >
                                  <ChevronRight size={13} />
                                </button>
                              )}
                              <button
                                title="Remover string"
                                className="h-6 w-6 rounded border flex items-center justify-center hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors disabled:opacity-30"
                                disabled={totalStrings <= 1}
                                onClick={() => handleRemoveString(mi, si)}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Live total */}
            <div className="flex items-center gap-3 pt-1 border-t text-sm">
              <span className="text-muted-foreground">Total:</span>
              <span className="font-medium">
                {totalStrings} string{totalStrings !== 1 ? "s" : ""} ·{" "}
                <strong>{totalPaineis} painéis</strong> ·{" "}
                {totalKwp.toFixed(2)} kWp DC
              </span>
              {totalPaineis !== numPaineisAuto && (
                <Badge variant="outline" className="text-xs border-amber-300 text-amber-600 ml-auto">
                  Auto: {numPaineisAuto} painéis
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* ── Summary boxes ── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          {[
            {
              label: config.isMixed ? "Painéis/String" : "Painéis/String",
              value: config.isMixed ? `${Math.min(...config.mpptConfig.flat())}–${config.paineisPerString}` : config.paineisPerString,
            },
            { label: "Nº de Strings", value: config.numStrings },
            { label: "DC/AC Ratio", value: `${(config.dcAcRatio * 100).toFixed(0)}%` },
            { label: "Potência DC", value: `${(config.potenciaDCTotal / 1000).toFixed(2)} kWp` },
          ].map(b => (
            <div key={b.label} className={cn("rounded-lg p-3 text-center", editMode ? "bg-primary/10" : "bg-muted/40")}>
              <div className="text-xl font-bold text-foreground">{b.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{b.label}</div>
            </div>
          ))}
        </div>

        {/* ── MPPT distribution ── */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Distribuição por MPPT</p>
          <div className="flex flex-wrap gap-2">
            {config.mpptConfig.map((strings, mi) => {
              const hasMixed = new Set(strings).size > 1;
              return (
                <div
                  key={mi}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm",
                    strings.length > 0 ? "border-primary/30 bg-primary/5" : "border-dashed text-muted-foreground"
                  )}
                >
                  <div className="font-semibold text-xs mb-1">MPPT {mi + 1}</div>
                  {strings.length === 0 ? (
                    <div className="text-xs text-muted-foreground">vazio</div>
                  ) : strings.map((n, si) => (
                    <div key={si} className="text-xs text-muted-foreground">
                      String {config.mpptConfig.slice(0, mi).reduce((a, s) => a + s.length, 0) + si + 1}: {n} mod.
                    </div>
                  ))}
                  {hasMixed && (
                    <div className="mt-1">
                      <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">⚠ misto</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Voltage/thermal analysis ── */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Análise Térmica de Tensão</p>
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            {[
              { label: `Voc em frio (${tMinPortugal}°C)`, value: `${config.vocFrio.toFixed(0)} V`, sub: `< ${vdcMaxUsado.toFixed(0)} V` },
              { label: `Vmpp em calor (${tMaxCelula.toFixed(0)}°C)`, value: `${config.vmpQuente.toFixed(0)} V`, sub: "janela MPPT" },
              { label: "Voc @ STC", value: `${config.vocSTC.toFixed(0)} V`, sub: "condições STD" },
              { label: "Vmpp @ STC", value: `${config.vmpSTC.toFixed(0)} V`, sub: "condições STD" },
              { label: "Isc por string", value: `${config.iscString.toFixed(2)} A`, sub: "por MPPT" },
              { label: "Vdc Max usado", value: `${vdcMaxUsado.toFixed(0)} V`, sub: "limite inversor" },
            ].map(r => (
              <div key={r.label} className="rounded-lg bg-muted/30 p-2.5">
                <div className="font-mono font-semibold">{r.value}</div>
                <div className="text-xs text-muted-foreground">{r.label}</div>
                <div className="text-xs text-muted-foreground/60">{r.sub}</div>
              </div>
            ))}
          </div>
          {config.isMixed && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              * Configuração mista: Voc = pior caso (max painéis/string), Vmpp = pior caso (min painéis/string)
            </p>
          )}
        </div>

        {/* ── Alerts ── */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Validação Elétrica</p>
          {erros.map((a, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400">
              <XCircle size={15} className="shrink-0 mt-0.5" /> {a.mensagem}
            </div>
          ))}
          {avisos.map((a, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {a.mensagem}
            </div>
          ))}
          {ok.map((a, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 size={15} className="shrink-0 mt-0.5" /> {a.mensagem}
            </div>
          ))}
        </div>

        {/* ── Technical summary ── */}
        <div className="bg-muted/30 rounded-lg p-4 font-mono text-xs space-y-1">
          <p className="font-semibold text-foreground not-italic mb-2">Resumo técnico</p>
          <p>{config.numStrings} string{config.numStrings !== 1 ? "s" : ""} · {config.totalPaineis} painéis · {(config.potenciaDCTotal / 1000).toFixed(2)} kWp</p>
          {config.mpptConfig.map((strings, mi) => strings.length > 0 && (
            <p key={mi}>
              MPPT{mi + 1}: {strings.length} string{strings.length !== 1 ? "s" : ""}
              {" — "}{strings.map((n, si) => `S${config.mpptConfig.slice(0, mi).reduce((a, s) => a + s.length, 0) + si + 1}:${n}p`).join(", ")}
            </p>
          ))}
          <p className="mt-1">Voc @ {tMinPortugal}°C: {config.vocFrio.toFixed(0)}V{config.isMixed ? " (máx)" : ""}</p>
          <p>Vmpp operacional: {config.vmpQuente.toFixed(0)}V{config.isMixed ? " (mín)" : ""}</p>
          <p>DC/AC Ratio: {config.dcAcRatio.toFixed(2)}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   SVG single-line diagram
───────────────────────────────────────────────────────────────────────────── */
function SingleLineDiagram({ panel, inverter, battery, mpptConfig }: {
  panel: SolarPanel;
  inverter: Inverter;
  battery: Battery | null;
  mpptConfig: MpptConfig;
}) {
  const hasBat = battery !== null;
  const activeMppts = mpptConfig.filter(s => s.length > 0);
  const numMppt = Math.min(inverter.numMppt, activeMppts.length);
  const totalRows = mpptConfig.reduce((a, s) => a + s.length, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap size={16} className="text-primary" />
          Diagrama Unifilar Simplificado
        </CardTitle>
      </CardHeader>
      <CardContent>
        <svg viewBox="0 0 700 280" className="w-full h-auto max-h-72" style={{ fontFamily: "inherit" }}>
          {mpptConfig.map((strings, mi) =>
            strings.map((numP, si) => {
              const rowIndex = mpptConfig.slice(0, mi).reduce((a, s) => a + s.length, 0) + si;
              const y = 30 + (rowIndex / Math.max(totalRows - 1, 1)) * 220;
              return (
                <g key={`${mi}-${si}`}>
                  <rect x={10} y={y - 14} width={52} height={28} rx="4" fill="#fef3c7" stroke="#f59e0b" strokeWidth="1.5" />
                  <text x={36} y={y - 2} textAnchor="middle" fontSize="7" fill="#92400e">{numP}× {panel.potencia}W</text>
                  <text x={36} y={y + 8} textAnchor="middle" fontSize="6" fill="#92400e">
                    Str {rowIndex + 1}
                  </text>
                  <line x1={62} y1={y} x2={170} y2={y} stroke="#6b7280" strokeWidth="1.5" />
                </g>
              );
            })
          )}

          {mpptConfig.map((strings, mi) => {
            if (strings.length === 0) return null;
            const rowsBeforeThis = mpptConfig.slice(0, mi).reduce((a, s) => a + s.length, 0);
            const rowsThis = strings.length;
            const yCentre = 30 + ((rowsBeforeThis + (rowsThis - 1) / 2) / Math.max(totalRows - 1, 1)) * 220;
            return (
              <g key={mi}>
                <rect x={170} y={yCentre - 14} width={60} height={28} rx="4" fill="#eff6ff" stroke="#3b82f6" strokeWidth="1.5" />
                <text x={200} y={yCentre - 2} textAnchor="middle" fontSize="8" fill="#1e40af">MPPT {mi + 1}</text>
                <text x={200} y={yCentre + 8} textAnchor="middle" fontSize="6.5" fill="#1e40af">
                  {strings.length}s
                </text>
                <line x1={230} y1={yCentre} x2={270} y2={140} stroke="#6b7280" strokeWidth="1.5" />
              </g>
            );
          })}

          <rect x={270} y={100} width={110} height={80} rx="8" fill="#f0fdf4" stroke="#22c55e" strokeWidth="2" />
          <text x={325} y={128} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#15803d">Inversor</text>
          <text x={325} y={142} textAnchor="middle" fontSize="7.5" fill="#16a34a">{inverter.fabricante}</text>
          <text x={325} y={155} textAnchor="middle" fontSize="7" fill="#16a34a">{inverter.potenciaAc} kW AC</text>
          <text x={325} y={166} textAnchor="middle" fontSize="7" fill="#16a34a">{numMppt} MPPT activos</text>
          <line x1={380} y1={140} x2={hasBat ? 440 : 560} y2={140} stroke="#22c55e" strokeWidth="2" />

          {hasBat && (
            <g>
              <rect x={440} y={100} width={80} height={80} rx="8" fill="#fff7ed" stroke="#f97316" strokeWidth="1.5" />
              <text x={480} y={130} textAnchor="middle" fontSize="8" fontWeight="bold" fill="#c2410c">Bateria</text>
              <text x={480} y={144} textAnchor="middle" fontSize="7" fill="#ea580c">{battery?.capacidade} kWh</text>
              <text x={480} y={156} textAnchor="middle" fontSize="7" fill="#ea580c">{battery?.fabricante}</text>
              <line x1={520} y1={140} x2={560} y2={140} stroke="#f97316" strokeWidth="1.5" />
            </g>
          )}

          <rect x={560} y={108} width={70} height={64} rx="6" fill="#faf5ff" stroke="#8b5cf6" strokeWidth="1.5" />
          <text x={595} y={135} textAnchor="middle" fontSize="8" fontWeight="bold" fill="#6d28d9">Quadro</text>
          <text x={595} y={148} textAnchor="middle" fontSize="7" fill="#7c3aed">Geral</text>
          <text x={595} y={162} textAnchor="middle" fontSize="7" fill="#7c3aed">UPAC</text>
          <line x1={630} y1={140} x2={680} y2={140} stroke="#6b7280" strokeWidth="2" strokeDasharray="6 3" />
          <rect x={652} y={124} width={38} height={32} rx="4" fill="#f9fafb" stroke="#9ca3af" strokeWidth="1.5" />
          <text x={671} y={138} textAnchor="middle" fontSize="8" fontWeight="bold" fill="#374151">Rede</text>
          <text x={671} y={149} textAnchor="middle" fontSize="7" fill="#6b7280">230V AC</text>

          <text x={36} y={18} textAnchor="middle" fontSize="8" fill="#78716c">Módulos FV</text>
          <text x={200} y={18} textAnchor="middle" fontSize="8" fill="#2563eb">Entradas DC</text>
          <text x={325} y={95} textAnchor="middle" fontSize="8" fill="#15803d">Inversor</text>
          {hasBat && <text x={480} y={95} textAnchor="middle" fontSize="8" fill="#c2410c">Armazenamento</text>}
          <text x={595} y={100} textAnchor="middle" fontSize="8" fill="#6d28d9">Quadro</text>
        </svg>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   SemSolucaoCard — shown when no valid string config exists for numPaineis
───────────────────────────────────────────────────────────────────────────── */
interface SemSolucaoCardProps {
  numPaineis: number;
  sugestoes: SemSolucaoInfo;
  vdcMaxUsado: number;
  mpptMin: number;
  mpptMax: number;
  paineis_fixos: boolean;
  onNumPaineisChange?: (n: number) => void;
}

function SemSolucaoCard({
  numPaineis, sugestoes, vdcMaxUsado, mpptMin, mpptMax, paineis_fixos, onNumPaineisChange,
}: SemSolucaoCardProps) {
  const { abaixo, acima, minPerStr, maxPerStr } = sugestoes;
  return (
    <Card className="border-destructive">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <XCircle size={20} className="text-destructive shrink-0 mt-0.5" />
          <div>
            <CardTitle className="text-base text-destructive">
              Sem configuração válida para {numPaineis} painéis
            </CardTitle>
            <CardDescription className="mt-1">
              Não foi possível encontrar nenhuma topologia de strings — simétrica ou assimétrica — que respeite os limites elétricos deste inversor.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Technical reason */}
        <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1 font-mono">
          <p className="font-sans font-semibold text-xs text-muted-foreground uppercase tracking-wide mb-2">Porquê?</p>
          <p>Janela MPPT: <strong>{mpptMin}–{mpptMax} V</strong></p>
          <p>Vdc máximo: <strong>{vdcMaxUsado.toFixed(0)} V</strong></p>
          <p>Painéis por string permitidos: <strong>{minPerStr}–{maxPerStr} módulos</strong></p>
          <p className="font-sans text-muted-foreground text-xs pt-1">
            Nenhuma combinação de strings com {minPerStr}–{maxPerStr} módulos totaliza exatamente {numPaineis} painéis dentro dos limites de strings do inversor.
          </p>
        </div>

        {/* Suggestions */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Opções</p>
          <div className="space-y-2">
            {/* Reduce panels */}
            {abaixo > 0 && (
              <div className={cn(
                "flex items-center gap-3 rounded-lg border p-3",
                paineis_fixos ? "opacity-60" : "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800",
              )}>
                <ArrowDown size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Reduzir para {abaixo} painéis</p>
                  <p className="text-xs text-muted-foreground">Configuração elétrica válida mais próxima abaixo</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={paineis_fixos}
                  onClick={() => onNumPaineisChange?.(abaixo)}
                  className="shrink-0"
                >
                  Aplicar
                </Button>
              </div>
            )}
            {/* Increase panels */}
            {acima > 0 && (
              <div className={cn(
                "flex items-center gap-3 rounded-lg border p-3",
                paineis_fixos ? "opacity-60" : "border-blue-300 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800",
              )}>
                <ArrowUp size={16} className="text-blue-600 dark:text-blue-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Aumentar para {acima} painéis</p>
                  <p className="text-xs text-muted-foreground">Configuração elétrica válida mais próxima acima</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={paineis_fixos}
                  onClick={() => onNumPaineisChange?.(acima)}
                  className="shrink-0"
                >
                  Aplicar
                </Button>
              </div>
            )}
            {/* Change inverter */}
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Zap size={16} className="text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Selecionar outro inversor</p>
                <p className="text-xs text-muted-foreground">Volte ao passo anterior e escolha um inversor com janela MPPT compatível</p>
              </div>
            </div>
          </div>
        </div>

        {/* Fixed mode note */}
        {paineis_fixos && (abaixo > 0 || acima > 0) && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <Lock size={12} className="shrink-0" />
            Modo Painéis Fixos activo — desactive-o para aplicar as sugestões acima.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main export
───────────────────────────────────────────────────────────────────────────── */
function WizardStep5Tecnica({ panel, inverter, battery, numPaineis, potenciaInstalada, onNumPaineisChange, mpptConfig: manualMpptConfig, onMpptConfigChange }: Props) {

  // "Painéis Fixos" mode: panel count is LOCKED — auto-sizing never changes it.
  // Default ON. Can be turned off to allow manual adjustments when no solution exists.
  const [paineisFixos, setPaineisFixos] = useState(true);

  // Local edited mpptConfig — updated immediately when the user changes strings.
  // Takes priority over the parent prop (manualMpptConfig) so the diagram updates
  // in real-time without waiting for the wizard's state round-trip.
  const [localEditedConfig, setLocalEditedConfig] = useState<MpptConfig | null>(null);

  const panelElec = useMemo(() => panel ? {
    voc: Number(panel.voc),
    vmp: Number(panel.vmp),
    isc: Number(panel.isc),
    imp: Number(panel.imp),
    potencia: Number(panel.potencia),
    coeficienteTemperaturaVoc: panel.coeficienteTemperaturaVoc != null ? Number(panel.coeficienteTemperaturaVoc) : null,
    noct: panel.noct != null ? Number(panel.noct) : null,
  } : null, [panel]);

  // Normalise power values: some records may be stored in W (e.g. 32000) instead of kW (32)
  const invElec = useMemo(() => inverter ? {
    mpptMin: Number(inverter.mpptMin),
    mpptMax: Number(inverter.mpptMax),
    corrMaxMppt: Number(inverter.corrMaxMppt),
    numMppt: inverter.numMppt,
    stringsPorMppt: inverter.stringsPorMppt,
    potenciaAc:    normalizarKW(Number(inverter.potenciaAc)),
    potenciaDcMax: normalizarKW(Number(inverter.potenciaDcMax)),
    vdcMax: inverter.vdcMax != null ? Number(inverter.vdcMax) : null,
  } : null, [inverter]);

  // Reset local + parent config whenever panel, inverter, or panel count changes
  useEffect(() => {
    setLocalEditedConfig(null);
    onMpptConfigChange(null);
  }, [panel?.id, inverter?.id, numPaineis]); // eslint-disable-line react-hooks/exhaustive-deps

  const autoSizing = useMemo<StringSizingResult | null>(() => {
    if (!panelElec || !invElec || numPaineis <= 0) return null;
    return calcStringSizing(panelElec, invElec, numPaineis);
  }, [panelElec, invElec, numPaineis]);

  // Effective config priority: localEditedConfig (immediate) > manualMpptConfig (parent persistence) > auto
  const activeSizing = useMemo<StringSizingResult | null>(() => {
    if (!panelElec || !invElec || !autoSizing) return autoSizing;
    const effectiveConfig = localEditedConfig ?? manualMpptConfig;
    if (!effectiveConfig) return autoSizing;
    return calcStringSizingManual(panelElec, invElec, effectiveConfig, numPaineis);
  }, [panelElec, invElec, autoSizing, localEditedConfig, manualMpptConfig, numPaineis]);

  const maxPaneis = useMemo(() =>
    panelElec && invElec ? maxPaineisPerString(panelElec, invElec) : 30,
    [panelElec, invElec]
  );

  const sanidadePainel = useMemo<CompatResult | null>(() => {
    if (!panelElec) return null;
    return checkPanelData({
      potencia: panelElec.potencia,
      voc: panelElec.voc,
      vmp: panelElec.vmp,
      isc: panelElec.isc,
      imp: panelElec.imp,
    });
  }, [panelElec]);

  const compatPanelInv = useMemo<CompatResult | null>(() => {
    if (!panel || !inverter || !panelElec || !invElec) return null;
    return checkPanelInverter(
      { potencia: panelElec.potencia, voc: panelElec.voc, vmp: panelElec.vmp, isc: panelElec.isc, imp: panelElec.imp },
      { potenciaAc: Number(inverter.potenciaAc), potenciaDcMax: invElec.potenciaDcMax, mpptMin: invElec.mpptMin, mpptMax: invElec.mpptMax, corrMaxMppt: invElec.corrMaxMppt, numMppt: invElec.numMppt, stringsPorMppt: invElec.stringsPorMppt, vdcMax: invElec.vdcMax },
      numPaineis
    );
  }, [panel, inverter, panelElec, invElec, numPaineis]);

  const compatBatInv = useMemo<CompatResult | null>(() => {
    if (!battery || !inverter || !invElec) return null;
    return checkBatteryInverter(
      { capacidade: Number(battery.capacidade), tensao: Number(battery.tensao), tecnologia: battery.tecnologia ?? null },
      { potenciaAc: Number(inverter.potenciaAc), potenciaDcMax: invElec.potenciaDcMax, mpptMin: invElec.mpptMin, mpptMax: invElec.mpptMax, corrMaxMppt: invElec.corrMaxMppt, numMppt: invElec.numMppt, stringsPorMppt: invElec.stringsPorMppt, vdcMax: invElec.vdcMax }
    );
  }, [battery, inverter, invElec]);

  if (!panel || !inverter || !panelElec || !invElec) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
        Selecione um painel e um inversor no passo anterior para ver a análise técnica.
      </div>
    );
  }

  const semSolucao = autoSizing?.semSolucao ?? false;
  const hasErrors   = semSolucao
    || (activeSizing?.alertas.some(a => a.tipo === "erro") ?? false)
    || (compatPanelInv?.temErros ?? false)
    || (sanidadePainel?.temErros ?? false);
  const hasWarnings = !semSolucao && (
    (activeSizing?.alertas.some(a => a.tipo === "aviso") ?? false)
    || (compatPanelInv?.temAvisos ?? false)
    || (compatBatInv?.temAvisos ?? false)
  );

  const displayConfig = activeSizing?.config;
  const isMixed = displayConfig?.isMixed ?? false;

  return (
    <div className="space-y-6">

      {/* ── Painéis Fixos mode toggle ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border bg-card">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {paineisFixos
            ? <Lock size={14} className="text-primary shrink-0" />
            : <LockOpen size={14} className="text-muted-foreground shrink-0" />
          }
          <div className="min-w-0">
            <span className="text-sm font-medium">Modo Painéis Fixos</span>
            <span className="text-xs text-muted-foreground ml-2">
              {paineisFixos
                ? `${numPaineis} painéis bloqueados — a engenharia adapta-se`
                : "Número de painéis pode ser ajustado pela engenharia"
              }
            </span>
          </div>
        </div>
        <Button
          variant={paineisFixos ? "default" : "outline"}
          size="sm"
          className="text-xs gap-1.5 shrink-0"
          onClick={() => setPaineisFixos(v => !v)}
        >
          {paineisFixos ? <Lock size={12} /> : <LockOpen size={12} />}
          {paineisFixos ? "Fixo" : "Livre"}
        </Button>
      </div>

      {/* ── Global status banner ── */}
      {!semSolucao && (
        <div className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium",
          hasErrors
            ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400"
            : hasWarnings
              ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400"
              : "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400"
        )}>
          {hasErrors ? <XCircle size={18} /> : hasWarnings ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          {hasErrors
            ? "Sistema com erros de dimensionamento — corrija antes de avançar para proposta."
            : hasWarnings
              ? "Sistema dimensionado com atenções — reveja os alertas abaixo."
              : isMixed
                ? `Sistema validado — ${displayConfig?.numStrings ?? 0} strings · ${displayConfig?.totalPaineis ?? 0} painéis · ${((displayConfig?.potenciaDCTotal ?? 0) / 1000).toFixed(2)} kWp (configuração mista).`
                : `Sistema validado — ${displayConfig?.numStrings ?? 0} strings × ${displayConfig?.paineisPerString ?? 0} painéis (${((displayConfig?.potenciaDCTotal ?? 0) / 1000).toFixed(2)} kWp).`
          }
        </div>
      )}

      {/* Equipment summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex items-center gap-3 p-3 rounded-xl border bg-card">
          <Sun size={18} className="text-amber-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Painel</p>
            <p className="text-sm font-medium truncate">{panel.fabricante} {panel.nome}</p>
            <p className="text-xs text-muted-foreground">{panel.potencia} Wp · Voc {panel.voc}V</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-xl border bg-card">
          <Zap size={18} className="text-primary shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Inversor</p>
            <p className="text-sm font-medium truncate">{inverter.fabricante} {inverter.nome}</p>
            <p className="text-xs text-muted-foreground">{normalizarKW(Number(inverter.potenciaAc)).toFixed(1)} kW · {inverter.numMppt} MPPT</p>
          </div>
        </div>
        {battery && (
          <div className="flex items-center gap-3 p-3 rounded-xl border bg-card">
            <BatteryIcon size={18} className="text-orange-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Bateria</p>
              <p className="text-sm font-medium truncate">{battery.fabricante} {battery.nome}</p>
              <p className="text-xs text-muted-foreground">{battery.capacidade} kWh</p>
            </div>
          </div>
        )}
      </div>

      {/* ── No solution panel ── */}
      {semSolucao && autoSizing?.sugestoes && (
        <SemSolucaoCard
          numPaineis={numPaineis}
          sugestoes={autoSizing.sugestoes}
          vdcMaxUsado={autoSizing.vdcMaxUsado}
          mpptMin={invElec.mpptMin}
          mpptMax={invElec.mpptMax}
          paineis_fixos={paineisFixos}
          onNumPaineisChange={onNumPaineisChange}
        />
      )}

      {/* ── Technical content — only when a valid config exists ── */}
      {!semSolucao && (
        <>
          {/* Technical validation table */}
          {activeSizing && (
            <TechSummaryTable
              sizing={activeSizing}
              invElec={{
                potenciaAc:    Number(inverter.potenciaAc),
                potenciaDcMax: invElec.potenciaDcMax,
                mpptMin:       invElec.mpptMin,
                mpptMax:       invElec.mpptMax,
                corrMaxMppt:   invElec.corrMaxMppt,
                numMppt:       invElec.numMppt,
                stringsPorMppt: invElec.stringsPorMppt,
              }}
              panelIsc={panelElec.isc}
              battery={battery
                ? { capacidade: Number(battery.capacidade), tensao: Number(battery.tensao) }
                : null}
            />
          )}

          {/* String sizing card — editable MPPT/string configuration */}
          {autoSizing && (
            <StringSizingCard
              autoResult={autoSizing}
              numMppt={inverter.numMppt}
              maxStringsPorMppt={inverter.stringsPorMppt}
              maxPaineisPorString={maxPaneis}
              panelElec={panelElec}
              invElec={invElec}
              numPaineisAuto={numPaineis}
              onConfigChange={(mpptConfig) => {
                // Update local state immediately → diagram reacts in same render
                setLocalEditedConfig(mpptConfig);
                // Also persist to parent wizard state (for save/proposal)
                onMpptConfigChange(mpptConfig);
                // Only propagate panel count changes if NOT in fixed mode
                if (!paineisFixos) {
                  const total = mpptConfig.flat().reduce((a, b) => a + b, 0);
                  if (total > 0) onNumPaineisChange?.(total);
                }
              }}
            />
          )}

          {/* Single line diagram */}
          {activeSizing && (
            <SingleLineDiagram
              panel={panel}
              inverter={inverter}
              battery={battery}
              mpptConfig={activeSizing.config.mpptConfig}
            />
          )}
        </>
      )}

      {/* Compatibility tables — always visible */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 size={16} className="text-primary" />
            Análise de Compatibilidade
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {sanidadePainel && sanidadePainel.temErros && (
            <CompatTable result={sanidadePainel} title="Dados do Painel — Verificação Física" />
          )}
          {compatPanelInv && <CompatTable result={compatPanelInv} title="Painel ↔ Inversor" />}
          {compatBatInv && <CompatTable result={compatBatInv} title="Bateria ↔ Inversor" />}
        </CardContent>
      </Card>
    </div>
  );
}
export default memo(WizardStep5Tecnica);
