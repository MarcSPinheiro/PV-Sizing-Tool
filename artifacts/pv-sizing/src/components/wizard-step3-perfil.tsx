import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sun, Moon, Battery, TrendingUp, Target, Zap } from "lucide-react";
import type { ConsumoData } from "@/components/wizard-step1";
import { cn } from "@/lib/utils";

interface Props {
  consumoData:         ConsumoData;
  onConsumoChange:     (d: ConsumoData) => void;
  consumoDiurnoPct:    number;
  onDiurnoChange:      (v: number) => void;
}

type Objetivo = "autoconsumo" | "poupanca" | "independencia";

const OBJETIVOS: { id: Objetivo; label: string; desc: string; icon: React.ElementType }[] = [
  { id: "autoconsumo",    label: "Maximizar Autoconsumo",    desc: "Dimensionar para consumir o máximo do que produz, minimizando excedentes.", icon: Sun },
  { id: "poupanca",       label: "Maximizar Poupança",       desc: "Equilibrar produção e consumo para o melhor retorno financeiro (recomendado).", icon: Target },
  { id: "independencia",  label: "Maximizar Independência",  desc: "Reduzir ao máximo a dependência da rede elétrica, com bateria.", icon: Battery },
];

export default function WizardStep3Perfil({ consumoData, onConsumoChange, consumoDiurnoPct, onDiurnoChange }: Props) {
  const noturno = 100 - consumoDiurnoPct;
  const objetivo: Objetivo = consumoData.incluirBateria
    ? "independencia"
    : consumoData.coberturaMeta >= 90
    ? "autoconsumo"
    : "poupanca";

  const setObjetivo = (o: Objetivo) => {
    if (o === "independencia") {
      onConsumoChange({ ...consumoData, incluirBateria: true, coberturaMeta: 100 });
    } else if (o === "autoconsumo") {
      onConsumoChange({ ...consumoData, incluirBateria: false, coberturaMeta: 100 });
    } else {
      onConsumoChange({ ...consumoData, incluirBateria: false, coberturaMeta: 80 });
    }
  };

  return (
    <div className="space-y-4">
      {/* Consumption summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Zap size={20} /> Resumo de Consumo</CardTitle>
          <CardDescription>Dados recolhidos no passo anterior.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: "Consumo anual",   val: `${consumoData.consumoAnual.toLocaleString("pt-PT")} kWh` },
              { label: "Preço médio",     val: `${consumoData.precoKwh?.toFixed(3) ?? "0,180"} €/kWh` },
              { label: "Custo anual est.", val: `${Math.round(consumoData.consumoAnual * (consumoData.precoKwh ?? 0.18)).toLocaleString("pt-PT")} €` },
              consumoData.percVazio ? { label: "Vazio",  val: `${consumoData.percVazio}%`  } : null,
              consumoData.percCheio ? { label: "Cheio",  val: `${consumoData.percCheio}%`  } : null,
              consumoData.percPonta ? { label: "Ponta",  val: `${consumoData.percPonta}%`  } : null,
            ].filter(Boolean).map(item => (
              <div key={item!.label} className="bg-muted/40 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">{item!.label}</p>
                <p className="text-sm font-semibold mt-0.5">{item!.val}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Diurno vs noturno */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sun size={20} /> Perfil Diário de Consumo</CardTitle>
          <CardDescription>
            Que percentagem do seu consumo ocorre durante o dia (período solar, ~8h–20h)?
            Afeta o dimensionamento da bateria e a percentagem de autoconsumo real.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            <Sun size={18} className="text-amber-500 shrink-0" />
            <div className="flex-1">
              <Slider
                value={[consumoDiurnoPct]}
                onValueChange={([v]) => onDiurnoChange(v)}
                min={20} max={90} step={5}
              />
            </div>
            <Moon size={18} className="text-blue-500 shrink-0" />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <Sun size={20} className="text-amber-500" />
              <div>
                <p className="text-xs text-muted-foreground">Consumo diurno</p>
                <p className="text-lg font-bold text-amber-700 dark:text-amber-400">{consumoDiurnoPct}%</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <Moon size={20} className="text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">Consumo noturno</p>
                <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{noturno}%</p>
              </div>
            </div>
          </div>

          {consumoDiurnoPct < 40 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 rounded-lg text-sm text-amber-800 dark:text-amber-300">
              <Battery size={16} className="shrink-0 mt-0.5" />
              <span>Com maioria do consumo à noite, uma bateria aumenta significativamente o autoconsumo real.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Objetivo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Target size={20} /> Objetivo do Sistema</CardTitle>
          <CardDescription>O objetivo define a estratégia de dimensionamento.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {OBJETIVOS.map(o => {
            const Icon = o.icon;
            const active = objetivo === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setObjetivo(o.id)}
                className={cn(
                  "w-full flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all",
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40"
                )}
              >
                <Icon size={20} className={active ? "text-primary mt-0.5" : "text-muted-foreground mt-0.5"} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("font-medium text-sm", active && "text-primary")}>{o.label}</span>
                    {active && <Badge variant="default" className="text-xs">Selecionado</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{o.desc}</p>
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {/* Cobertura e crescimento */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><TrendingUp size={20} /> Parâmetros de Dimensionamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium">Meta de Cobertura Solar</label>
              <span className="text-sm font-bold text-primary">{consumoData.coberturaMeta}%</span>
            </div>
            <Slider
              value={[consumoData.coberturaMeta]}
              onValueChange={([v]) => onConsumoChange({ ...consumoData, coberturaMeta: v })}
              min={50} max={120} step={5}
            />
            <p className="text-xs text-muted-foreground">
              Percentagem do consumo anual a cobrir com produção solar. Acima de 100% haverá excedente para injeção na rede.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium">Crescimento de Consumo Futuro</label>
              <span className="text-sm font-bold">{consumoData.crescimentoFuturo}%</span>
            </div>
            <Slider
              value={[consumoData.crescimentoFuturo]}
              onValueChange={([v]) => onConsumoChange({ ...consumoData, crescimentoFuturo: v })}
              min={0} max={50} step={5}
            />
            <p className="text-xs text-muted-foreground">
              Aumento esperado do consumo (VE, ar condicionado, etc.) para sobre-dimensionar o sistema.
            </p>
          </div>

          {consumoData.incluirBateria && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Autonomia de Bateria (horas)</label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={1} max={48} step={1}
                  value={consumoData.horasAutonomia}
                  onChange={e => onConsumoChange({ ...consumoData, horasAutonomia: Number(e.target.value) })}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">horas de consumo médio</span>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Incluir Bateria</p>
              <p className="text-xs text-muted-foreground">Armazenamento para consumo noturno ou backup</p>
            </div>
            <Switch
              checked={consumoData.incluirBateria}
              onCheckedChange={v => onConsumoChange({ ...consumoData, incluirBateria: v })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
