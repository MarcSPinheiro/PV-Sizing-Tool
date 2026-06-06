import { useState, useEffect, useMemo, useCallback, memo } from "react";
import {
  CheckCircle2, AlertTriangle, XCircle, GitBranch, Zap, Sun,
  ChevronDown, ChevronRight, Pencil, RotateCcw, Plus, Trash2,
  ChevronLeft, Battery as BatteryIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  calcStringSizing, calcStringSizingManual, maxPaineisPerString,
  type StringSizingResult, type MpptConfig,
} from "@/lib/string-sizing";
import {
  type InverterUnit, distribuirPaineis, calcMultiTotais,
} from "@/lib/multi-inverter";
import type { SolarPanel, Inverter, Battery } from "@workspace/api-client-react";

/** Normalise a power field that may have been imported in W instead of kW (e.g. 32000 → 32). */
function normalizarKW(val: number): number {
  return val > 500 ? val / 1000 : val;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Shared tiny components
───────────────────────────────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: "ok" | "aviso" | "erro" | "info" }) {
  if (status === "ok")    return <Badge className="text-[10px] px-1.5 py-0 bg-emerald-500 hover:bg-emerald-500">OK</Badge>;
  if (status === "aviso") return <Badge className="text-[10px] px-1.5 py-0 bg-amber-500 hover:bg-amber-500">Atenção</Badge>;
  if (status === "erro")  return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Erro</Badge>;
  return <Badge variant="outline" className="text-[10px] px-1.5 py-0">Info</Badge>;
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button
        className="w-7 h-7 rounded border flex items-center justify-center text-sm font-bold disabled:opacity-30 hover:bg-muted transition-colors"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >−</button>
      <span className="w-8 text-center text-sm font-mono font-semibold">{value}</span>
      <button
        className="w-7 h-7 rounded border flex items-center justify-center text-sm font-bold disabled:opacity-30 hover:bg-muted transition-colors"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >+</button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Per-unit Technical Validation Table
───────────────────────────────────────────────────────────────────────────── */
interface PerUnitTechTableProps {
  sizing: StringSizingResult;
  invElec: {
    potenciaAc: number; potenciaDcMax: number;
    mpptMin: number; mpptMax: number; corrMaxMppt: number;
    numMppt: number; stringsPorMppt: number;
    vdcMax: number | null;
  };
  panelIsc: number;
}

function PerUnitTechTable({ sizing, invElec, panelIsc }: PerUnitTechTableProps) {
  const { config, tMinPortugal, tMaxCelula, vdcMaxUsado } = sizing;

  const activeMppts      = config.mpptConfig.filter(s => s.length > 0).length;
  const maxStringsInMppt = config.mpptConfig.reduce((mx, s) => Math.max(mx, s.length), 0);
  const maxIscPerMppt    = maxStringsInMppt * panelIsc;
  const allPanelCounts   = config.mpptConfig.flat().filter(v => v > 0);
  const maxPaineisPorStr = allPanelCounts.length > 0 ? Math.max(...allPanelCounts) : config.paineisPerString;
  const minPaineisPorStr = allPanelCounts.length > 0 ? Math.min(...allPanelCounts) : config.paineisPerString;

  type Row = { label: string; sub?: string; obtido: string; limite: string; status: "ok" | "aviso" | "erro" | "info" };

  const rows: Row[] = [
    {
      label: "Potência DC Total",
      obtido: `${(config.potenciaDCTotal / 1000).toFixed(2)} kWp`,
      limite: `≤ ${invElec.potenciaDcMax} kW DC`,
      status: config.potenciaDCTotal / 1000 > invElec.potenciaDcMax * 1.05 ? "aviso" : "ok",
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
      obtido: `${activeMppts} de ${invElec.numMppt}`,
      limite: `≤ ${invElec.numMppt}`,
      status: activeMppts > invElec.numMppt ? "erro" : "ok",
    },
    {
      label: "Strings por MPPT",
      sub: maxStringsInMppt > 1 ? `${maxStringsInMppt} strings no MPPT mais carregado` : undefined,
      obtido: `máx. ${maxStringsInMppt}`,
      limite: `≤ ${invElec.stringsPorMppt}`,
      status: maxStringsInMppt > invElec.stringsPorMppt ? "erro"
        : maxStringsInMppt === invElec.stringsPorMppt ? "aviso" : "ok",
    },
    {
      label: "Painéis por String",
      sub: config.isMixed ? "configuração mista — pior caso" : undefined,
      obtido: config.isMixed ? `${minPaineisPorStr}–${maxPaineisPorStr} mod.` : `${config.paineisPerString} mod.`,
      limite: "janela Voc/Vmpp",
      status: "ok",
    },
    {
      label: `Voc em Frio (${tMinPortugal} °C)`,
      sub: "pior caso — string com mais painéis",
      obtido: `${config.vocFrio.toFixed(0)} V`,
      limite: `< ${vdcMaxUsado.toFixed(0)} V`,
      status: config.vocFrio >= vdcMaxUsado ? "erro"
        : config.vocFrio >= vdcMaxUsado * 0.95 ? "aviso" : "ok",
    },
    {
      label: `Vmpp em Calor (${tMaxCelula.toFixed(0)} °C)`,
      sub: "pior caso — string com menos painéis",
      obtido: `${config.vmpQuente.toFixed(0)} V`,
      limite: `> ${invElec.mpptMin} V`,
      status: config.vmpQuente < invElec.mpptMin ? "aviso" : "ok",
    },
    {
      label: "Corrente Isc por MPPT",
      sub: maxStringsInMppt > 1
        ? `${maxStringsInMppt}× ${panelIsc.toFixed(2)} A em paralelo`
        : `${panelIsc.toFixed(2)} A por string`,
      obtido: `${maxIscPerMppt.toFixed(2)} A`,
      limite: `≤ ${invElec.corrMaxMppt} A`,
      status: maxIscPerMppt > invElec.corrMaxMppt ? "erro"
        : maxIscPerMppt > invElec.corrMaxMppt * 0.9 ? "aviso" : "ok",
    },
  ];

  const hasErros  = rows.some(r => r.status === "erro");
  const hasAvisos = rows.some(r => r.status === "aviso");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CheckCircle2 size={14} className="text-primary" />
            Verificações Técnicas
          </CardTitle>
          <div className="flex items-center gap-1.5">
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
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">Limite</th>
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
   Per-unit String Sizing Card (editable)
───────────────────────────────────────────────────────────────────────────── */
interface PerUnitStringCardProps {
  autoResult: StringSizingResult;
  numMppt: number;
  maxStringsPorMppt: number;
  maxPaineisPorString: number;
  panelElec: { voc: number; vmp: number; isc: number; imp: number; potencia: number; coeficienteTemperaturaVoc: number | null; noct: number | null };
  invElec:   { mpptMin: number; mpptMax: number; corrMaxMppt: number; numMppt: number; stringsPorMppt: number; potenciaAc: number; potenciaDcMax: number; vdcMax: number | null };
  numPaineisAuto: number;
  onConfigChange?: (config: MpptConfig, totalPaineis: number) => void;
}

function PerUnitStringCard({
  autoResult, numMppt, maxStringsPorMppt, maxPaineisPorString,
  panelElec, invElec, numPaineisAuto, onConfigChange,
}: PerUnitStringCardProps) {
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

  const updateConfig = useCallback((next: MpptConfig) => {
    setMpptConfigEdit(next);
    const total = next.flat().reduce((a, b) => a + b, 0);
    onConfigChange?.(next, total);
  }, [onConfigChange]);

  function handleResetAuto() {
    setMpptConfigEdit(autoResult.config.mpptConfig);
    setEditMode(false);
    const total = autoResult.config.mpptConfig.flat().reduce((a, b) => a + b, 0);
    onConfigChange?.(autoResult.config.mpptConfig, total);
  }

  const mpptOffsets = mpptConfigEdit.reduce<number[]>((acc, strings, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + mpptConfigEdit[i - 1].length);
    return acc;
  }, []);

  const totalStrings = mpptConfigEdit.reduce((a, m) => a + m.length, 0);
  const totalPaineis = mpptConfigEdit.flat().reduce((a, b) => a + b, 0);
  const totalKwp     = (totalPaineis * panelElec.potencia) / 1000;

  const erros  = alertas.filter(a => a.tipo === "erro");
  const avisos = alertas.filter(a => a.tipo === "aviso");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <GitBranch size={14} className="text-primary" />
              Dimensionamento de Strings
            </CardTitle>
            <CardDescription className="mt-0.5 text-xs">
              {editMode ? "Modo edição — configure cada string individualmente" : "Cálculo automático"}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {editMode && (
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7" onClick={handleResetAuto}>
                <RotateCcw size={11} /> Automático
              </Button>
            )}
            <Button
              variant={editMode ? "default" : "outline"}
              size="sm"
              className="text-xs gap-1 h-7"
              onClick={() => { if (editMode) handleResetAuto(); else setEditMode(true); }}
            >
              <Pencil size={11} />
              {editMode ? "Fechar" : "Editar"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Edit panel */}
        {editMode && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Config. por string</p>
            {mpptConfigEdit.map((strings, mi) => {
              const offset = mpptOffsets[mi];
              const canAddMore = strings.length < maxStringsPorMppt;
              const hasPrev = mi > 0;
              const hasNext = mi < mpptConfigEdit.length - 1;
              return (
                <div key={mi} className="rounded-lg border bg-background overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b">
                    <span className="text-xs font-semibold text-primary">MPPT {mi + 1}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">
                        {strings.length} string{strings.length !== 1 ? "s" : ""}
                        {strings.length > 0 && ` · ${strings.reduce((a, b) => a + b, 0)} painéis`}
                      </span>
                      <Button
                        variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1"
                        disabled={!canAddMore}
                        onClick={() => {
                          const cur = mpptConfigEdit[mi];
                          const def = cur.length > 0 ? cur[cur.length - 1] : autoResult.config.paineisPerString;
                          updateConfig(mpptConfigEdit.map((s, i) => i === mi ? [...s, def] : s));
                        }}
                      >
                        <Plus size={10} /> Str.
                      </Button>
                    </div>
                  </div>
                  {strings.length === 0 ? (
                    <div className="px-4 py-2 text-xs text-muted-foreground italic text-center">
                      Vazio — adicione ou mova strings
                    </div>
                  ) : (
                    <div className="divide-y">
                      {strings.map((panels, si) => (
                        <div key={si} className="flex items-center gap-2 px-3 py-2">
                          <span className="text-xs text-muted-foreground w-14 shrink-0">String {offset + si + 1}</span>
                          <Stepper
                            value={panels}
                            min={1}
                            max={maxPaineisPorString}
                            onChange={v => updateConfig(mpptConfigEdit.map((s, i) => i === mi ? s.map((p, j) => j === si ? v : p) : s))}
                          />
                          <span className="text-xs text-muted-foreground">mod.</span>
                          <div className="flex items-center gap-1 ml-auto">
                            {hasPrev && (
                              <button
                                title={`Mover para MPPT ${mi}`}
                                className="h-6 w-6 rounded border flex items-center justify-center hover:bg-muted transition-colors"
                                onClick={() => {
                                  const p = panels;
                                  updateConfig(mpptConfigEdit.map((s, i) => {
                                    if (i === mi)     return s.filter((_, j) => j !== si);
                                    if (i === mi - 1) return [...s, p];
                                    return s;
                                  }));
                                }}
                              ><ChevronLeft size={12} /></button>
                            )}
                            {hasNext && (
                              <button
                                title={`Mover para MPPT ${mi + 2}`}
                                className="h-6 w-6 rounded border flex items-center justify-center hover:bg-muted transition-colors"
                                onClick={() => {
                                  const p = panels;
                                  updateConfig(mpptConfigEdit.map((s, i) => {
                                    if (i === mi)     return s.filter((_, j) => j !== si);
                                    if (i === mi + 1) return [...s, p];
                                    return s;
                                  }));
                                }}
                              ><ChevronRight size={12} /></button>
                            )}
                            <button
                              title="Remover string"
                              className="h-6 w-6 rounded border flex items-center justify-center hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors disabled:opacity-30"
                              disabled={totalStrings <= 1}
                              onClick={() => updateConfig(mpptConfigEdit.map((s, i) => i === mi ? s.filter((_, j) => j !== si) : s))}
                            ><Trash2 size={11} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="flex items-center gap-3 pt-1 border-t text-sm">
              <span className="text-muted-foreground">Total:</span>
              <span className="font-medium">
                {totalStrings} string{totalStrings !== 1 ? "s" : ""} · <strong>{totalPaineis} painéis</strong> · {totalKwp.toFixed(2)} kWp
              </span>
              {totalPaineis !== numPaineisAuto && (
                <Badge variant="outline" className="text-xs border-amber-300 text-amber-600 ml-auto">
                  Auto: {numPaineisAuto} painéis
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Summary boxes */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          {[
            {
              label: "Painéis/String",
              value: config.isMixed
                ? `${Math.min(...config.mpptConfig.flat())}–${config.paineisPerString}`
                : config.paineisPerString,
            },
            { label: "Nº de Strings", value: config.numStrings },
            { label: "DC/AC Ratio",   value: `${(config.dcAcRatio * 100).toFixed(0)}%` },
            { label: "Potência DC",   value: `${(config.potenciaDCTotal / 1000).toFixed(2)} kWp` },
          ].map(b => (
            <div key={b.label} className={cn("rounded-lg p-2.5 text-center", editMode ? "bg-primary/10" : "bg-muted/40")}>
              <div className="text-lg font-bold">{b.value}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{b.label}</div>
            </div>
          ))}
        </div>

        {/* MPPT distribution */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Distribuição por MPPT</p>
          <div className="flex flex-wrap gap-1.5">
            {config.mpptConfig.map((strings, mi) => {
              const hasMixed = new Set(strings).size > 1;
              return (
                <div
                  key={mi}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-xs",
                    strings.length > 0 ? "border-primary/30 bg-primary/5" : "border-dashed text-muted-foreground",
                  )}
                >
                  <div className="font-semibold mb-0.5">MPPT {mi + 1}</div>
                  {strings.length === 0 ? (
                    <div className="text-muted-foreground">vazio</div>
                  ) : strings.map((n, si) => (
                    <div key={si} className="text-muted-foreground">
                      S{config.mpptConfig.slice(0, mi).reduce((a, s) => a + s.length, 0) + si + 1}: {n} mod.
                    </div>
                  ))}
                  {hasMixed && <div className="mt-0.5 text-amber-600 font-medium">⚠ misto</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Thermal voltage */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Análise Térmica</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[
              { label: `Voc em frio (${tMinPortugal}°C)`, value: `${config.vocFrio.toFixed(0)} V`, sub: `< ${vdcMaxUsado.toFixed(0)} V` },
              { label: `Vmpp em calor (${tMaxCelula.toFixed(0)}°C)`, value: `${config.vmpQuente.toFixed(0)} V`, sub: "janela MPPT" },
              { label: "Voc @ STC",  value: `${config.vocSTC.toFixed(0)} V`, sub: "condições STD" },
              { label: "Vmpp @ STC", value: `${config.vmpSTC.toFixed(0)} V`, sub: "condições STD" },
              { label: "Isc/string", value: `${config.iscString.toFixed(2)} A`, sub: "por MPPT" },
              { label: "Vdc máx",    value: `${vdcMaxUsado.toFixed(0)} V`, sub: "limite inversor" },
            ].map(r => (
              <div key={r.label} className="rounded-lg bg-muted/30 p-2">
                <div className="font-mono font-semibold text-sm">{r.value}</div>
                <div className="text-[10px] text-muted-foreground">{r.label}</div>
                <div className="text-[10px] text-muted-foreground/60">{r.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts */}
        {(erros.length > 0 || avisos.length > 0) && (
          <div className="space-y-1.5">
            {erros.map((a, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                <XCircle size={13} className="shrink-0 mt-0.5" /> {a.mensagem}
              </div>
            ))}
            {avisos.map((a, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {a.mensagem}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Per-unit collapsible card
───────────────────────────────────────────────────────────────────────────── */
interface InverterUnitCardProps {
  unit: InverterUnit;
  index: number;
  inverter: Inverter;
  panel: SolarPanel;
  numPaineis: number;
  onUnitChange: (key: string, changes: Partial<InverterUnit>) => void;
}

function InverterUnitCard({ unit, index, inverter, panel, numPaineis, onUnitChange }: InverterUnitCardProps) {
  const [expanded, setExpanded] = useState(index === 0);

  const panelElec = useMemo(() => ({
    voc: Number(panel.voc),
    vmp: Number(panel.vmp),
    isc: Number(panel.isc),
    imp: Number(panel.imp),
    potencia: Number(panel.potencia),
    coeficienteTemperaturaVoc: panel.coeficienteTemperaturaVoc != null ? Number(panel.coeficienteTemperaturaVoc) : null,
    noct: panel.noct != null ? Number(panel.noct) : null,
  }), [panel]);

  const invElec = useMemo(() => ({
    mpptMin:       Number(inverter.mpptMin),
    mpptMax:       Number(inverter.mpptMax),
    corrMaxMppt:   Number(inverter.corrMaxMppt),
    numMppt:       inverter.numMppt,
    stringsPorMppt: inverter.stringsPorMppt,
    potenciaAc:    normalizarKW(Number(inverter.potenciaAc)),
    potenciaDcMax: normalizarKW(Number(inverter.potenciaDcMax)),
    vdcMax:        inverter.vdcMax != null ? Number(inverter.vdcMax) : null,
  }), [inverter]);

  const autoSizing = useMemo<StringSizingResult | null>(() => {
    if (numPaineis <= 0) return null;
    return calcStringSizing(panelElec, invElec, numPaineis);
  }, [panelElec, invElec, numPaineis]);

  const activeSizing = useMemo<StringSizingResult | null>(() => {
    if (!autoSizing) return null;
    if (!unit.mpptConfig) return autoSizing;
    return calcStringSizingManual(panelElec, invElec, unit.mpptConfig, numPaineis);
  }, [autoSizing, unit.mpptConfig, panelElec, invElec, numPaineis]);

  const maxPaneis = useMemo(() => maxPaineisPerString(panelElec, invElec), [panelElec, invElec]);

  const hasErrors   = activeSizing?.alertas.some(a => a.tipo === "erro")  ?? false;
  const hasWarnings = activeSizing?.alertas.some(a => a.tipo === "aviso") ?? false;

  const dcKwp = activeSizing ? (activeSizing.config.potenciaDCTotal / 1000) : (numPaineis * Number(panel.potencia) / 1000);
  const acKw  = Number(inverter.potenciaAc) * unit.quantidade;
  const ratio = acKw > 0 ? (dcKwp / acKw) * 100 : 0;

  return (
    <Card className={cn(
      "overflow-hidden",
      hasErrors   && "border-red-300 dark:border-red-800",
      !hasErrors && hasWarnings && "border-amber-300 dark:border-amber-800",
    )}>
      {/* Header */}
      <button
        type="button"
        className="w-full text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <CardHeader className="pb-3 pt-4 hover:bg-muted/30 transition-colors">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              {expanded ? <ChevronDown size={16} className="shrink-0 text-muted-foreground" /> : <ChevronRight size={16} className="shrink-0 text-muted-foreground" />}
              <Zap size={16} className="text-primary shrink-0" />
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">
                  Inversor {index + 1} — {inverter.fabricante} {inverter.nome}
                  {unit.quantidade > 1 && <span className="text-muted-foreground ml-1">(×{unit.quantidade})</span>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {numPaineis} painéis · {dcKwp.toFixed(2)} kWp DC · {acKw.toFixed(1)} kW AC · DC/AC {ratio.toFixed(0)}%
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {hasErrors   && <Badge variant="destructive"                                         className="text-xs">Erros</Badge>}
              {!hasErrors && hasWarnings  && <Badge className="text-xs bg-amber-500 hover:bg-amber-500">Atenções</Badge>}
              {!hasErrors && !hasWarnings && <Badge className="text-xs bg-emerald-500 hover:bg-emerald-500">OK</Badge>}
            </div>
          </div>
        </CardHeader>
      </button>

      {/* Body */}
      {expanded && (
        <CardContent className="space-y-4 pt-0 pb-5">
          {!activeSizing && (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhum painel atribuído a este inversor.
            </div>
          )}
          {activeSizing && (
            <>
              <PerUnitTechTable
                sizing={activeSizing}
                invElec={invElec}
                panelIsc={panelElec.isc}
              />
              {autoSizing && (
                <PerUnitStringCard
                  autoResult={autoSizing}
                  numMppt={inverter.numMppt}
                  maxStringsPorMppt={inverter.stringsPorMppt}
                  maxPaineisPorString={maxPaneis}
                  panelElec={panelElec}
                  invElec={invElec}
                  numPaineisAuto={numPaineis}
                  onConfigChange={(config, newTotal) => {
                    onUnitChange(unit.key, {
                      mpptConfig: config,
                      numPaineisOverride: newTotal !== numPaineis ? newTotal : null,
                    });
                  }}
                />
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main export — WizardStep6MultiTecnica
───────────────────────────────────────────────────────────────────────────── */
interface Props {
  panel: SolarPanel | null;
  inverterUnits: InverterUnit[];
  allInverters: Inverter[];
  battery: Battery | null;
  numPaineisTotais: number;
  onUnitChange: (key: string, changes: Partial<InverterUnit>) => void;
}

function WizardStep6MultiTecnica({
  panel, inverterUnits, allInverters, battery, numPaineisTotais, onUnitChange,
}: Props) {
  const dcMaxMap = useMemo(() => {
    const m = new Map<number, number>();
    allInverters.forEach(i => m.set(i.id, Number(i.potenciaDcMax)));
    return m;
  }, [allInverters]);

  const acMap = useMemo(() => {
    const m = new Map<number, number>();
    allInverters.forEach(i => m.set(i.id, Number(i.potenciaAc)));
    return m;
  }, [allInverters]);

  const numPaineisMap = useMemo(
    () => distribuirPaineis(inverterUnits, dcMaxMap, numPaineisTotais),
    [inverterUnits, dcMaxMap, numPaineisTotais],
  );

  const totais = useMemo(
    () => calcMultiTotais(inverterUnits, acMap, numPaineisMap, panel ? Number(panel.potencia) : 400),
    [inverterUnits, acMap, numPaineisMap, panel],
  );

  if (!panel) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
        Selecione um painel no passo anterior para ver a análise técnica.
      </div>
    );
  }

  const globalHasErrors   = inverterUnits.some(u => {
    const inv = allInverters.find(i => i.id === u.inverterId);
    if (!inv) return false;
    const n = numPaineisMap.get(u.key) ?? 0;
    if (n === 0) return false;
    const panelElec = { voc: Number(panel.voc), vmp: Number(panel.vmp), isc: Number(panel.isc), imp: Number(panel.imp), potencia: Number(panel.potencia), coeficienteTemperaturaVoc: panel.coeficienteTemperaturaVoc != null ? Number(panel.coeficienteTemperaturaVoc) : null, noct: panel.noct != null ? Number(panel.noct) : null };
    const invElec = { mpptMin: Number(inv.mpptMin), mpptMax: Number(inv.mpptMax), corrMaxMppt: Number(inv.corrMaxMppt), numMppt: inv.numMppt, stringsPorMppt: inv.stringsPorMppt, potenciaAc: normalizarKW(Number(inv.potenciaAc)), potenciaDcMax: normalizarKW(Number(inv.potenciaDcMax)), vdcMax: inv.vdcMax != null ? Number(inv.vdcMax) : null };
    const sizing = u.mpptConfig ? calcStringSizingManual(panelElec, invElec, u.mpptConfig, n) : calcStringSizing(panelElec, invElec, n);
    return sizing.alertas.some(a => a.tipo === "erro");
  });

  const globalHasWarnings = !globalHasErrors && inverterUnits.some(u => {
    const inv = allInverters.find(i => i.id === u.inverterId);
    if (!inv) return false;
    const n = numPaineisMap.get(u.key) ?? 0;
    if (n === 0) return false;
    const panelElec = { voc: Number(panel.voc), vmp: Number(panel.vmp), isc: Number(panel.isc), imp: Number(panel.imp), potencia: Number(panel.potencia), coeficienteTemperaturaVoc: panel.coeficienteTemperaturaVoc != null ? Number(panel.coeficienteTemperaturaVoc) : null, noct: panel.noct != null ? Number(panel.noct) : null };
    const invElec = { mpptMin: Number(inv.mpptMin), mpptMax: Number(inv.mpptMax), corrMaxMppt: Number(inv.corrMaxMppt), numMppt: inv.numMppt, stringsPorMppt: inv.stringsPorMppt, potenciaAc: normalizarKW(Number(inv.potenciaAc)), potenciaDcMax: normalizarKW(Number(inv.potenciaDcMax)), vdcMax: inv.vdcMax != null ? Number(inv.vdcMax) : null };
    const sizing = u.mpptConfig ? calcStringSizingManual(panelElec, invElec, u.mpptConfig, n) : calcStringSizing(panelElec, invElec, n);
    return sizing.alertas.some(a => a.tipo === "aviso");
  });

  return (
    <div className="space-y-5">
      {/* Global status banner */}
      <div className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium",
        globalHasErrors
          ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400"
          : globalHasWarnings
            ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400"
            : "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400",
      )}>
        {globalHasErrors ? <XCircle size={18} /> : globalHasWarnings ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
        {globalHasErrors
          ? "Sistema com erros — corrija antes de avançar para proposta."
          : globalHasWarnings
            ? "Sistema dimensionado com atenções — reveja os alertas por inversor."
            : `Sistema validado — ${totais.numUnidades} inversor${totais.numUnidades !== 1 ? "es" : ""} · ${totais.numPaineis} painéis · ${totais.potenciaDCkWp.toFixed(2)} kWp DC.`
        }
      </div>

      {/* Global totals */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sun size={14} className="text-amber-500" />
            Totais Globais do Sistema
          </CardTitle>
          <CardDescription className="text-xs">
            {inverterUnits.length} modelo{inverterUnits.length !== 1 ? "s" : ""} · {totais.numUnidades} inversor{totais.numUnidades !== 1 ? "es" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Potência DC",    value: `${totais.potenciaDCkWp.toFixed(2)} kWp`,   sub: "instalada" },
              { label: "Potência AC",    value: `${totais.potenciaACkW.toFixed(1)} kW`,      sub: "total inversores" },
              { label: "Painéis",        value: `${totais.numPaineis}`,                      sub: "módulos FV" },
              { label: "DC/AC Global",   value: `${(totais.dcAcRatio * 100).toFixed(0)}%`,   sub: totais.dcAcRatio >= 0.95 && totais.dcAcRatio <= 1.5 ? "intervalo recomendado" : "fora do intervalo" },
            ].map(b => (
              <div key={b.label} className="rounded-lg bg-muted/40 p-3 text-center">
                <div className="text-xl font-bold">{b.value}</div>
                <div className="text-xs font-medium mt-0.5">{b.label}</div>
                <div className="text-[10px] text-muted-foreground">{b.sub}</div>
              </div>
            ))}
          </div>

          {/* Inverter list summary */}
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Distribuição de Painéis</p>
            {inverterUnits.map((unit, idx) => {
              const inv = allInverters.find(i => i.id === unit.inverterId);
              const n = numPaineisMap.get(unit.key) ?? 0;
              const pct = totais.numPaineis > 0 ? (n / totais.numPaineis) * 100 : 0;
              return (
                <div key={unit.key} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground w-4 shrink-0">{idx + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">
                        {inv ? `${inv.fabricante} ${inv.nome}` : `Inversor ${idx + 1}`}
                        {unit.quantidade > 1 && ` (×${unit.quantidade})`}
                      </span>
                      <span className="shrink-0 text-muted-foreground">{n} painéis ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  {unit.numPaineisOverride !== null && (
                    <Badge variant="outline" className="shrink-0 text-[9px] border-amber-400 text-amber-600">manual</Badge>
                  )}
                </div>
              );
            })}
          </div>

          {battery && (
            <div className="mt-4 flex items-center gap-3 p-3 rounded-xl border bg-card">
              <BatteryIcon size={16} className="text-orange-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Bateria</p>
                <p className="text-sm font-medium truncate">{battery.fabricante} {battery.nome}</p>
                <p className="text-xs text-muted-foreground">{battery.capacidade} kWh · {battery.tensao} V</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-unit cards */}
      {inverterUnits.map((unit, idx) => {
        const inv = allInverters.find(i => i.id === unit.inverterId);
        const n = numPaineisMap.get(unit.key) ?? 0;
        if (!inv) return (
          <Card key={unit.key} className="border-dashed">
            <CardContent className="py-4 text-center text-sm text-muted-foreground">
              Inversor {idx + 1} — modelo não selecionado
            </CardContent>
          </Card>
        );
        return (
          <InverterUnitCard
            key={unit.key}
            unit={unit}
            index={idx}
            inverter={inv}
            panel={panel}
            numPaineis={n}
            onUnitChange={onUnitChange}
          />
        );
      })}
    </div>
  );
}
export default memo(WizardStep6MultiTecnica);
