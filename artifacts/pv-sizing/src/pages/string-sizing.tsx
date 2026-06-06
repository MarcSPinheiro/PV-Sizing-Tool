import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCalculateStringSizing, useListPanels, useListInverters } from "@workspace/api-client-react";

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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Calculator, CheckCircle, AlertTriangle, XCircle, Zap } from "lucide-react";

const schema = z.object({
  tipoModulo: z.string().optional(),
  voc: z.coerce.number().min(1, "Obrigatório"),
  vmp: z.coerce.number().min(1, "Obrigatório"),
  isc: z.coerce.number().min(0.1, "Obrigatório"),
  imp: z.coerce.number().min(0.1, "Obrigatório"),
  coefTensao: z.coerce.number(),
  coefCorrente: z.coerce.number(),
  noct: z.coerce.number().default(45),
  tipoInversor: z.string().optional(),
  vmpptMin: z.coerce.number().min(1, "Obrigatório"),
  vmpptMax: z.coerce.number().min(1, "Obrigatório"),
  vdcMax: z.coerce.number().min(1, "Obrigatório"),
  impptMax: z.coerce.number().min(0.1, "Obrigatório"),
  ipviscMax: z.coerce.number().min(0.1, "Obrigatório"),
  irradiancia: z.coerce.number().default(1000),
  ganhosBifacial: z.coerce.number().default(0),
});

type FormValues = z.infer<typeof schema>;

const ESTADO_CONFIG = {
  OK: { label: "OK", color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: CheckCircle, iconColor: "text-emerald-600" },
  CLIPPING: { label: "Clipping", color: "bg-amber-100 text-amber-800 border-amber-200", icon: AlertTriangle, iconColor: "text-amber-600" },
  ERRO_TENSAO: { label: "Erro Tensão", color: "bg-red-100 text-red-800 border-red-200", icon: XCircle, iconColor: "text-red-600" },
  ERRO_CORRENTE: { label: "Erro Corrente", color: "bg-red-100 text-red-800 border-red-200", icon: XCircle, iconColor: "text-red-600" },
};

