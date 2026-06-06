import { useState } from "react";
import { useParams } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useGetSystem,
  useGetCustomer,
  useGetPanel,
  useGetInverter,
  useGetBattery,
  useCheckSystemCompatibility,
  useGetSystemPvgis,
  useCalculateFinancial,
  getGetSystemQueryKey,
  getCheckSystemCompatibilityQueryKey,
  getGetSystemPvgisQueryKey,
  getGetCustomerQueryKey,
  getGetPanelQueryKey,
  getGetInverterQueryKey,
  getGetBatteryQueryKey,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, AlertTriangle, CheckCircle, Calculator, Euro, Zap, Activity,
  Leaf, TrendingUp, ArrowDownToLine, ArrowUpFromLine, Sun, BatteryFull
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";

const TARIFF_LABELS: Record<string, string> = {
  simples: "Simples",
  "bi-horaria": "Bi-Horária",
  "tri-horaria": "Tri-Horária",
  "tetra-horaria": "Tetra-Horária",
};

const financialSchema = z.object({
  custoSistema: z.coerce.number().min(0, "Custo obrigatório"),
  tipoTarifa: z.enum(["simples", "bi-horaria", "tri-horaria", "tetra-horaria"]),
  consumoDiario: z.coerce.number().min(0.1, "Consumo obrigatório"),
  percHorasSol: z.coerce.number().min(0).max(100),
  precoSimples: z.coerce.number().min(0),
  precoForaVazio: z.coerce.number().optional(),
  precoVazio: z.coerce.number().optional(),
  precoCheia: z.coerce.number().optional(),
  precoPonta: z.coerce.number().optional(),
  precoSuperVazio: z.coerce.number().optional(),
  precoVendaExcedente: z.coerce.number().min(0),
  capacidadeBateria: z.coerce.number().min(0).optional(),
  escaladaEnergia: z.coerce.number().min(0).max(10).optional(),
  vidaUtil: z.coerce.number().min(5).max(30).optional(),
});

type FinancialFormValues = z.infer<typeof financialSchema>;

