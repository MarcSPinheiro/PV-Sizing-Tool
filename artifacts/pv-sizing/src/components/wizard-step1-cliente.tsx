import { UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { useListLocations } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { MapPin, User, Zap, Compass } from "lucide-react";

export const clienteSchema = z.object({
  tipoCliente: z.enum(["particular", "empresa", "industrial"]),
  morada: z.string().min(1, "Morada é obrigatória"),
  tipoTarifa: z.enum(["simples", "bi-horaria", "tri-horaria"]),
  potenciaContratada: z.coerce.number().min(0.1, "Potência contratada inválida"),
});

export const localizacaoSchema = z.object({
  latitude:   z.coerce.number().min(36).max(42.5),
  longitude:  z.coerce.number().min(-10).max(-6),
  inclinacao: z.coerce.number().min(0).max(90),
  azimute:    z.coerce.number().min(-180).max(180),
});

export type ClienteForm   = z.infer<typeof clienteSchema>;
export type LocalizacaoForm = z.infer<typeof localizacaoSchema>;

interface Props {
  clienteForm:   UseFormReturn<ClienteForm>;
  locForm:       UseFormReturn<LocalizacaoForm>;
}

export default function WizardStep1Cliente({ clienteForm, locForm }: Props) {
  const { data: locations } = useListLocations();
  const currentLatitude = Number(locForm.watch("latitude"));
  const currentLongitude = Number(locForm.watch("longitude"));
  const selectedLocationName =
    locations?.find(
      (loc) =>
        Math.abs(Number(loc.latitude) - currentLatitude) < 0.0001 &&
        Math.abs(Number(loc.longitude) - currentLongitude) < 0.0001,
    )?.nome ??"";

  return (
    <div className="space-y-4">
      {/* Cliente */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><User size={20} /> Dados do Cliente</CardTitle>
          <CardDescription>Tipo de cliente, morada e contrato de energia.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...clienteForm}>
            <form className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={clienteForm.control} name="tipoCliente" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Cliente</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="particular">Particular</SelectItem>
                        <SelectItem value="empresa">Empresa</SelectItem>
                        <SelectItem value="industrial">Industrial</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={clienteForm.control} name="tipoTarifa" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Tarifa</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="simples">Simples</SelectItem>
                        <SelectItem value="bi-horaria">Bi-horária</SelectItem>
                        <SelectItem value="tri-horaria">Tri-horária</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={clienteForm.control} name="morada" render={({ field }) => (
                <FormItem>
                  <FormLabel>Morada da Instalação</FormLabel>
                  <FormControl><Input placeholder="Ex: Rua das Flores, 12, Lisboa" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={clienteForm.control} name="potenciaContratada" render={({ field }) => (
                <FormItem className="w-full sm:max-w-[180px]">
                  <FormLabel>Potência Contratada (kVA)</FormLabel>
                  <FormControl><Input type="number" min={0} step={0.5} {...field} /></FormControl>
                  <p className="text-xs text-muted-foreground">Encontra-se na fatura elétrica</p>
                  <FormMessage />
                </FormItem>
              )} />
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Localização */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MapPin size={20} /> Localização</CardTitle>
          <CardDescription>Coordenadas GPS da instalação para cálculo da radiação solar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {locations && locations.length > 0 && (
            <div>
              <label className="text-sm font-medium">Localidade (pré-definida)</label>
              <Select value={selectedLocationName} onValueChange={v => {
                const loc = locations.find(l => l.nome === v);
                if (loc) {
                  locForm.setValue("latitude", loc.latitude, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                  locForm.setValue("longitude", loc.longitude, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                }
              }}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecionar localidade..." /></SelectTrigger>
                <SelectContent>
                  {locations.map(l => <SelectItem key={l.nome} value={l.nome}>{l.nome} — {l.regiao}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <Form {...locForm}>
            <form className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField control={locForm.control} name="latitude" render={({ field }) => (
                <FormItem>
                  <FormLabel>Latitude</FormLabel>
                  <FormControl><Input type="number" step="0.0001" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={locForm.control} name="longitude" render={({ field }) => (
                <FormItem>
                  <FormLabel>Longitude</FormLabel>
                  <FormControl><Input type="number" step="0.0001" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Orientação */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Compass size={20} /> Orientação dos Painéis</CardTitle>
          <CardDescription>Inclinação e azimute determinam o rendimento solar estimado.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...locForm}>
            <form className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField control={locForm.control} name="inclinacao" render={({ field }) => (
                <FormItem>
                  <FormLabel>Inclinação (°)</FormLabel>
                  <FormControl><Input type="number" min={0} max={90} {...field} /></FormControl>
                  <p className="text-xs text-muted-foreground">0°=horizontal · Óptimo ≈ 30–35°</p>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={locForm.control} name="azimute" render={({ field }) => (
                <FormItem>
                  <FormLabel>Azimute (° de Sul)</FormLabel>
                  <FormControl><Input type="number" min={-180} max={180} {...field} /></FormControl>
                  <p className="text-xs text-muted-foreground">0°=Sul · −90°=Este · +90°=Oeste</p>
                  <FormMessage />
                </FormItem>
              )} />
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Contracted power summary */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
        <Zap size={12} />
        <span>Os campos de localização são usados para consultar a base de dados de radiação solar (PVGIS) no dimensionamento.</span>
      </div>
    </div>
  );
}
