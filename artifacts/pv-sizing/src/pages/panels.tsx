import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  useListPanels, 
  useCreatePanel, 
  useUpdatePanel, 
  useDeletePanel,
  getListPanelsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { SolarPanel } from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DatasheetImport } from "@/components/datasheet-import";

const panelSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  fabricante: z.string().min(1, "Fabricante é obrigatório"),
  potencia: z.coerce.number().min(1, "Potência deve ser maior que 0"),
  voc: z.coerce.number().min(0, "Voc inválido"),
  vmp: z.coerce.number().min(0, "Vmp inválido"),
  isc: z.coerce.number().min(0, "Isc inválido"),
  imp: z.coerce.number().min(0, "Imp inválido"),
  coeficienteTemperatura: z.coerce.number(),
  coeficienteTemperaturaVoc: z.union([z.coerce.number(), z.null()]).optional(),
  noct: z.union([z.coerce.number(), z.null()]).optional(),
  alturaMm: z.union([z.coerce.number().int().min(1).max(9999), z.null()]).optional(),
  larguraMm: z.union([z.coerce.number().int().min(1).max(9999), z.null()]).optional(),
}).refine(d => d.voc === 0 || d.vmp === 0 || d.voc > d.vmp, {
  message: "Voc deve ser maior que Vmp (fisicamente impossível: Voc ≤ Vmp)",
  path: ["voc"],
}).refine(d => d.isc === 0 || d.imp === 0 || d.isc > d.imp, {
  message: "Isc deve ser maior que Imp (fisicamente impossível: Isc ≤ Imp)",
  path: ["isc"],
});

type PanelFormValues = z.infer<typeof panelSchema>;