function StatCard({ label, value, unit, icon: Icon, color = "primary" }: {
  label: string;
  value: string;
  unit?: string;
  icon: React.ElementType;
  color?: string;
}) {
  const colorMap: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-100 text-emerald-600",
    blue: "bg-blue-100 text-blue-600",
    amber: "bg-amber-100 text-amber-600",
    green: "bg-green-100 text-green-600",
  };
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`h-11 w-11 rounded-full flex items-center justify-center shrink-0 ${colorMap[color] ?? colorMap.primary}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-xl font-bold leading-tight">
            {value}
            {unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SystemDetail() {
  const { id } = useParams<{ id: string }>();
  const systemId = parseInt(id || "0", 10);
  const { toast } = useToast();

  const { data: system, isLoading: loadingSystem } = useGetSystem(systemId, {
    query: { enabled: !!systemId, queryKey: getGetSystemQueryKey(systemId) }
  });
  const { data: customer } = useGetCustomer(system?.customerId || 0, {
    query: { enabled: !!system?.customerId, queryKey: getGetCustomerQueryKey(system?.customerId || 0) }
  });
  const { data: panel } = useGetPanel(system?.panelId || 0, {
    query: { enabled: !!system?.panelId, queryKey: getGetPanelQueryKey(system?.panelId || 0) }
  });
  const { data: inverter } = useGetInverter(system?.inverterId || 0, {
    query: { enabled: !!system?.inverterId, queryKey: getGetInverterQueryKey(system?.inverterId || 0) }
  });
  const { data: battery } = useGetBattery(system?.batteryId || 0, {
    query: { enabled: !!system?.batteryId, queryKey: getGetBatteryQueryKey(system?.batteryId || 0) }
  });
  const { data: compatibility, isLoading: loadingCompat } = useCheckSystemCompatibility(
    systemId,
    { query: { enabled: !!systemId, queryKey: getCheckSystemCompatibilityQueryKey(systemId) } }
  );
  const { data: pvgis, isLoading: loadingPvgis } = useGetSystemPvgis(systemId, undefined, {
    query: { enabled: !!systemId, queryKey: getGetSystemPvgisQueryKey(systemId) }
  });

  const calcFinancial = useCalculateFinancial();

  const defaultPreco = Number(customer?.precoEletricidade ?? 0.18);

  const form = useForm<FinancialFormValues>({
    resolver: zodResolver(financialSchema),
    defaultValues: {
      custoSistema: 6000,
      tipoTarifa: "simples",
      consumoDiario: 10,
      percHorasSol: 55,
      precoSimples: defaultPreco || 0.18,
      precoForaVazio: 0.20,
      precoVazio: 0.10,
      precoCheia: 0.18,
      precoPonta: 0.22,
      precoSuperVazio: 0.08,
      precoVendaExcedente: 0.05,
      capacidadeBateria: 0,
      escaladaEnergia: 2,
      vidaUtil: 25,
    },
  });

  const watchedTarifa = form.watch("tipoTarifa");

  const onCalculateFinancials = (data: FinancialFormValues) => {
    calcFinancial.mutate(
      { id: systemId, data },
      { onSuccess: () => toast({ title: "Análise financeira atualizada com sucesso" }) }
    );
  };

  const fin = calcFinancial.data;

  if (loadingSystem || !system) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const totalPowerkW = ((panel?.potencia || 0) * system.numPaineis / 1000).toFixed(2);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Sistema #{system.id}</h1>
            {compatibility?.estado === "Válido" ? (
              <Badge className="bg-emerald-500 hover:bg-emerald-600">Válido</Badge>
            ) : compatibility?.estado === "Inválido" ? (
              <Badge variant="destructive">Inválido</Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground mt-1">
            {customer?.nome || "A carregar..."} · {totalPowerkW} kWp
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-1 sm:grid-cols-3">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="production">Produção PVGIS</TabsTrigger>
          <TabsTrigger value="financial">Análise Financeira</TabsTrigger>
        </TabsList>

        {/* ── VISÃO GERAL ── */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-lg">Equipamentos</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: "Módulos PV", name: `${panel?.fabricante} ${panel?.nome}`, sub: `${system.numPaineis}× ${panel?.potencia}Wp` },
                  { label: "Inversor", name: `${inverter?.fabricante} ${inverter?.nome}`, sub: `${inverter?.potenciaAc}W AC` },
                  {
                    label: "Bateria",
                    name: battery ? `${battery.fabricante} ${battery.nome}` : "Sem bateria associada",
                    sub: battery ? `${battery.capacidade} kWh` : undefined,
                  },
                ].map((item, i, arr) => (
                  <div key={i} className={`flex items-start justify-between ${i < arr.length - 1 ? "border-b pb-4" : "pb-1"}`}>
                    <div>
                      <p className="text-sm text-muted-foreground">{item.label}</p>
                      <p className="font-medium">{item.name}</p>
                      {item.sub && <p className="text-xs text-muted-foreground">{item.sub}</p>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg">Validação Elétrica</CardTitle></CardHeader>
              <CardContent>
                {loadingCompat ? (
                  <Skeleton className="h-32 w-full" />
                ) : compatibility ? (
                  <div className="space-y-4">
                    {compatibility.estado === "Válido" ? (
                      <Alert className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
                        <CheckCircle className="h-4 w-4 stroke-emerald-600" />
                        <AlertTitle>Sistema Válido</AlertTitle>
                        <AlertDescription className="text-emerald-700/80 text-xs">
                          Tensão, corrente e potência dentro dos limites do inversor.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Sistema Inválido</AlertTitle>
                        <AlertDescription>A configuração excede os limites operativos.</AlertDescription>
                      </Alert>
                    )}
                    {compatibility.erros && compatibility.erros.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-destructive mb-1">Problemas:</p>
                        <ul className="text-xs text-destructive space-y-1 list-disc pl-4">
                          {compatibility.erros.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── PRODUÇÃO PVGIS ── */}
        <TabsContent value="production" className="mt-6 space-y-6">
          {loadingPvgis ? (
            <Skeleton className="h-[400px] w-full" />
          ) : pvgis ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <StatCard label="Produção Anual Estimada" value={pvgis.producaoAnual.toFixed(0)} unit="kWh" icon={Zap} color="primary" />
                <StatCard label="Produção Específica" value={pvgis.producaoEspecifica.toFixed(0)} unit="kWh/kWp" icon={Activity} color="amber" />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>Produção Mensal</CardTitle>
                  <CardDescription>Estimativa PVGIS-SARAH2 baseada nas coordenadas do cliente</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[360px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={pvgis.producaoMensal} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="nomeMes" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => `${v}`} />
                        <RechartsTooltip formatter={(v: number) => [`${v.toFixed(1)} kWh`, "Produção"]} cursor={{ fill: "hsl(var(--muted)/0.4)" }} contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                        <Bar dataKey="producao" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={48} name="Produção (kWh)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Erro PVGIS</AlertTitle>
              <AlertDescription>Não foi possível obter dados da API PVGIS.</AlertDescription>
            </Alert>
          )}
        </TabsContent>

        {/* ── ANÁLISE FINANCEIRA ── */}
        <TabsContent value="financial" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Form — col 1-2 */}
            <Card className="lg:col-span-2 h-fit">
              <CardHeader>
                <CardTitle className="text-lg">Parâmetros Financeiros</CardTitle>
                <CardDescription>Configure o cenário para calcular o retorno em 25 anos.</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onCalculateFinancials)} className="space-y-4">

                    <FormField control={form.control} name="custoSistema" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Custo Total do Sistema (€)</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <FormField control={form.control} name="consumoDiario" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Consumo Diário (kWh)</FormLabel>
                          <FormControl><Input type="number" step="0.1" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="percHorasSol" render={({ field }) => (
                        <FormItem>
                          <FormLabel>% Consumo Solar</FormLabel>
                          <FormControl><Input type="number" min="0" max="100" {...field} /></FormControl>
                          <p className="text-xs text-muted-foreground">% do consumo de dia</p>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    {/* Tariff type */}
                    <FormField control={form.control} name="tipoTarifa" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de Tarifa</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecionar tarifa..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(TARIFF_LABELS).map(([value, label]) => (
                              <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />

                    {/* Tariff prices */}
                    <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Preços da Tarifa (€/kWh)</p>
                      {watchedTarifa === "simples" && (
                        <FormField control={form.control} name="precoSimples" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Preço Único</FormLabel>
                            <FormControl><Input type="number" step="0.001" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      )}
                      {watchedTarifa === "bi-horaria" && (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <FormField control={form.control} name="precoForaVazio" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Fora de Vazio</FormLabel>
                              <FormControl><Input type="number" step="0.001" {...field} /></FormControl>
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="precoVazio" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Vazio</FormLabel>
                              <FormControl><Input type="number" step="0.001" {...field} /></FormControl>
                            </FormItem>
                          )} />
                        </div>
                      )}
                      {(watchedTarifa === "tri-horaria" || watchedTarifa === "tetra-horaria") && (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <FormField control={form.control} name="precoPonta" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Ponta</FormLabel>
                              <FormControl><Input type="number" step="0.001" {...field} /></FormControl>
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="precoCheia" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Cheia</FormLabel>
                              <FormControl><Input type="number" step="0.001" {...field} /></FormControl>
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="precoVazio" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Vazio</FormLabel>
                              <FormControl><Input type="number" step="0.001" {...field} /></FormControl>
                            </FormItem>
                          )} />
                          {watchedTarifa === "tetra-horaria" && (
                            <FormField control={form.control} name="precoSuperVazio" render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">Super Vazio</FormLabel>
                                <FormControl><Input type="number" step="0.001" {...field} /></FormControl>
                              </FormItem>
                            )} />
                          )}
                        </div>
                      )}
                    </div>

                    <FormField control={form.control} name="precoVendaExcedente" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Venda de Excedente (€/kWh)</FormLabel>
                        <FormControl><Input type="number" step="0.001" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="capacidadeBateria" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Capacidade Bateria (kWh)</FormLabel>
                        <FormControl><Input type="number" step="0.1" min="0" {...field} /></FormControl>
                        <p className="text-xs text-muted-foreground">0 = sem bateria</p>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <FormField control={form.control} name="escaladaEnergia" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Escalada Anual (%)</FormLabel>
                          <FormControl><Input type="number" step="0.1" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="vidaUtil" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vida Útil (anos)</FormLabel>
                          <FormControl><Input type="number" min="5" max="30" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    <Button type="submit" className="w-full" disabled={calcFinancial.isPending}>
                      <Calculator className="mr-2 h-4 w-4" />
                      {calcFinancial.isPending ? "A calcular..." : "Calcular Análise Completa"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            {/* Results — col 3-5 */}
            <div className="lg:col-span-3 space-y-5">
              {fin ? (
                <>
                  {/* KPI Grid */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <Card className="sm:col-span-2 xl:col-span-3 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                      <CardContent className="p-5 flex items-center justify-between gap-4 flex-wrap">
                        <div className="text-center flex-1">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Payback</p>
                          <p className="text-4xl font-black text-primary">{fin.payback.toFixed(1)}<span className="text-lg font-medium text-muted-foreground ml-1">anos</span></p>
                        </div>
                        <div className="text-center flex-1">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">TIR (IRR)</p>
                          <p className="text-4xl font-black text-emerald-600">{fin.tir.toFixed(1)}<span className="text-lg font-medium text-muted-foreground ml-1">%</span></p>
                        </div>
                        <div className="text-center flex-1">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lucro 25 Anos</p>
                          <p className="text-3xl font-black text-blue-600">{fin.lucroTotal.toFixed(0)}<span className="text-base font-medium text-muted-foreground ml-1">€</span></p>
                        </div>
                      </CardContent>
                    </Card>

                    <StatCard label="Poupança Anual" value={fin.poupancaAnual.toFixed(0)} unit="€/ano" icon={ArrowDownToLine} color="emerald" />
                    <StatCard label="Receita Excedente" value={fin.receitaExcedente.toFixed(0)} unit="€/ano" icon={ArrowUpFromLine} color="blue" />
                    <StatCard label="Benefício Total" value={fin.beneficioTotal.toFixed(0)} unit="€/ano" icon={Euro} color="amber" />
                    <StatCard label="Autoconsumo" value={fin.taxaAutoconsumo.toFixed(1)} unit="%" icon={Sun} color="amber" />
                    <StatCard label="Cobertura Consumo" value={fin.taxaCobertura.toFixed(1)} unit="%" icon={BatteryFull} color="green" />
                    <StatCard label="CO₂ Evitado" value={(fin.emissoesCO2Evitadas / 1000).toFixed(2)} unit="t/ano" icon={Leaf} color="green" />
                  </div>

                  {/* Cash Flow Chart */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        Cash Flow Acumulado — {fin.cashFlowAnual?.length ?? 0} Anos
                      </CardTitle>
                      <CardDescription>
                        A linha cruza zero no ano {fin.payback.toFixed(1)} (payback). TIR = {fin.tir.toFixed(2)}%
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={fin.cashFlowAnual ?? []} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis dataKey="ano" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} label={{ value: "Ano", position: "insideBottomRight", offset: -5, fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k€`} />
                            <RechartsTooltip
                              formatter={(v: number, name: string) => [`${v.toFixed(2)} €`, name === "cashFlowAcumulado" ? "Cash Flow Acumulado" : "Benefício Anual"]}
                              contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                            />
                            <Legend formatter={(v) => v === "cashFlowAcumulado" ? "Acumulado (€)" : "Benefício Anual (€)"} wrapperStyle={{ fontSize: 12 }} />
                            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                            <Line type="monotone" dataKey="cashFlowAcumulado" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} name="cashFlowAcumulado" />
                            <Line type="monotone" dataKey="beneficio" stroke="hsl(142 76% 36%)" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="beneficio" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Annual table (last 5 years) */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Tabela de Cash Flow Anual</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-xs text-muted-foreground">
                              <th className="text-left py-2 px-2">Ano</th>
                              <th className="text-right py-2 px-2">Poupança</th>
                              <th className="text-right py-2 px-2">Excedente</th>
                              <th className="text-right py-2 px-2">Benefício</th>
                              <th className="text-right py-2 px-2">Acumulado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fin.cashFlowAnual?.map((row) => (
                              <tr key={row.ano} className={`border-b last:border-0 hover:bg-muted/30 ${row.cashFlowAcumulado >= 0 && (fin.cashFlowAnual?.[row.ano - 2]?.cashFlowAcumulado ?? -1) < 0 ? "bg-emerald-50" : ""}`}>
                                <td className="py-1.5 px-2 font-medium">{row.ano}</td>
                                <td className="py-1.5 px-2 text-right text-emerald-600">{row.poupanca.toFixed(0)} €</td>
                                <td className="py-1.5 px-2 text-right text-blue-600">{row.receitaExcedente.toFixed(0)} €</td>
                                <td className="py-1.5 px-2 text-right font-medium">{row.beneficio.toFixed(0)} €</td>
                                <td className={`py-1.5 px-2 text-right font-bold ${row.cashFlowAcumulado >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                  {row.cashFlowAcumulado.toFixed(0)} €
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 border border-dashed rounded-lg bg-muted/20">
                  <Calculator className="h-14 w-14 text-muted-foreground/20 mb-4" />
                  <h3 className="text-lg font-medium mb-2">Análise Financeira Completa</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Configure os parâmetros ao lado e clique em calcular para visualizar o ROI em 25 anos, TIR, payback e cash flow acumulado.
                  </p>
                  <div className="mt-6 grid grid-cols-1 gap-2 text-xs text-muted-foreground text-left max-w-xs">
                    {["Cash flow acumulado em 25 anos", "TIR (Taxa Interna de Retorno)", "Análise por tipo de tarifa elétrica", "CO₂ evitado e equivalente em árvores", "Tabela anual com poupanças e receitas"].map((f) => (
                      <div key={f} className="flex items-start gap-2">
                        <CheckCircle size={12} className="text-emerald-500 mt-0.5 shrink-0" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