export default function StringSizing() {
  const { data: panels } = useListPanels();
  const { data: inverters } = useListInverters();
  const calcString = useCalculateStringSizing();
  const [selectedPanelId, setSelectedPanelId] = useState<string>("");
  const [selectedInverterId, setSelectedInverterId] = useState<string>("");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      noct: 45,
      irradiancia: 1000,
      ganhosBifacial: 0,
    },
  });

  const handlePanelSelect = (id: string) => {
    setSelectedPanelId(id);
    const panel = panels?.find((p) => String(p.id) === id);
    if (panel) {
      form.setValue("tipoModulo", `${panel.fabricante} ${panel.nome}`);
      form.setValue("voc", panel.voc);
      form.setValue("vmp", panel.vmp);
      form.setValue("isc", panel.isc);
      form.setValue("imp", panel.imp);
      form.setValue("coefTensao", panel.coeficienteTemperatura);
      form.setValue("coefCorrente", 0.05);
    }
  };

  const handleInverterSelect = (id: string) => {
    setSelectedInverterId(id);
    const inv = inverters?.find((i) => String(i.id) === id);
    if (inv) {
      form.setValue("tipoInversor", `${inv.fabricante} ${inv.nome}`);
      form.setValue("vmpptMin", inv.mpptMin);
      form.setValue("vmpptMax", inv.mpptMax);
      form.setValue("vdcMax", inv.potenciaDcMax > 1000 ? inv.potenciaDcMax / 1000 : inv.potenciaDcMax);
      form.setValue("impptMax", inv.corrMaxMppt);
      form.setValue("ipviscMax", inv.corrMaxMppt * 1.25);
    }
  };

  const onSubmit = (data: FormValues) => {
    calcString.mutate({ data });
  };

  const result = calcString.data;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Calculadora de Strings</h1>
        <p className="text-muted-foreground mt-1">
          Dimensionamento de strings fotovoltaicas com análise térmica e verificação de limites MPPT
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="space-y-4">
          {/* Quick fill from DB */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pré-preenchimento automático</CardTitle>
              <CardDescription>Selecione um equipamento da base de dados para preencher automaticamente</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Painel da BD</label>
                <Select value={selectedPanelId} onValueChange={handlePanelSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar painel..." />
                  </SelectTrigger>
                  <SelectContent>
                    {panels?.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.fabricante} {p.nome} — {p.potencia}Wp
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Inversor da BD</label>
                <Select value={selectedInverterId} onValueChange={handleInverterSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar inversor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {inverters?.map((i) => (
                      <SelectItem key={i.id} value={String(i.id)}>
                        {i.fabricante} {i.nome} — {Number(i.potenciaAc) > 500 ? (Number(i.potenciaAc) / 1000).toFixed(1) : Number(i.potenciaAc)} kW AC
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-amber-100 flex items-center justify-center">
                      <Zap size={14} className="text-amber-600" />
                    </div>
                    Especificações do Módulo
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FormField control={form.control} name="voc" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Voc (V)</FormLabel>
                      <FormControl><Input type="number" step="0.1" placeholder="45.8" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="vmp" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vmpp (V)</FormLabel>
                      <FormControl><Input type="number" step="0.1" placeholder="38.2" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="isc" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Isc (A)</FormLabel>
                      <FormControl><Input type="number" step="0.01" placeholder="13.9" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="imp" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Impp (A)</FormLabel>
                      <FormControl><Input type="number" step="0.01" placeholder="13.1" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="coefTensao" render={({ field }) => (
                    <FormItem>
                      <FormLabel>βVoc (%/°C)</FormLabel>
                      <FormControl><Input type="number" step="0.001" placeholder="-0.29" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="coefCorrente" render={({ field }) => (
                    <FormItem>
                      <FormLabel>αIsc (%/°C)</FormLabel>
                      <FormControl><Input type="number" step="0.001" placeholder="0.05" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="noct" render={({ field }) => (
                    <FormItem>
                      <FormLabel>NOCT (°C)</FormLabel>
                      <FormControl><Input type="number" step="1" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="ganhosBifacial" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ganho Bifacial (%)</FormLabel>
                      <FormControl><Input type="number" step="1" min="0" max="30" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center">
                      <Zap size={14} className="text-blue-600" />
                    </div>
                    Especificações do Inversor
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FormField control={form.control} name="vmpptMin" render={({ field }) => (
                    <FormItem>
                      <FormLabel>MPPT Vmin (V)</FormLabel>
                      <FormControl><Input type="number" step="1" placeholder="80" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="vmpptMax" render={({ field }) => (
                    <FormItem>
                      <FormLabel>MPPT Vmax (V)</FormLabel>
                      <FormControl><Input type="number" step="1" placeholder="800" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="vdcMax" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vdc Máx (V)</FormLabel>
                      <FormControl><Input type="number" step="1" placeholder="1000" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="impptMax" render={({ field }) => (
                    <FormItem>
                      <FormLabel>I MPPT Máx (A)</FormLabel>
                      <FormControl><Input type="number" step="0.1" placeholder="14.5" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="ipviscMax" render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>I PVIsc Máx (A)</FormLabel>
                      <FormControl><Input type="number" step="0.1" placeholder="18.5" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </CardContent>
              </Card>

              <Button type="submit" className="w-full" disabled={calcString.isPending}>
                <Calculator className="mr-2 h-4 w-4" />
                {calcString.isPending ? "A calcular..." : "Calcular Dimensionamento"}
              </Button>
            </form>
          </Form>
        </div>

        {/* Results */}
        <div className="space-y-4">
          {result ? (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-blue-600 font-medium uppercase tracking-wide">Mínimo Arranque</p>
                    <p className="text-3xl font-black text-blue-700 mt-1">{result.nMinArranque}</p>
                    <p className="text-xs text-blue-500">painéis</p>
                  </CardContent>
                </Card>
                <Card className="bg-emerald-50 border-emerald-200">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-emerald-600 font-medium uppercase tracking-wide">Recomendado</p>
                    <p className="text-3xl font-black text-emerald-700 mt-1">{result.nRecomendado}</p>
                    <p className="text-xs text-emerald-500">painéis/string</p>
                  </CardContent>
                </Card>
                <Card className="bg-primary/10 border-primary/20">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-primary font-medium uppercase tracking-wide">Máximo String</p>
                    <p className="text-3xl font-black text-primary mt-1">{result.nMaxString}</p>
                    <p className="text-xs text-primary/70">painéis</p>
                  </CardContent>
                </Card>
              </div>

              {/* Alerts */}
              {result.erros.length > 0 && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Problemas Críticos</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-4 space-y-1 text-xs mt-1">
                      {result.erros.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
              {result.avisos.length > 0 && (
                <Alert className="border-amber-200 bg-amber-50">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-amber-800">Avisos</AlertTitle>
                  <AlertDescription className="text-amber-700">
                    <ul className="list-disc pl-4 space-y-1 text-xs mt-1">
                      {result.avisos.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Thermal table */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Análise Térmica por Temperatura</CardTitle>
                  <CardDescription>
                    T célula = T amb + (NOCT − 20) × G/800
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-2 text-muted-foreground font-medium text-xs">T Amb</th>
                          <th className="text-left py-2 px-2 text-muted-foreground font-medium text-xs">T Célula</th>
                          <th className="text-right py-2 px-2 text-muted-foreground font-medium text-xs">Voc (V)</th>
                          <th className="text-right py-2 px-2 text-muted-foreground font-medium text-xs">Vmpp (V)</th>
                          <th className="text-right py-2 px-2 text-muted-foreground font-medium text-xs">Isc (A)</th>
                          <th className="text-right py-2 px-2 text-muted-foreground font-medium text-xs">n Pain.</th>
                          <th className="text-center py-2 px-2 text-muted-foreground font-medium text-xs">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.tabelaTermica.map((row, i) => {
                          const cfg = ESTADO_CONFIG[row.estado as keyof typeof ESTADO_CONFIG] ?? ESTADO_CONFIG.OK;
                          const Icon = cfg.icon;
                          return (
                            <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="py-2 px-2 text-xs">{row.tAmb}°C</td>
                              <td className="py-2 px-2 text-xs text-muted-foreground">{row.tCelula.toFixed(1)}°C</td>
                              <td className="py-2 px-2 text-xs text-right font-mono">{row.voc.toFixed(1)}</td>
                              <td className="py-2 px-2 text-xs text-right font-mono">{row.vmp.toFixed(1)}</td>
                              <td className="py-2 px-2 text-xs text-right font-mono">{row.isc.toFixed(2)}</td>
                              <td className="py-2 px-2 text-xs text-right font-bold">{row.nPaineis}</td>
                              <td className="py-2 px-2">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${cfg.color}`}>
                                  <Icon size={10} />
                                  {cfg.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 border border-dashed rounded-lg bg-muted/20">
              <Calculator className="h-16 w-16 text-muted-foreground/20 mb-4" />
              <h3 className="text-lg font-medium mb-2">Calculadora de Strings PV</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Preencha as especificações do módulo e do inversor, depois clique em calcular para ver a análise térmica completa e o dimensionamento das strings.
              </p>
              <div className="mt-6 grid grid-cols-1 gap-2 text-xs text-muted-foreground text-left max-w-xs">
                <div className="flex items-start gap-2">
                  <CheckCircle size={12} className="text-emerald-500 mt-0.5 shrink-0" />
                  <span>Verifica tensão Voc vs. limites DC do inversor</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle size={12} className="text-emerald-500 mt-0.5 shrink-0" />
                  <span>Verifica corrente Isc vs. limite PVIsc</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle size={12} className="text-emerald-500 mt-0.5 shrink-0" />
                  <span>Deteta clipping de corrente MPPT</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle size={12} className="text-emerald-500 mt-0.5 shrink-0" />
                  <span>Análise de 0°C a 45°C ambiente</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
