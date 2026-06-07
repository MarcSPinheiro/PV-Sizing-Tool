import { useState, useMemo } from "react";
import { SOLAR_FRACS, consumoFracs, tariffHourlyProfile, dayNightFromTariff, DIAS_MES } from "@/lib/energy-simulation";
import BatteryWarnings, { deriveBatteryWarnings } from "@/components/battery-warnings";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Battery, Plus, Trash2, AlertTriangle, CheckCircle2,
  TrendingUp, Zap, Info, ChevronRight, Lightbulb, Euro,
} from "lucide-react";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { Battery as BatCat } from "@workspace/api-client-react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface BatteryUnit {
  batteryId: number;
  qty: number;
}

interface CenarioLike {
  excessoMensal: number[];
  excessoAnual: number;
  autoconsumoMensal: number[];
  consumoMensal: number[];
  autoconsumoAnual: number;
  energiaAnualEstimada: number;
  capacidadeBateriaRecomendada: number | null;
  poupancaAnual: number;
  investimentoEstimado: number;
}

interface Props {
  batteries: BatCat[];
  batteryUnits: BatteryUnit[];
  onUnitsChange: (units: BatteryUnit[]) => void;
  activeCenario: CenarioLike | null;
  precoKwh: number;
  perfilDiurnoPct: number;
  /** Optional tariff distribution — when present, takes precedence over perfilDiurnoPct. */
  percVazio?: number;
  percCheio?: number;
  percPonta?: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const ETA = 0.92; // round-trip efficiency
const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// ── Helpers ──────────────────────────────────────────────────────────────────

export function calcBatterySystem(units: BatteryUnit[], bats: BatCat[]) {
  const lines = units
    .map(u => ({ bat: bats.find(b => b.id === u.batteryId), qty: u.qty }))
    .filter((l): l is { bat: BatCat; qty: number } => !!l.bat && l.qty > 0);

  if (!lines.length) return null;

  const totalCap = lines.reduce((s, l) => s + l.bat.capacidade * l.qty, 0);
  const dodPct = lines[0].bat.profundidadeDescarga > 0 ? lines[0].bat.profundidadeDescarga : 80;
  const dod = dodPct / 100;
  const utilCap = totalCap * dod;
  const potCarga = lines.reduce((s, l) => {
    const pc = l.bat.potenciaCarga > 0 ? l.bat.potenciaCarga : l.bat.capacidade / 2;
    return s + pc * l.qty;
  }, 0);
  const potDesc = lines.reduce((s, l) => {
    const pd = l.bat.potenciaDescarga > 0 ? l.bat.potenciaDescarga : l.bat.capacidade;
    return s + pd * l.qty;
  }, 0);
  const tensao = lines[0].bat.tensao;
  const totalUnits = lines.reduce((s, l) => s + l.qty, 0);
  return { totalCap, utilCap, dodPct, potCarga, potDesc, tensao, lines, totalUnits };
}

export function calcBatteryStudy(
  sys: NonNullable<ReturnType<typeof calcBatterySystem>>,
  cenario: CenarioLike,
  perfilDiurnoPct: number,
  precoKwh: number,
  tariff?: { percVazio: number; percCheio: number; percPonta: number },
) {
  // Prefer tariff-based hourly profile when available (rigorous); fall back to day/night split.
  const cFracs = tariff
    ? tariffHourlyProfile(tariff.percVazio, tariff.percCheio, tariff.percPonta)
    : consumoFracs(perfilDiurnoPct);
  // Fallback charger / inverter limits when not specified in the battery datasheet
  const maxCarga = sys.potCarga > 0 ? sys.potCarga : sys.totalCap / 2;
  const maxDesc  = sys.potDesc  > 0 ? sys.potDesc  : sys.totalCap;

  let excedenteTotalAnual = 0;  // instantaneous solar surplus (before battery)
  let armazenadoAnual     = 0;  // energy stored in battery (annual)
  let entregueAnual       = 0;  // energy delivered from battery to loads (annual)
  let soc                 = sys.utilCap;  // start in steady-state instead of penalising January with an empty battery
  const ganhoMensal: number[] = [];
  const armazenadoMensal: number[] = [];
  const entregueMensal: number[] = [];
  const excedenteRestanteMensal: number[] = [];

  for (let m = 0; m < 12; m++) {
    // Monthly production = direct autoconsumo + grid export
    const consumoMes = cenario.consumoMensal[m] ?? 0;
    const autoconsumoDiretoMes = Math.min(cenario.autoconsumoMensal[m] ?? 0, consumoMes);
    const consumoRestanteMes = Math.max(0, consumoMes - autoconsumoDiretoMes);
    const producaoMes = (cenario.autoconsumoMensal[m] ?? 0) + (cenario.excessoMensal[m] ?? 0);
    const diasMes = DIAS_MES[m];
    const producaoDia = producaoMes / diasMes;
    const consumoDia  = consumoMes / diasMes;

    // Hourly solar production and consumption (kWh per hour)
    const solar   = SOLAR_FRACS.map(f => f * producaoDia);
    const consumo = cFracs.map(f => f * consumoDia);

    // Instantaneous surplus / deficit per hour
    const excedente = solar.map((s, h) => Math.max(0, s - consumo[h]));
    const deficit   = solar.map((s, h) => Math.max(0, consumo[h] - s));

    excedenteTotalAnual += excedente.reduce((a, b) => a + b, 0) * diasMes;

    // ── One-day battery simulation (hourly forward pass) ─────────────────────
    let armazenadoMes = 0;
    let entregueMes = 0;
    let excedenteRestanteMes = 0;

    for (let d = 0; d < diasMes; d++) {
      for (let h = 0; h < 24; h++) {
        let exportHour = excedente[h];

        if (exportHour > 0 && soc < sys.utilCap) {
          const space  = Math.max(0, sys.utilCap - soc);
          const charge = Math.min(exportHour, maxCarga, space / ETA);
          soc          += charge * ETA;
          armazenadoMes += charge;
          exportHour   -= charge;
        }

        excedenteRestanteMes += Math.max(0, exportHour);

        if (deficit[h] > 0 && soc > 0) {
          const draw      = Math.min(deficit[h] / ETA, maxDesc / ETA, soc);
          const delivered = draw * ETA;
          soc            -= draw;
          entregueMes    += delivered;
        }
      }
    }

    entregueMes = Math.min(entregueMes, consumoRestanteMes);

    armazenadoAnual += armazenadoMes;
    entregueAnual   += entregueMes;
    armazenadoMensal.push(Math.round(armazenadoMes));
    entregueMensal.push(Math.round(entregueMes));
    excedenteRestanteMensal.push(Math.round(excedenteRestanteMes));
    ganhoMensal.push(Math.round(entregueMes));
  }

  // ── Derived KPIs ────────────────────────────────────────────────────────────
  const excessoMedioDiario = excedenteTotalAnual / 365;  // real instantaneous surplus
  const energiaArmazenavel = armazenadoAnual / 365;       // avg stored per day
  const energiaEntregue    = entregueAnual   / 365;       // avg delivered per day

  const percCargaDiaria = sys.utilCap > 0
    ? Math.min(100, Math.round(energiaArmazenavel / (sys.utilCap / ETA) * 100))
    : 0;

  const diasParaEncher = energiaArmazenavel > 0
    ? Math.round((sys.utilCap / ETA / energiaArmazenavel) * 10) / 10
    : 999;

  const ciclosAnuais = sys.utilCap > 0
    ? Math.round(entregueAnual / sys.utilCap)
    : 0;

  const ganhoAnual        = ganhoMensal.reduce((a, b) => a + b, 0);
  const poupancaAdicional = Math.round(ganhoAnual * precoKwh);

  const autoconsumoComBat     = cenario.autoconsumoAnual + ganhoAnual;
  const autoconsumoPercComBat = cenario.energiaAnualEstimada > 0
    ? Math.round((autoconsumoComBat / cenario.energiaAnualEstimada) * 100)
    : 0;
  const autoconsumoPercSemBat = cenario.energiaAnualEstimada > 0
    ? Math.round((cenario.autoconsumoAnual / cenario.energiaAnualEstimada) * 100)
    : 0;

  // Sizing assessment based on realistic hourly surplus
  let status: "subdimensionada" | "equilibrada" | "sobredimensionada";
  if (diasParaEncher > 4)                           status = "sobredimensionada";
  else if (sys.utilCap < excessoMedioDiario * 0.4)  status = "subdimensionada";
  else                                              status = "equilibrada";

  const recCap = excessoMedioDiario > 0
    ? `${(excessoMedioDiario * 1.2).toFixed(0)}–${(excessoMedioDiario * 2).toFixed(0)} kWh`
    : null;

  return {
    excessoMedioDiario,
    energiaArmazenavel,
    energiaEntregue,
    energiaArmazenadaAnual: armazenadoAnual,
    energiaEntregueAnual: entregueAnual,
    armazenadoMensal,
    entregueMensal,
    excedenteRestanteMensal,
    percCargaDiaria,
    diasParaEncher,
    ganhoAnual,
    poupancaAdicional,
    ciclosAnuais,
    ganhoMensal,
    autoconsumoComBat,
    autoconsumoPercComBat,
    autoconsumoPercSemBat,
    status,
    recCap,
  };
}

// ── Status chip ───────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: "subdimensionada" | "equilibrada" | "sobredimensionada" }) {
  if (status === "equilibrada") {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 gap-1.5">
        <CheckCircle2 size={11} /> Equilibrada
      </Badge>
    );
  }
  if (status === "subdimensionada") {
    return (
      <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 gap-1.5">
        <Info size={11} /> Subdimensionada
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 gap-1.5">
      <AlertTriangle size={11} /> Sobredimensionada
    </Badge>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function WizardBatteryStudy({ batteries, batteryUnits, onUnitsChange, activeCenario, precoKwh, perfilDiurnoPct, percVazio, percCheio, percPonta }: Props) {
  const [addBatId, setAddBatId] = useState<number | null>(batteries[0]?.id ?? null);
  const [precoBateriaStr, setPrecoBateriaStr] = useState("");
  const precoBateria = precoBateriaStr !== "" ? parseFloat(precoBateriaStr.replace(",", ".")) : null;
  const precoBateriaValido = precoBateria !== null && precoBateria > 0 && !isNaN(precoBateria);

  const tariff = (percVazio != null && percCheio != null && percPonta != null && (percVazio + percCheio + percPonta) > 0)
    ? { percVazio, percCheio, percPonta } : undefined;

  const sys = useMemo(() => calcBatterySystem(batteryUnits, batteries), [batteryUnits, batteries]);
  const study = useMemo(() => {
    if (!sys || !activeCenario) return null;
    return calcBatteryStudy(sys, activeCenario, perfilDiurnoPct, precoKwh, tariff);
  }, [sys, activeCenario, perfilDiurnoPct, precoKwh, tariff?.percVazio, tariff?.percCheio, tariff?.percPonta]);

  const previousStudy = useMemo(() => {
    if (!activeCenario || batteryUnits.length === 0) return null;
    const units = batteryUnits
      .map((unit) => ({ ...unit }))
      .filter((unit) => unit.qty > 0);
    const lastIdx = units.length - 1;
    if (lastIdx < 0) return null;
    units[lastIdx].qty -= 1;
    const previousUnits = units.filter((unit) => unit.qty > 0);
    const previousSys = calcBatterySystem(previousUnits, batteries);
    if (!previousSys) return null;
    return calcBatteryStudy(previousSys, activeCenario, perfilDiurnoPct, precoKwh, tariff);
  }, [activeCenario, batteryUnits, batteries, perfilDiurnoPct, precoKwh, tariff?.percVazio, tariff?.percCheio, tariff?.percPonta]);

  const batteryChart = useMemo(() => {
    if (!study || !activeCenario) return null;
    const data = activeCenario.consumoMensal.map((consumo, i) => {
      const autoconsumoDireto = activeCenario.autoconsumoMensal[i] ?? 0;
      return {
        mes: MONTH_LABELS[i],
        autoconsumoDireto,
        bateria: study.entregueMensal[i] ?? 0,
        excedenteComBat: study.excedenteRestanteMensal[i] ?? 0,
        consumo,
      };
    });

    return {
      data,
      excedenteComBateriaAnual: study.excedenteRestanteMensal.reduce((a, b) => a + b, 0),
      autoconsumoComBateria: activeCenario.autoconsumoAnual + study.ganhoAnual,
    };
  }, [study, activeCenario]);

  // Derive night consumption per day for warnings (kWh/dia)
  const consumoNoturnoDiario = useMemo(() => {
    if (!activeCenario) return 0;
    const annual = activeCenario.consumoMensal.reduce((s, m) => s + m, 0);
    const { noturnoPct } = tariff
      ? dayNightFromTariff(tariff.percVazio, tariff.percCheio, tariff.percPonta)
      : { noturnoPct: 100 - perfilDiurnoPct };
    return (annual * (noturnoPct / 100)) / 365;
  }, [activeCenario, perfilDiurnoPct, tariff?.percVazio, tariff?.percCheio, tariff?.percPonta]);

  // Recommended capacity range (kWh úteis) — based on excedente médio diário
  const recommendedRange = useMemo(() => {
    if (!study) return null;
    const e = study.excessoMedioDiario;
    if (e <= 0) return null;
    return { min: e * 1.0, max: e * 1.8 };
  }, [study]);

  // Battery warnings
  const warnings = useMemo(() => {
    if (!study || !sys) return [];
    const investimentoTotal = precoBateria !== null ? precoBateria * sys.totalUnits : null;
    const payback = precoBateriaValido && precoBateria !== null && study.poupancaAdicional > 0
      ? (investimentoTotal ?? precoBateria) / study.poupancaAdicional
      : null;
    return deriveBatteryWarnings({
      utilCap: sys.utilCap,
      recommendedUtilMin: recommendedRange?.min ?? null,
      recommendedUtilMax: recommendedRange?.max ?? null,
      excessoMedioDiario: study.excessoMedioDiario,
      consumoNoturnoDiario,
      percCargaDiaria: study.percCargaDiaria,
      ciclosAnuais: study.ciclosAnuais,
      potCarga: sys.potCarga,
      potDesc: sys.potDesc,
      payback,
    });
  }, [study, sys, recommendedRange, consumoNoturnoDiario, precoBateriaValido, precoBateria]);

  // Auto-suggestions based on recommended capacity
  const suggestions = useMemo(() => {
    if (!activeCenario?.capacidadeBateriaRecomendada) return [];
    const target = activeCenario.capacidadeBateriaRecomendada;
    return batteries.flatMap(bat => {
      const dod = bat.profundidadeDescarga > 0 ? bat.profundidadeDescarga / 100 : 0.8;
      const qtyRec = Math.max(1, Math.ceil(target / (bat.capacidade * dod)));
      return [1, qtyRec, qtyRec + 1]
        .filter((q, i, a) => q >= 1 && q <= 8 && a.indexOf(q) === i)
        .map(qty => ({
          batteryId: bat.id,
          qty,
          label: `${bat.fabricante} ${bat.nome}`,
          totalCap: bat.capacidade * qty,
          utilCap: +(bat.capacidade * qty * dod).toFixed(1),
          isRec: qty === qtyRec,
        }));
    })
      .sort((a, b) => Math.abs(a.utilCap - target) - Math.abs(b.utilCap - target))
      .slice(0, 4);
  }, [batteries, activeCenario]);

  function addLine() {
    if (!addBatId) return;
    const existing = batteryUnits.find(u => u.batteryId === addBatId);
    if (existing) {
      onUnitsChange(batteryUnits.map(u => u.batteryId === addBatId ? { ...u, qty: u.qty + 1 } : u));
    } else {
      onUnitsChange([...batteryUnits, { batteryId: addBatId, qty: 1 }]);
    }
  }

  function removeLine(idx: number) {
    onUnitsChange(batteryUnits.filter((_, i) => i !== idx));
  }

  function updateQty(idx: number, qty: number) {
    if (qty < 1) { removeLine(idx); return; }
    onUnitsChange(batteryUnits.map((u, i) => i === idx ? { ...u, qty } : u));
  }

  function applySuggestion(s: { batteryId: number; qty: number }) {
    onUnitsChange([{ batteryId: s.batteryId, qty: s.qty }]);
  }

  const fmt = (n: number) => n.toLocaleString("pt-PT");

  return (
    <div className="space-y-4">

      {/* ── Selection ────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Battery size={18} className="text-primary" /> Baterias Selecionadas
          </CardTitle>
          <CardDescription>Adicione uma ou mais baterias do catálogo para o estudo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Line items */}
          {batteryUnits.length > 0 && (
            <div className="space-y-2">
              {batteryUnits.map((unit, idx) => {
                const bat = batteries.find(b => b.id === unit.batteryId);
                if (!bat) return null;
                return (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg border">
                    <Battery size={16} className="text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{bat.fabricante} {bat.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {bat.capacidade} kWh · {bat.tensao} V · DoD {bat.profundidadeDescarga > 0 ? bat.profundidadeDescarga : 80}%
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button type="button" variant="outline" size="icon" className="h-7 w-7"
                        onClick={() => updateQty(idx, unit.qty - 1)}>–</Button>
                      <span className="w-8 text-center text-sm font-bold">{unit.qty}</span>
                      <Button type="button" variant="outline" size="icon" className="h-7 w-7"
                        onClick={() => updateQty(idx, unit.qty + 1)}>+</Button>
                    </div>
                    <div className="text-right shrink-0 min-w-[80px]">
                      <p className="text-sm font-bold">{(bat.capacidade * unit.qty).toFixed(1)} kWh</p>
                      <p className="text-[10px] text-muted-foreground">× {unit.qty} un.</p>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeLine(idx)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add line */}
          <div className="flex items-center gap-2">
            <Select value={addBatId ? String(addBatId) : ""} onValueChange={v => setAddBatId(Number(v))}>
              <SelectTrigger className="flex-1 text-sm h-9">
                <SelectValue placeholder="Selecionar modelo…" />
              </SelectTrigger>
              <SelectContent>
                {batteries.map(b => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.fabricante} {b.nome} — {b.capacidade} kWh
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" size="sm" onClick={addLine} disabled={!addBatId} className="gap-1.5 shrink-0">
              <Plus size={14} /> Adicionar
            </Button>
          </div>

          {/* System totals */}
          {sys && (
            <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-4">
              {[
                { label: "Cap. nominal", val: `${sys.totalCap.toFixed(1)} kWh` },
                { label: `Cap. útil (DoD ${sys.dodPct}%)`, val: `${sys.utilCap.toFixed(1)} kWh`, hi: true },
                { label: "Carga máx.", val: sys.potCarga > 0 ? `${sys.potCarga.toFixed(1)} kW` : "—" },
                { label: "Descarga máx.", val: sys.potDesc > 0 ? `${sys.potDesc.toFixed(1)} kW` : "—" },
              ].map(({ label, val, hi }) => (
                <div key={label} className={cn("rounded-lg p-2.5 text-center border", hi ? "bg-primary/10 border-primary/30" : "bg-muted/30 border-border")}>
                  <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
                  <p className={cn("font-bold text-sm mt-0.5", hi ? "text-primary" : "text-foreground")}>{val}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Auto-suggestions ─────────────────────────────────────────────────── */}
      {suggestions.length > 0 && batteryUnits.length === 0 && (
        <Card className="border-dashed border-primary/30">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <Lightbulb size={13} className="text-primary" /> Sugestões Automáticas
              {activeCenario?.capacidadeBateriaRecomendada && (
                <span className="font-normal normal-case tracking-normal">
                  — alvo: {activeCenario.capacidadeBateriaRecomendada.toFixed(0)} kWh úteis
                </span>
              )}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {suggestions.map((s, i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => applySuggestion(s)}
                  className={cn(
                    "flex items-center justify-between gap-3 p-3 rounded-xl border text-left transition-all hover:border-primary/50 hover:bg-primary/5",
                    s.isRec ? "border-primary/40 bg-primary/5" : "border-border"
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{s.label}</p>
                      {s.isRec && <Badge variant="outline" className="text-[10px] text-primary border-primary/40 shrink-0">Rec.</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.qty}× — {s.totalCap.toFixed(0)} kWh nom. · {s.utilCap} kWh úteis</p>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Charging study ───────────────────────────────────────────────────── */}
      {study && sys && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap size={18} className="text-amber-500" />
              Estudo de Carregamento
              <StatusChip status={study.status} />
            </CardTitle>
            <CardDescription>
              Análise da viabilidade de carregar {sys.totalCap.toFixed(1)} kWh ({sys.utilCap.toFixed(1)} kWh úteis) com o excedente solar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              {[
                {
                  label: "Excedente instant. médio/dia",
                  val: `${study.excessoMedioDiario.toFixed(1)} kWh`,
                  sub: "pico solar vs. consumo horário",
                  hi: false,
                },
                {
                  label: "Energia armazenável/dia",
                  val: `${study.energiaArmazenavel.toFixed(1)} kWh`,
                  sub: `entregue ${study.energiaEntregue.toFixed(1)} kWh/dia (η ${(ETA * 100).toFixed(0)}%)`,
                  hi: study.energiaArmazenavel >= sys.utilCap * 0.5,
                },
                {
                  label: "Carga diária média",
                  val: `${study.percCargaDiaria}%`,
                  sub: `≈${study.diasParaEncher.toFixed(1)} dias p/ encher`,
                  hi: study.percCargaDiaria >= 60,
                },
                {
                  label: "Ciclos/ano estimados",
                  val: `${study.ciclosAnuais}`,
                  sub: "simulação horária mensal",
                  hi: false,
                },
              ].map(({ label, val, sub, hi }) => (
                <div key={label} className={cn("rounded-xl p-3 text-center border", hi ? "bg-primary/10 border-primary/30" : "bg-muted/30 border-border")}>
                  <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
                  <p className={cn("font-bold text-sm mt-0.5", hi ? "text-primary" : "text-foreground")}>{val}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{sub}</p>
                </div>
              ))}
            </div>

            {/* Sizing assessment */}
            <div className={cn(
              "rounded-xl p-3 border text-sm",
              study.status === "equilibrada" ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800" :
              study.status === "sobredimensionada" ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800" :
              "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800"
            )}>
              {study.status === "equilibrada" && (
                <p className="text-emerald-800 dark:text-emerald-300">
                  <strong>Bem dimensionada.</strong> O excedente solar é suficiente para carregar a bateria em {study.diasParaEncher.toFixed(1)} dias.
                  Com {study.percCargaDiaria}% de carga diária média, o sistema é viável.
                </p>
              )}
              {study.status === "sobredimensionada" && (
                <>
                  <p className="text-amber-800 dark:text-amber-300 mb-1.5">
                    <strong>Capacidade útil: {sys.utilCap.toFixed(1)} kWh</strong> — Excedente diário médio disponível: {study.excessoMedioDiario.toFixed(1)} kWh.
                  </p>
                  <p className="text-amber-700 dark:text-amber-400 text-xs">
                    A bateria demora {study.diasParaEncher.toFixed(1)} dias a carregar totalmente. Na maioria dos dias não carregará por completo.
                    {study.recCap && <> Capacidade recomendada: <strong>{study.recCap}</strong>.</>}
                  </p>
                </>
              )}
              {study.status === "subdimensionada" && (
                <p className="text-blue-800 dark:text-blue-300">
                  <strong>Capacidade reduzida.</strong> O excedente solar ({study.excessoMedioDiario.toFixed(1)} kWh/dia) permite carregar a bateria várias vezes por dia.
                  Poderá aumentar a capacidade para absorver mais excedente.
                  {study.recCap && <> Capacidade recomendada: <strong>{study.recCap}</strong>.</>}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Battery warnings ────────────────────────────────────────────────── */}
      {study && sys && sys.utilCap > 0 && (
        <BatteryWarnings warnings={warnings} />
      )}

      {/* ── Comparison with/without battery ─────────────────────────────────── */}
      {study && sys && (
        <>
          {/* ── Análise Energética ───────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp size={18} className="text-emerald-500" />
                Análise Energética: Com vs. Sem Bateria
              </CardTitle>
              <CardDescription>Impacto da bateria no autoconsumo e na energia entregue aos consumos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {batteryChart && (
                <div className="rounded-xl border bg-background p-4 space-y-4">
                  <div>
                    <p className="font-semibold text-sm">Produção Estimada vs Consumo Mensal — Com Bateria</p>
                    <p className="text-xs text-muted-foreground">
                      Autoconsumo direto + energia entregue pela bateria + excedente restante vs. consumo
                    </p>
                  </div>

                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={batteryChart.data} margin={{ top: 10, right: 16, left: 0, bottom: 6 }}>
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(value: number, name: string) => {
                          const labels: Record<string, string> = {
                            autoconsumoDireto: "Autoconsumo direto",
                            bateria: "Bateria entregue",
                            excedenteComBat: "Excedente restante",
                            consumo: "Consumo",
                          };
                          return [`${Math.round(value).toLocaleString("pt-PT")} kWh`, labels[name] ?? name];
                        }}
                        contentStyle={{ borderRadius: 10, border: "1px solid hsl(var(--border))" }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 12 }}
                        formatter={(value) => {
                          const labels: Record<string, string> = {
                            autoconsumoDireto: "Autoconsumo direto",
                            bateria: "Bateria entregue",
                            excedenteComBat: "Excedente restante",
                            consumo: "Consumo",
                          };
                          return labels[String(value)] ?? String(value);
                        }}
                      />
                      <Bar dataKey="autoconsumoDireto" stackId="pv" fill="#22c55e" radius={[0, 0, 0, 0]} name="autoconsumoDireto" />
                      <Bar dataKey="bateria" stackId="pv" fill="#0ea5e9" radius={[0, 0, 0, 0]} name="bateria" />
                      <Bar dataKey="excedenteComBat" stackId="pv" fill="#f59e0b" radius={[4, 4, 0, 0]} name="excedenteComBat" />
                      <Line type="monotone" dataKey="consumo" stroke="hsl(var(--muted-foreground))" strokeWidth={1.7} strokeDasharray="4 2" dot={false} name="consumo" />
                    </ComposedChart>
                  </ResponsiveContainer>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                    {[
                      { label: "Produção anual", val: `${fmt(activeCenario!.energiaAnualEstimada)} kWh`, sub: "sistema FV" },
                      { label: "Autoconsumo com bateria", val: `${study.autoconsumoPercComBat}%`, sub: `${fmt(batteryChart.autoconsumoComBateria)} kWh/ano` },
                      { label: "Excedente restante", val: `${fmt(Math.round(batteryChart.excedenteComBateriaAnual))} kWh`, sub: `antes: ${fmt(activeCenario!.excessoAnual)} kWh` },
                      { label: "Usado da bateria", val: `${fmt(study.ganhoAnual)} kWh`, sub: `${fmt(Math.round(study.energiaArmazenadaAnual))} kWh carregados` },
                    ].map((kpi) => (
                      <div key={kpi.label} className="rounded-xl p-3 text-center border bg-muted/30">
                        <p className="text-[10px] text-muted-foreground leading-tight">{kpi.label}</p>
                        <p className="font-bold text-sm mt-0.5">{kpi.val}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{kpi.sub}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Comparison table — energy only */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      <th className="text-left pb-2 pr-4 font-medium">Indicador</th>
                      <th className="text-right pb-2 pr-4 font-medium">Sem bateria</th>
                      <th className="text-right pb-2 pr-4 font-medium">Com bateria</th>
                      <th className="text-right pb-2 font-medium text-emerald-600 dark:text-emerald-400">Ganho</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[
                      {
                        label: "Autoconsumo anual",
                        sem: `${fmt(activeCenario!.autoconsumoAnual)} kWh`,
                        com: `${fmt(study.autoconsumoComBat)} kWh`,
                        ganho: `+${fmt(study.ganhoAnual)} kWh`,
                      },
                      {
                        label: "Taxa de autoconsumo",
                        sem: `${study.autoconsumoPercSemBat}%`,
                        com: `${study.autoconsumoPercComBat}%`,
                        ganho: `+${study.autoconsumoPercComBat - study.autoconsumoPercSemBat} pp`,
                      },
                      {
                        label: "Energia armazenada/dia",
                        sem: "—",
                        com: `${study.energiaArmazenavel.toFixed(1)} kWh`,
                        ganho: `${study.energiaEntregue.toFixed(1)} kWh entregue`,
                      },
                      {
                        label: "Excedente disponível/dia",
                        sem: `${study.excessoMedioDiario.toFixed(1)} kWh`,
                        com: `${Math.max(0, study.excessoMedioDiario - study.energiaArmazenavel).toFixed(1)} kWh`,
                        ganho: `${fmt(activeCenario!.excessoAnual)} kWh/ano total`,
                      },
                    ].map(r => (
                      <tr key={r.label}>
                        <td className="py-2 pr-4 text-muted-foreground">{r.label}</td>
                        <td className="py-2 pr-4 text-right font-medium">{r.sem}</td>
                        <td className="py-2 pr-4 text-right font-semibold">{r.com}</td>
                        <td className="py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">{r.ganho}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* ── Análise Financeira ───────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Euro size={18} className="text-primary" />
                Análise Financeira da Bateria
              </CardTitle>
              <CardDescription>Disponível após definição do custo unitário da bateria</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Price input */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Preço unitário da bateria (€) — fornecido pelo instalador ou catálogo
                </label>
                <div className="flex items-center gap-2 max-w-xs">
                  <Input
                    type="number"
                    min={0}
                    step={100}
                    placeholder="Ex: 3500"
                    value={precoBateriaStr}
                    onChange={e => setPrecoBateriaStr(e.target.value)}
                    className="h-9 text-sm"
                  />
                  <span className="text-sm text-muted-foreground shrink-0">€</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Inclua instalação e acessórios por unidade. O investimento total é calculado pela quantidade selecionada.
                </p>
              </div>

              <Separator />

              {/* Financial KPIs — only when price is defined */}
              {precoBateriaValido && precoBateria !== null ? (() => {
                const investimentoTotal = Math.round(precoBateria * (sys?.totalUnits ?? 1));
                const ganhoMarginal = previousStudy
                  ? Math.max(0, study.ganhoAnual - previousStudy.ganhoAnual)
                  : study.ganhoAnual;
                const poupancaMarginal = Math.round(ganhoMarginal * precoKwh);
                const payback = study.poupancaAdicional > 0
                  ? Math.round(investimentoTotal / study.poupancaAdicional * 10) / 10
                  : null;
                const paybackBom = payback !== null && payback <= 12;
                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {[
                        {
                          label: "Investimento bateria",
                          val: `${fmt(investimentoTotal)} €`,
                          sub: `${fmt(Math.round(precoBateria))} € × ${sys?.totalUnits ?? 1} un.`,
                          hi: false,
                        },
                        {
                          label: "Poupança adicional/ano",
                          val: `${fmt(study.poupancaAdicional)} €`,
                          sub: `${fmt(study.ganhoAnual)} kWh × ${precoKwh} €/kWh`,
                          hi: false,
                        },
                        {
                          label: "Payback da bateria",
                          val: payback !== null && payback < 50 ? `${payback} anos` : "N/A",
                          sub: "adicional ao sistema FV",
                          hi: paybackBom,
                        },
                      ].map(({ label, val, sub, hi }) => (
                        <div key={label} className={cn("rounded-xl p-3 text-center border", hi ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-700" : "bg-muted/30 border-border")}>
                          <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
                          <p className={cn("font-bold text-sm mt-0.5", hi ? "text-emerald-700 dark:text-emerald-300" : "text-foreground")}>{val}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{sub}</p>
                        </div>
                      ))}
                    </div>

                    {previousStudy && sys && sys.totalUnits > 1 && (
                      <div className={cn(
                        "rounded-lg border p-3 text-xs",
                        ganhoMarginal > 100
                          ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-300"
                          : "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-300"
                      )}>
                        <strong>Ganho da última bateria:</strong>{" "}
                        {fmt(Math.round(ganhoMarginal))} kWh/ano ({fmt(poupancaMarginal)} €/ano).
                        {ganhoMarginal <= 100 && (
                          <> A bateria anterior já absorve quase todo o excedente útil ou o consumo noturno disponível.</>
                        )}
                      </div>
                    )}

                    {payback !== null && payback > 15 && (
                      <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                        <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          <strong>Payback elevado ({payback} anos).</strong> O retorno adicional da bateria é longo.
                          {study.status === "sobredimensionada"
                            ? " Reduza a capacidade para melhorar a rentabilidade."
                            : " Considere se o investimento é prioritário relativamente à expansão FV."}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })() : (
                <div className="flex items-start gap-3 p-4 bg-muted/40 rounded-xl border border-dashed">
                  <Euro size={18} className="text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Análise financeira disponível após definição do custo da bateria.
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Introduza o preço total acima para calcular investimento, poupança e payback.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
