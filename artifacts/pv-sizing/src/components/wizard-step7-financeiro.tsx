import { useMemo, useState, useEffect, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Euro, TrendingUp, TrendingDown, Zap, Sun,
  BarChart3, Target, Clock, Leaf, SlidersHorizontal,
  ChevronDown, ChevronUp,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
interface AutoSizeCenario {
  potenciaInstalada: number;
  numPaineis: number;
  energiaAnualEstimada: number;
  autoconsumoAnual: number;
  excessoAnual: number;
  autoconsumoPerc: number;
  investimentoEstimado: number;
  poupancaAnual: number;
  paybackAnos: number;
  capacidadeBateriaRecomendada: number | null;
}

interface Props {
  cenario:              AutoSizeCenario;
  precoKwh:             number;
  consumoAnual:         number;
  consumoDiurnoPct:     number;
  investimento?:        number;
  onInvestimentoChange: (v: number) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TAXA_DESCONTO = 0.04;
const ANOS_VIDA     = 25;

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("pt-PT", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtEur(n: number) { return `${fmt(Math.round(n))} €`; }
function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }
function calcIrr(cashflows: number[]): number {
  let low = -0.99;
  let high = 1;
  const npv = (rate: number) =>
    cashflows.reduce((sum, cf, i) => sum + cf / Math.pow(1 + rate, i), 0);
  let npvLow = npv(low);
  const npvHigh = npv(high);
  if (!Number.isFinite(npvLow) || !Number.isFinite(npvHigh) || npvLow * npvHigh > 0) return 0;

  for (let i = 0; i < 80; i++) {
    const mid = (low + high) / 2;
    const v = npv(mid);
    if (Math.abs(v) < 0.01) return mid;
    if (npvLow * v > 0) {
      low = mid;
      npvLow = v;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

// ─── Editable param field ──────────────────────────────────────────────────────
function ParamField({
  label, value, onChange, unit, min, max, step, hint,
}: {
  label: string; value: number; onChange: (v: number) => void;
  unit: string; min: number; max: number; step: number; hint?: string;
}) {
  const [raw, setRaw] = useState(String(value));

  useEffect(() => { setRaw(String(value)); }, [value]);

  function commit(s: string) {
    const n = parseFloat(s.replace(",", "."));
    if (!isNaN(n)) onChange(clamp(n, min, max));
    setRaw(String(clamp(isNaN(n) ? value : n, min, max)));
  }

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          min={min} max={max} step={step}
          value={raw}
          onChange={e => setRaw(e.target.value)}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") commit((e.target as HTMLInputElement).value); }}
          className="h-8 text-sm tabular-nums"
        />
        <span className="text-xs text-muted-foreground shrink-0 w-10">{unit}</span>
      </div>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KPI({ icon: Icon, label, value, sub, highlight = false, color = "" }: {
  icon: React.ElementType; label: string; value: string; sub?: string;
  highlight?: boolean; color?: string;
}) {
  return (
    <div className={cn(
      "flex items-start gap-3 p-4 rounded-xl border",
      highlight ? "border-primary/40 bg-primary/5" : "border-border bg-muted/20"
    )}>
      <Icon size={20} className={cn("mt-0.5 shrink-0", color || (highlight ? "text-primary" : "text-muted-foreground"))} />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-lg font-bold leading-tight", highlight && "text-primary")}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
function WizardStep7Financeiro({
  cenario, precoKwh: precoKwhProp, consumoAnual,
  investimento, onInvestimentoChange,
}: Props) {
  const {
    investimentoEstimado, poupancaAnual, autoconsumoAnual,
    excessoAnual, autoconsumoPerc, energiaAnualEstimada, potenciaInstalada,
  } = cenario;

  // ── Editable financial parameters ─────────────────────────────────────────
  const [precoKwh,      setPrecoKwh]      = useState(precoKwhProp);
  const [precoInjecao,  setPrecoInjecao]  = useState(0.06);   // €/kWh grid injection
  const [taxaEscalada,  setTaxaEscalada]  = useState(3.0);    // % annual tariff escalation
  const [taxaDegradacao,setTaxaDegradacao]= useState(0.5);    // % annual panel degradation
  const [investimentoEdit, setInvestimentoEdit] = useState<number>(
    investimento ?? investimentoEstimado
  );
  const [showParams, setShowParams] = useState(true);

  // Sync investimento when parent changes
  useEffect(() => {
    if (investimento != null) setInvestimentoEdit(investimento);
  }, [investimento]);

  // Propagate investimento changes to parent
  useEffect(() => {
    onInvestimentoChange(investimentoEdit);
  }, [investimentoEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync precoKwh from parent when it changes (e.g., first mount)
  useEffect(() => { setPrecoKwh(precoKwhProp); }, [precoKwhProp]);

  // ── Derived year-0 values ──────────────────────────────────────────────────
  // Recalculate poupança using current precoKwh (may differ from what auto-size used)
  const poupancaAnualBase  = autoconsumoAnual * precoKwh;
  const receitaExcedente   = excessoAnual * precoInjecao;
  const poupancaTotal      = poupancaAnualBase + receitaExcedente;
  const custoAtual         = consumoAnual * precoKwh;
  const custoApos          = Math.max(0, custoAtual - poupancaAnualBase);
  const reducaoFatura      = consumoAnual > 0 ? Math.round((poupancaAnualBase / custoAtual) * 100) : 0;
  const co2Anual           = Math.round(autoconsumoAnual * 0.253 / 100) / 10; // tonnes

  // ── 25-year projection ─────────────────────────────────────────────────────
  const projecao = useMemo(() => {
    const rows: { ano: number; poupanca: number; poupancaAcum: number; npvAcum: number }[] = [];
    let poupancaAcum = -investimentoEdit;
    let npvAcum      = -investimentoEdit;
    const d = taxaDegradacao / 100;
    const e = taxaEscalada  / 100;
    for (let ano = 1; ano <= ANOS_VIDA; ano++) {
      const degradFactor = Math.pow(1 - d, ano - 1);
      const escalFactor  = Math.pow(1 + e, ano - 1);
      const poupAno      = poupancaAnualBase * degradFactor * escalFactor;
      const recAno       = receitaExcedente  * degradFactor * escalFactor;
      const fluxo        = poupAno + recAno;
      poupancaAcum      += fluxo;
      npvAcum           += fluxo / Math.pow(1 + TAXA_DESCONTO, ano);
      rows.push({ ano, poupanca: Math.round(fluxo), poupancaAcum: Math.round(poupancaAcum), npvAcum: Math.round(npvAcum) });
    }
    return rows;
  }, [investimentoEdit, poupancaAnualBase, receitaExcedente, taxaDegradacao, taxaEscalada]);

  const p10       = projecao.find(r => r.ano === 10)?.poupancaAcum ?? 0;
  const p15       = projecao.find(r => r.ano === 15)?.poupancaAcum ?? 0;
  const p25       = projecao[ANOS_VIDA - 1]?.poupancaAcum ?? 0;
  const npv25     = projecao[ANOS_VIDA - 1]?.npvAcum ?? 0;
  const paybackReal = (projecao.findIndex(r => r.poupancaAcum >= 0) + 1) || 0;
  const irr = calcIrr([-investimentoEdit, ...projecao.map(r => r.poupanca)]);

  return (
    <div className="space-y-4">

      {/* ── Editable parameters ──────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <button
            className="flex items-center justify-between w-full text-left"
            onClick={() => setShowParams(p => !p)}
          >
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <SlidersHorizontal size={16} className="text-primary" />
                Parâmetros do Estudo
              </CardTitle>
              <CardDescription className="mt-0.5">
                Ajuste os valores para recalcular o estudo em tempo real
              </CardDescription>
            </div>
            {showParams ? <ChevronUp size={16} className="text-muted-foreground shrink-0" /> : <ChevronDown size={16} className="text-muted-foreground shrink-0" />}
          </button>
        </CardHeader>
        {showParams && (
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <ParamField
                label="Investimento Total"
                value={investimentoEdit}
                onChange={v => { setInvestimentoEdit(v); onInvestimentoChange(v); }}
                unit="€"
                min={100} max={500000} step={100}
                hint="Valor real do orçamento"
              />
              <ParamField
                label="Preço da Energia"
                value={precoKwh}
                onChange={setPrecoKwh}
                unit="€/kWh"
                min={0.01} max={1} step={0.001}
                hint="Tarifa média ponderada"
              />
              <ParamField
                label="Preço Venda Excedente"
                value={precoInjecao}
                onChange={setPrecoInjecao}
                unit="€/kWh"
                min={0} max={0.5} step={0.001}
                hint="SERUP/OMIE referência"
              />
              <ParamField
                label="Inflação Energética"
                value={taxaEscalada}
                onChange={setTaxaEscalada}
                unit="%/ano"
                min={0} max={15} step={0.5}
                hint="Escalada tarifária anual"
              />
              <ParamField
                label="Degradação dos Painéis"
                value={taxaDegradacao}
                onChange={setTaxaDegradacao}
                unit="%/ano"
                min={0} max={5} step={0.1}
                hint="Perda de eficiência/ano"
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-3">
              Taxa de desconto (NPV): {(TAXA_DESCONTO * 100).toFixed(0)}% · Período de análise: {ANOS_VIDA} anos · Valores estimados — não constituem aconselhamento financeiro.
            </p>
          </CardContent>
        )}
      </Card>

      {/* ── Main KPIs ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-muted/20">
          <Euro size={20} className="mt-0.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Investimento Total</p>
            <p className="text-lg font-bold leading-tight">{fmtEur(investimentoEdit)}</p>
            <p className="text-xs text-muted-foreground">{potenciaInstalada} kWp</p>
          </div>
        </div>
        <KPI icon={TrendingUp} label="Poupança anual (ano 1)"  value={fmtEur(poupancaTotal)}              sub="energia + injeção"            highlight />
        <KPI icon={Clock}      label="Payback simples"          value={paybackReal > 0 ? `${paybackReal} anos` : `> ${ANOS_VIDA} anos`} sub="com inflação energética" highlight />
        <KPI icon={BarChart3}  label="Poupança a 25 anos"       value={fmtEur(p25)}                        sub="valor nominal acumulado" />
      </div>

      {/* ── Energy & self-consumption detail ─────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sun size={18} /> Produção, Autoconsumo e Poupança
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KPI icon={Sun}        label="Produção anual estimada"  value={`${fmt(energiaAnualEstimada)} kWh`}   sub="PVGIS/método HSP" />
            <KPI icon={Zap}        label="Autoconsumo estimado"     value={`${fmt(autoconsumoAnual)} kWh`}        sub={`${autoconsumoPerc}% da produção`}  highlight />
            <KPI icon={TrendingUp} label="Excedente injetado"       value={`${fmt(excessoAnual)} kWh`}            sub={`${fmt(precoInjecao * 100, 1)} c€/kWh`} />
            <KPI icon={Euro}       label="Poupança energética"      value={fmtEur(poupancaAnualBase)}              sub="autoconsumo × preço kWh"            highlight />
            <KPI icon={Euro}       label="Receita com excedente"    value={fmtEur(receitaExcedente)}               sub="injeção na rede" />
            <KPI icon={Leaf}       label="CO₂ evitado"              value={`${co2Anual} t CO₂/ano`}               sub="253 g/kWh (rede PT)"                color="text-green-600" />
          </div>
        </CardContent>
      </Card>

      {/* ── Before / After ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap size={18} /> Fatura Elétrica — Antes e Depois
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
            <div className="text-center p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Custo atual/ano</p>
              <p className="text-2xl font-bold text-red-700 dark:text-red-400">{fmtEur(custoAtual)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {fmt(consumoAnual)} kWh × {fmt(precoKwh * 100, 2)} c€/kWh
              </p>
            </div>
            <div className="flex flex-col items-center gap-1">
              <TrendingDown size={28} className="text-primary" />
              <span className="text-2xl font-bold text-primary">−{reducaoFatura}%</span>
              <p className="text-xs text-muted-foreground text-center">redução estimada da fatura</p>
            </div>
            <div className="text-center p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Custo após solar/ano</p>
              <p className="text-2xl font-bold text-green-700 dark:text-green-400">{fmtEur(custoApos)}</p>
              <p className="text-xs text-muted-foreground mt-1">energia residual da rede</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 25-year chart + milestones ────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 size={18} /> Poupança Acumulada a 25 Anos
          </CardTitle>
          <CardDescription>
            Com {taxaEscalada}%/ano de inflação energética e {taxaDegradacao}%/ano de degradação
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={projecao} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="gradAcum" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="ano" tick={{ fontSize: 11 }} tickFormatter={v => `${v}a`} interval={4} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k€`} width={48} />
                <Tooltip
                  formatter={(v: number) => [`${fmt(v)} €`, ""]}
                  labelFormatter={l => `Ano ${l}`}
                />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                <Area
                  type="monotone" dataKey="poupancaAcum" name="Poupança Acumulada"
                  stroke="hsl(var(--primary))" fill="url(#gradAcum)" strokeWidth={2} dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Milestone summary */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: "Poupança a 10 anos", value: p10 },
              { label: "Poupança a 15 anos", value: p15 },
              { label: "Poupança a 25 anos", value: p25, highlight: true },
            ].map(({ label, value, highlight }) => (
              <div key={label} className={cn(
                "text-center p-3 rounded-lg",
                highlight ? "bg-primary/10 border border-primary/30" : "bg-muted/30"
              )}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={cn(
                  "text-base font-bold mt-0.5",
                  highlight ? "text-primary" : value >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600"
                )}>{fmtEur(value)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Financial metrics ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target size={18} /> Rentabilidade do Investimento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="p-3 bg-muted/30 rounded-lg text-center">
              <p className="text-xs text-muted-foreground">Payback simples</p>
              <p className="text-lg font-bold">
                {paybackReal > 0 ? `${paybackReal} anos` : `> ${ANOS_VIDA} anos`}
              </p>
            </div>
            <div className="p-3 bg-muted/30 rounded-lg text-center">
              <p className="text-xs text-muted-foreground">VAL / NPV a 25 anos</p>
              <p className={cn("text-lg font-bold", npv25 >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600")}>
                {fmtEur(npv25)}
              </p>
            </div>
            <div className="p-3 bg-muted/30 rounded-lg text-center">
              <p className="text-xs text-muted-foreground">TIR estimada</p>
              <p className="text-lg font-bold">{(irr * 100).toFixed(1)}%</p>
            </div>
            <div className="p-3 bg-muted/30 rounded-lg text-center">
              <p className="text-xs text-muted-foreground">Redução da fatura</p>
              <p className="text-lg font-bold text-primary">−{reducaoFatura}%</p>
            </div>
          </div>

          <Separator />

          {/* Year-by-year table (first 10 years) */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Detalhe anual (primeiros 10 anos)
            </p>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Ano</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Poupança</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Acumulado</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell">VAL acum.</th>
                  </tr>
                </thead>
                <tbody>
                  {projecao.slice(0, 10).map(row => (
                    <tr key={row.ano} className={cn(
                      "border-b last:border-0",
                      row.poupancaAcum >= 0 && projecao[row.ano - 2]?.poupancaAcum < 0 && "bg-green-50/60 dark:bg-green-950/20"
                    )}>
                      <td className="px-3 py-1.5 font-medium">Ano {row.ano}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-green-600 dark:text-green-400">+{fmt(row.poupanca)} €</td>
                      <td className={cn(
                        "px-3 py-1.5 text-right font-mono font-semibold",
                        row.poupancaAcum >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                      )}>
                        {row.poupancaAcum >= 0 ? "+" : ""}{fmt(row.poupancaAcum)} €
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-muted-foreground hidden sm:table-cell">
                        {row.npvAcum >= 0 ? "+" : ""}{fmt(row.npvAcum)} €
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
export default memo(WizardStep7Financeiro);
