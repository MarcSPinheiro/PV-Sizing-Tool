import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useListCustomers,
  useListPanels,
  useListInverters,
  useListBatteries,
  useCreateSystem,
  useCalculateFinancial,
  getListSystemsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

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
import { ArrowLeft, Save, AlertTriangle, CheckCircle, Info, Calculator, Sun, Zap, TrendingUp, ChevronRight } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const systemSchema = z.object({
  customerId: z.coerce.number().min(1, "Selecione um cliente"),
  panelId: z.coerce.number().min(1, "Selecione um painel"),
  inverterId: z.coerce.number().min(1, "Selecione um inversor"),
  batteryId: z.coerce.number().nullable().optional(),
  numPaineis: z.coerce.number().min(1, "Mínimo 1 painel"),
  paineisporstring: z.coerce.number().min(1, "Mínimo 1 por string"),
  numStrings: z.coerce.number().min(1, "Mínimo 1 string"),
  inclinacao: z.coerce.number().min(0).max(90),
  azimute: z.coerce.number().min(-180).max(180),
});

type SystemFormValues = z.infer<typeof systemSchema>;

export default function SystemNew() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: customers, isLoading: loadingCustomers } = useListCustomers();
  const { data: panels, isLoading: loadingPanels } = useListPanels();
  const { data: inverters, isLoading: loadingInverters } = useListInverters();
  const { data: batteries, isLoading: loadingBatteries } = useListBatteries();
  const createSystem = useCreateSystem();

  // URL search params logic is not natively supported by wouter's useLocation hook easily,
  // so we'll just extract from window.location
  const urlParams = new URLSearchParams(window.location.search);
  const initialCustomerId = urlParams.get("customerId") ?parseInt(urlParams.get("customerId")!, 10) : 0;

  const form = useForm<SystemFormValues>({
    resolver: zodResolver(systemSchema),
    defaultValues: {
      customerId: initialCustomerId,
      panelId: 0,
      inverterId: 0,
      batteryId: null,
      numPaineis: 10,
      paineisporstring: 10,
      numStrings: 1,
      inclinacao: 35,
      azimute: 0,
    },
  });

  const watchAll = form.watch();

  const onSubmit = (data: SystemFormValues) => {
    createSystem.mutate(
      { data },
      {
        onSuccess: (newSystem) => {
          queryClient.invalidateQueries({ queryKey: getListSystemsQueryKey() });
          toast({ title: "Sistema criado com sucesso. Redirecionando para detalhes..." });
          setLocation(`/sistemas/${newSystem.id}`);
        },
      }
    );
  };

  const selectedPanel = panels?.find(p => p.id === watchAll.panelId);
  const totalPowerWp = selectedPanel ?selectedPanel.potencia * watchAll.numPaineis : 0;
  const totalPowerkWp = (totalPowerWp / 1000).toFixed(2);

  const isLoading = loadingCustomers || loadingPanels || loadingInverters || loadingBatteries;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Novo Dimensionamento</h1>
            <p className="text-muted-foreground mt-1">Configure os parâmetros do sistema fotovoltaico.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Dados do Cliente</CardTitle>
                </CardHeader>
                <CardContent>
                  <FormField control={form.control} name="customerId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cliente</FormLabel>
                      <Select
                        onValueChange={(val) => field.onChange(parseInt(val, 10))}
                        value={field.value ?field.value.toString() : ""}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um cliente..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {customers?.map(c => (
                            <SelectItem key={c.id} value={c.id.toString()}>
                              {c.nome} ({c.morada})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Equipamentos</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="panelId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Painel Solar</FormLabel>
                        <Select
                          onValueChange={(val) => field.onChange(parseInt(val, 10))}
                          value={field.value ?field.value.toString() : ""}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {panels?.map(p => (
                              <SelectItem key={p.id} value={p.id.toString()}>
                                {p.fabricante} {p.nome} ({p.potencia}Wp)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="inverterId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Inversor</FormLabel>
                        <Select
                          onValueChange={(val) => field.onChange(parseInt(val, 10))}
                          value={field.value ?field.value.toString() : ""}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {inverters?.map(i => (
                              <SelectItem key={i.id} value={i.id.toString()}>
                                {i.fabricante} {i.nome} ({i.potenciaAc}W)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="batteryId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bateria (Opcional)</FormLabel>
                      <Select
                        onValueChange={(val) => field.onChange(val === "none" ?null : parseInt(val, 10))}
                        value={field.value ?field.value.toString() : "none"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Sem bateria..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Sem bateria</SelectItem>
                          {batteries?.map(b => (
                            <SelectItem key={b.id} value={b.id.toString()}>
                              {b.fabricante} {b.nome} ({b.capacidade}kWh)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Configuração Elétrica</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <FormField control={form.control} name="numPaineis" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Total Painéis</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="numStrings" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nº Strings</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="paineisporstring" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Painéis/String</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  {watchAll.numPaineis !== (watchAll.numStrings * watchAll.paineisporstring) && (
                    <p className="text-sm text-destructive mt-2">
                      Atenção: Total de painéis ({watchAll.numPaineis}) ≠ Strings ({watchAll.numStrings}) × Painéis/String ({watchAll.paineisporstring})
                    </p>
                  )}

                  <div className="grid grid-cols-1 gap-4 mt-4 sm:grid-cols-2">
                    <FormField control={form.control} name="inclinacao" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Inclinação (°)</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="azimute" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Azimute (°)</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">Sul = 0°, Este = -90°, Oeste = 90°</p>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-col justify-end gap-3 sm:flex-row">
                <Button variant="outline" type="button" onClick={() => window.history.back()} className="w-full sm:w-auto">Cancelar</Button>
                <Button type="submit" disabled={createSystem.isPending} className="w-full sm:w-auto">
                  <Save className="mr-2 h-4 w-4" />
                  {createSystem.isPending ?"A guardar..." : "Guardar e Calcular"}
                </Button>
              </div>
            </form>
          </Form>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader className="pb-4 border-b">
              <CardTitle className="text-lg">Resumo</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm flex items-center gap-2"><Sun className="h-4 w-4"/> Potência DC</span>
                <span className="font-semibold">{totalPowerkWp} kWp</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm flex items-center gap-2"><Zap className="h-4 w-4"/> Potência AC</span>
                <span className="font-semibold">
                  {watchAll.inverterId && inverters
                    ?(inverters.find(i => i.id === watchAll.inverterId)?.potenciaAc! / 1000).toFixed(2) + " kW"
                    : "-"}
                </span>
              </div>

              {watchAll.panelId && watchAll.inverterId && totalPowerWp > 0 && inverters && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-sm">Ratio DC/AC</span>
                  <span className="font-semibold">
                    {((totalPowerWp) / inverters.find(i => i.id === watchAll.inverterId)?.potenciaAc!).toFixed(2)}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Validação Elétrica</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground text-center py-4 flex flex-col items-center gap-2">
                <Info className="h-8 w-8 text-muted-foreground/50" />
                A validação elétrica fica disponível após criação do sistema.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