export default function Panels() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPanel, setEditingPanel] = useState<SolarPanel | null>(null);

  const { data: panels, isLoading } = useListPanels();
  const createPanel = useCreatePanel();
  const updatePanel = useUpdatePanel();
  const deletePanel = useDeletePanel();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<PanelFormValues>({
    resolver: zodResolver(panelSchema),
    defaultValues: {
      nome: "",
      fabricante: "",
      potencia: 0,
      voc: 0,
      vmp: 0,
      isc: 0,
      imp: 0,
      coeficienteTemperatura: -0.35,
      coeficienteTemperaturaVoc: null,
      noct: null,
      alturaMm: null,
      larguraMm: null,
    },
  });

  const onSubmit = (data: PanelFormValues) => {
    if (editingPanel) {
      updatePanel.mutate(
        { id: editingPanel.id, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListPanelsQueryKey() });
            toast({ title: "Painel atualizado com sucesso" });
            setEditingPanel(null);
            form.reset();
          },
        }
      );
    } else {
      createPanel.mutate(
        { data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListPanelsQueryKey() });
            toast({ title: "Painel criado com sucesso" });
            setIsCreateOpen(false);
            form.reset();
          },
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem a certeza que deseja eliminar este painel?")) {
      deletePanel.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListPanelsQueryKey() });
            toast({ title: "Painel eliminado" });
          },
        }
      );
    }
  };

  const openEdit = (panel: SolarPanel) => {
    setEditingPanel(panel);
    form.reset({
      nome: panel.nome,
      fabricante: panel.fabricante,
      potencia: panel.potencia,
      voc: panel.voc,
      vmp: panel.vmp,
      isc: panel.isc,
      imp: panel.imp,
      coeficienteTemperatura: panel.coeficienteTemperatura,
      coeficienteTemperaturaVoc: panel.coeficienteTemperaturaVoc ?? null,
      noct: panel.noct ?? null,
      alturaMm: panel.alturaMm ?? null,
      larguraMm: panel.larguraMm ?? null,
    });
  };

  const filteredPanels = panels?.filter(p => 
    p.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.fabricante.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Painéis Solares</h1>
          <p className="text-muted-foreground mt-1">Gira o catálogo de módulos fotovoltaicos.</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          if (!open) form.reset();
          setIsCreateOpen(open);
        }}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Novo Painel
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Novo Painel</DialogTitle>
            </DialogHeader>
            <DatasheetImport
              tipoEquipamento="painel"
              onExtracted={(dados) => {
                const d = dados as Record<string, number | string>;
                const cur = form.getValues();
                form.reset({
                  fabricante:            d.fabricante           ? String(d.fabricante)            : cur.fabricante,
                  nome:                  d.nome                 ? String(d.nome)                  : cur.nome,
                  potencia:              Number(d.potencia) > 0 ? Number(d.potencia)              : cur.potencia,
                  voc:                   Number(d.voc)      > 0 ? Number(d.voc)                   : cur.voc,
                  vmp:                   Number(d.vmp)      > 0 ? Number(d.vmp)                   : cur.vmp,
                  isc:                   Number(d.isc)      > 0 ? Number(d.isc)                   : cur.isc,
                  imp:                   Number(d.imp)      > 0 ? Number(d.imp)                   : cur.imp,
                  coeficienteTemperatura: Number(d.coeficienteTemperatura) !== 0
                                           ? Number(d.coeficienteTemperatura)
                                           : cur.coeficienteTemperatura,
                  coeficienteTemperaturaVoc: Number(d.coeficienteTemperaturaVoc) !== 0 ? Number(d.coeficienteTemperaturaVoc) : cur.coeficienteTemperaturaVoc,
                  noct: Number(d.noct) > 0 ? Number(d.noct) : cur.noct,
                  alturaMm: Number(d.alturaMm) > 0 ? Math.round(Number(d.alturaMm)) : cur.alturaMm,
                  larguraMm: Number(d.larguraMm) > 0 ? Math.round(Number(d.larguraMm)) : cur.larguraMm,
                });
              }}
              onBatchCreate={async (modelos) => {
                let ok = 0;
                for (const d of modelos) {
                  try {
                    await createPanel.mutateAsync({ data: {
                      nome: String(d.nome ?? ""),
                      fabricante: String(d.fabricante ?? ""),
                      potencia: Number(d.potencia ?? 0),
                      voc: Number(d.voc ?? 0),
                      vmp: Number(d.vmp ?? 0),
                      isc: Number(d.isc ?? 0),
                      imp: Number(d.imp ?? 0),
                      coeficienteTemperatura: Number(d.coeficienteTemperatura ?? -0.35),
                      coeficienteTemperaturaVoc: d.coeficienteTemperaturaVoc ? Number(d.coeficienteTemperaturaVoc) : null,
                      noct: d.noct ? Number(d.noct) : null,
                      alturaMm: d.alturaMm ? Math.round(Number(d.alturaMm)) : null,
                      larguraMm: d.larguraMm ? Math.round(Number(d.larguraMm)) : null,
                    }});
                    ok++;
                  } catch { /* skip failed */ }
                }
                queryClient.invalidateQueries({ queryKey: getListPanelsQueryKey() });
                toast({ title: `${ok} painel(is) criado(s) com sucesso` });
                if (ok > 0) { setIsCreateOpen(false); form.reset(); }
              }}
            />
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField control={form.control} name="fabricante" render={({ field }) => (
                    <FormItem><FormLabel>Fabricante</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="nome" render={({ field }) => (
                    <FormItem><FormLabel>Modelo</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="potencia" render={({ field }) => (
                    <FormItem><FormLabel>Potência (Wp)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="coeficienteTemperatura" render={({ field }) => (
                    <FormItem><FormLabel>Coef. Temp. Pmax (%/°C)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="voc" render={({ field }) => (
                    <FormItem><FormLabel>Voc (V)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="isc" render={({ field }) => (
                    <FormItem><FormLabel>Isc (A)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="vmp" render={({ field }) => (
                    <FormItem><FormLabel>Vmp (V)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="imp" render={({ field }) => (
                    <FormItem><FormLabel>Imp (A)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="coeficienteTemperaturaVoc" render={({ field }) => (
                    <FormItem><FormLabel>Coef. Temp. Voc (%/°C)</FormLabel><FormControl><Input type="number" step="0.001" placeholder="-0.28" value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="noct" render={({ field }) => (
                    <FormItem><FormLabel>NOCT (°C)</FormLabel><FormControl><Input type="number" step="0.5" placeholder="45" value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="alturaMm" render={({ field }) => (
                    <FormItem><FormLabel>Altura (mm)</FormLabel><FormControl><Input type="number" step="1" placeholder="2279" value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Math.round(Number(e.target.value)))} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="larguraMm" render={({ field }) => (
                    <FormItem><FormLabel>Largura (mm)</FormLabel><FormControl><Input type="number" step="1" placeholder="1134" value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Math.round(Number(e.target.value)))} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={createPanel.isPending} className="w-full sm:w-auto">
                    {createPanel.isPending ? "A guardar..." : "Guardar Painel"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center space-x-2">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar painéis..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-x-auto border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fabricante</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead>Potência</TableHead>
              <TableHead>Voc</TableHead>
              <TableHead>Isc</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-16 inline-block" /></TableCell>
                </TableRow>
              ))
            ) : filteredPanels?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhum painel encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filteredPanels?.map((panel) => (
                <TableRow key={panel.id}>
                  <TableCell className="font-medium">{panel.fabricante}</TableCell>
                  <TableCell>{panel.nome}</TableCell>
                  <TableCell>{panel.potencia} Wp</TableCell>
                  <TableCell>{panel.voc} V</TableCell>
                  <TableCell>{panel.isc} A</TableCell>
                  <TableCell className="text-right">
                    <Dialog open={editingPanel?.id === panel.id} onOpenChange={(open) => {
                      if (!open) { setEditingPanel(null); form.reset(); }
                      else openEdit(panel);
                    }}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Editar Painel</DialogTitle>
                        </DialogHeader>
                        <Form {...form}>
                          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <FormField control={form.control} name="fabricante" render={({ field }) => (
                                <FormItem><FormLabel>Fabricante</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="nome" render={({ field }) => (
                                <FormItem><FormLabel>Modelo</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="potencia" render={({ field }) => (
                                <FormItem><FormLabel>Potência (Wp)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="coeficienteTemperatura" render={({ field }) => (
                                <FormItem><FormLabel>Coef. Temp. Pmax (%/°C)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="voc" render={({ field }) => (
                                <FormItem><FormLabel>Voc (V)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="isc" render={({ field }) => (
                                <FormItem><FormLabel>Isc (A)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="vmp" render={({ field }) => (
                                <FormItem><FormLabel>Vmp (V)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="imp" render={({ field }) => (
                                <FormItem><FormLabel>Imp (A)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="coeficienteTemperaturaVoc" render={({ field }) => (
                                <FormItem><FormLabel>Coef. Temp. Voc (%/°C)</FormLabel><FormControl><Input type="number" step="0.001" placeholder="-0.28" value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="noct" render={({ field }) => (
                                <FormItem><FormLabel>NOCT (°C)</FormLabel><FormControl><Input type="number" step="0.5" placeholder="45" value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="alturaMm" render={({ field }) => (
                                <FormItem><FormLabel>Altura (mm)</FormLabel><FormControl><Input type="number" step="1" placeholder="2279" value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Math.round(Number(e.target.value)))} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="larguraMm" render={({ field }) => (
                                <FormItem><FormLabel>Largura (mm)</FormLabel><FormControl><Input type="number" step="1" placeholder="1134" value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Math.round(Number(e.target.value)))} /></FormControl><FormMessage /></FormItem>
                              )} />
                            </div>
                            <div className="flex justify-end">
                              <Button type="submit" disabled={updatePanel.isPending} className="w-full sm:w-auto">
                                {updatePanel.isPending ? "A atualizar..." : "Atualizar Painel"}
                              </Button>
                            </div>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(panel.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
