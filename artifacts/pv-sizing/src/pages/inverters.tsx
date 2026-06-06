import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  useListInverters, 
  useCreateInverter, 
  useUpdateInverter, 
  useDeleteInverter,
  getListInvertersQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Inverter } from "@workspace/api-client-react";

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

const inverterSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  fabricante: z.string().min(1, "Fabricante é obrigatório"),
  potenciaAc: z.coerce.number().min(1, "Obrigatório"),
  potenciaDcMax: z.coerce.number().min(1, "Obrigatório"),
  mpptMin: z.coerce.number().min(1, "Obrigatório"),
  mpptMax: z.coerce.number().min(1, "Obrigatório"),
  corrMaxMppt: z.coerce.number().min(1, "Obrigatório"),
  numMppt: z.coerce.number().min(1, "Obrigatório"),
  stringsPorMppt: z.coerce.number().min(1, "Obrigatório"),
  vdcMax: z.union([z.coerce.number(), z.null()]).optional(),
});

type InverterFormValues = z.infer<typeof inverterSchema>;

export default function Inverters() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingInverter, setEditingInverter] = useState<Inverter | null>(null);

  const { data: inverters, isLoading } = useListInverters();
  const createInverter = useCreateInverter();
  const updateInverter = useUpdateInverter();
  const deleteInverter = useDeleteInverter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<InverterFormValues>({
    resolver: zodResolver(inverterSchema),
    defaultValues: {
      nome: "",
      fabricante: "",
      potenciaAc: 0,
      potenciaDcMax: 0,
      mpptMin: 0,
      mpptMax: 0,
      corrMaxMppt: 0,
      numMppt: 1,
      stringsPorMppt: 1,
      vdcMax: null,
    },
  });

  const onSubmit = (data: InverterFormValues) => {
    if (editingInverter) {
      updateInverter.mutate(
        { id: editingInverter.id, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListInvertersQueryKey() });
            toast({ title: "Inversor atualizado com sucesso" });
            setEditingInverter(null);
            form.reset();
          },
        }
      );
    } else {
      createInverter.mutate(
        { data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListInvertersQueryKey() });
            toast({ title: "Inversor criado com sucesso" });
            setIsCreateOpen(false);
            form.reset();
          },
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem a certeza que deseja eliminar este inversor?")) {
      deleteInverter.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListInvertersQueryKey() });
            toast({ title: "Inversor eliminado" });
          },
        }
      );
    }
  };

  const openEdit = (inv: Inverter) => {
    setEditingInverter(inv);
    form.reset({
      nome: inv.nome,
      fabricante: inv.fabricante,
      potenciaAc: inv.potenciaAc,
      potenciaDcMax: inv.potenciaDcMax,
      mpptMin: inv.mpptMin,
      mpptMax: inv.mpptMax,
      corrMaxMppt: inv.corrMaxMppt,
      numMppt: inv.numMppt,
      stringsPorMppt: inv.stringsPorMppt,
      vdcMax: inv.vdcMax ?? null,
    });
  };

  const filtered = inverters?.filter(p => 
    p.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.fabricante.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inversores</h1>
          <p className="text-muted-foreground mt-1">Gira o catálogo de inversores.</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          if (!open) form.reset();
          setIsCreateOpen(open);
        }}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Novo Inversor
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Novo Inversor</DialogTitle>
            </DialogHeader>
            <DatasheetImport
              tipoEquipamento="inversor"
              onExtracted={(dados) => {
                const d = dados as Record<string, number | string>;
                const cur = form.getValues();
                form.reset({
                  fabricante:    d.fabricante               ? String(d.fabricante)       : cur.fabricante,
                  nome:          d.nome                     ? String(d.nome)             : cur.nome,
                  potenciaAc:    Number(d.potenciaAc)    > 0 ? Number(d.potenciaAc)     : cur.potenciaAc,
                  potenciaDcMax: Number(d.potenciaDcMax) > 0 ? Number(d.potenciaDcMax)  : cur.potenciaDcMax,
                  mpptMin:       Number(d.mpptMin)       > 0 ? Number(d.mpptMin)        : cur.mpptMin,
                  mpptMax:       Number(d.mpptMax)       > 0 ? Number(d.mpptMax)        : cur.mpptMax,
                  corrMaxMppt:   Number(d.corrMaxMppt)   > 0 ? Number(d.corrMaxMppt)    : cur.corrMaxMppt,
                  numMppt:       Number(d.numMppt)       > 0 ? Number(d.numMppt)        : cur.numMppt,
                  stringsPorMppt: Number(d.stringsPorMppt) > 0 ? Number(d.stringsPorMppt) : cur.stringsPorMppt,
                  vdcMax: Number(d.vdcMax) > 0 ? Number(d.vdcMax) : cur.vdcMax,
                });
              }}
              onBatchCreate={async (modelos) => {
                let ok = 0;
                for (const d of modelos) {
                  try {
                    await createInverter.mutateAsync({ data: {
                      nome: String(d.nome ?? ""),
                      fabricante: String(d.fabricante ?? ""),
                      potenciaAc: Number(d.potenciaAc ?? 0),
                      potenciaDcMax: Number(d.potenciaDcMax ?? 0),
                      mpptMin: Number(d.mpptMin ?? 0),
                      mpptMax: Number(d.mpptMax ?? 0),
                      corrMaxMppt: Number(d.corrMaxMppt ?? 0),
                      numMppt: Number(d.numMppt ?? 1),
                      stringsPorMppt: Number(d.stringsPorMppt ?? 1),
                      vdcMax: d.vdcMax ? Number(d.vdcMax) : null,
                    }});
                    ok++;
                  } catch { /* skip failed */ }
                }
                queryClient.invalidateQueries({ queryKey: getListInvertersQueryKey() });
                toast({ title: `${ok} inversor(es) criado(s) com sucesso` });
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
                  <FormField control={form.control} name="potenciaAc" render={({ field }) => (
                    <FormItem><FormLabel>Potência AC (kW)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="potenciaDcMax" render={({ field }) => (
                    <FormItem><FormLabel>Potência DC Max (kW)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="vdcMax" render={({ field }) => (
                    <FormItem><FormLabel>Tensão DC Max (V)</FormLabel><FormControl><Input type="number" step="1" placeholder="1000" value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="mpptMin" render={({ field }) => (
                    <FormItem><FormLabel>MPPT Min (V)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="mpptMax" render={({ field }) => (
                    <FormItem><FormLabel>MPPT Max (V)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="corrMaxMppt" render={({ field }) => (
                    <FormItem><FormLabel>Corrente Max MPPT (A)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="numMppt" render={({ field }) => (
                    <FormItem><FormLabel>Nº MPPTs</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="stringsPorMppt" render={({ field }) => (
                    <FormItem><FormLabel>Strings por MPPT</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={createInverter.isPending} className="w-full sm:w-auto">
                    {createInverter.isPending ? "A guardar..." : "Guardar Inversor"}
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
            placeholder="Pesquisar inversores..."
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
              <TableHead>Potência AC</TableHead>
              <TableHead>Nº MPPTs</TableHead>
              <TableHead>Faixa MPPT</TableHead>
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
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-16 inline-block" /></TableCell>
                </TableRow>
              ))
            ) : filtered?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhum inversor encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filtered?.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.fabricante}</TableCell>
                  <TableCell>{inv.nome}</TableCell>
                  <TableCell>{inv.potenciaAc} W</TableCell>
                  <TableCell>{inv.numMppt} (x{inv.stringsPorMppt} strings)</TableCell>
                  <TableCell>{inv.mpptMin}V - {inv.mpptMax}V</TableCell>
                  <TableCell className="text-right">
                    <Dialog open={editingInverter?.id === inv.id} onOpenChange={(open) => {
                      if (!open) { setEditingInverter(null); form.reset(); }
                      else openEdit(inv);
                    }}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Editar Inversor</DialogTitle>
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
                              <FormField control={form.control} name="potenciaAc" render={({ field }) => (
                                <FormItem><FormLabel>Potência AC (kW)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="potenciaDcMax" render={({ field }) => (
                                <FormItem><FormLabel>Potência DC Max (kW)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="vdcMax" render={({ field }) => (
                                <FormItem><FormLabel>Tensão DC Max (V)</FormLabel><FormControl><Input type="number" step="1" placeholder="1000" value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="mpptMin" render={({ field }) => (
                                <FormItem><FormLabel>MPPT Min (V)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="mpptMax" render={({ field }) => (
                                <FormItem><FormLabel>MPPT Max (V)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="corrMaxMppt" render={({ field }) => (
                                <FormItem><FormLabel>Corrente Max MPPT (A)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="numMppt" render={({ field }) => (
                                <FormItem><FormLabel>Nº MPPTs</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="stringsPorMppt" render={({ field }) => (
                                <FormItem><FormLabel>Strings por MPPT</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                            </div>
                            <div className="flex justify-end">
                              <Button type="submit" disabled={updateInverter.isPending} className="w-full sm:w-auto">
                                {updateInverter.isPending ? "A atualizar..." : "Atualizar Inversor"}
                              </Button>
                            </div>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(inv.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10">
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
