import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  useListBatteries, 
  useCreateBattery, 
  useUpdateBattery, 
  useDeleteBattery,
  getListBatteriesQueryKey,
  Battery,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DatasheetImport } from "@/components/datasheet-import";

const TECNOLOGIAS = ["LiFePO4", "Li-ion", "AGM", "Gel"] as const;

const batterySchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  fabricante: z.string().min(1, "Fabricante é obrigatório"),
  capacidade: z.coerce.number().min(0.1, "Obrigatório"),
  tensao: z.coerce.number().min(1, "Obrigatório"),
  tecnologia: z.enum(TECNOLOGIAS),
});

type BatteryFormValues = z.infer<typeof batterySchema>;

export default function Batteries() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingBattery, setEditingBattery] = useState<Battery | null>(null);

  const { data: batteries, isLoading } = useListBatteries();
  const createBattery = useCreateBattery();
  const updateBattery = useUpdateBattery();
  const deleteBattery = useDeleteBattery();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<BatteryFormValues>({
    resolver: zodResolver(batterySchema),
    defaultValues: {
      nome: "",
      fabricante: "",
      capacidade: 0,
      tensao: 48,
      tecnologia: "LiFePO4",
    },
  });

  const onSubmit = (data: BatteryFormValues) => {
    if (editingBattery) {
      updateBattery.mutate(
        { id: editingBattery.id, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListBatteriesQueryKey() });
            toast({ title: "Bateria atualizada com sucesso" });
            setEditingBattery(null);
            form.reset();
          },
        }
      );
    } else {
      createBattery.mutate(
        { data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListBatteriesQueryKey() });
            toast({ title: "Bateria criada com sucesso" });
            setIsCreateOpen(false);
            form.reset();
          },
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem a certeza que deseja eliminar esta bateria?")) {
      deleteBattery.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListBatteriesQueryKey() });
            toast({ title: "Bateria eliminada" });
          },
        }
      );
    }
  };

  const openEdit = (bat: Battery) => {
    setEditingBattery(bat);
    form.reset({
      nome: bat.nome,
      fabricante: bat.fabricante,
      capacidade: bat.capacidade,
      tensao: bat.tensao,
      tecnologia: bat.tecnologia,
    });
  };

  const filtered = batteries?.filter(p => 
    p.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.fabricante.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const BatteryForm = ({ isEdit = false }: { isEdit?: boolean }) => (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {!isEdit && (
          <DatasheetImport
            tipoEquipamento="bateria"
            onExtracted={(data) => {
              const cur = form.getValues();
              form.reset({
                nome:        data.nome        ? String(data.nome)        : cur.nome,
                fabricante:  data.fabricante  ? String(data.fabricante)  : cur.fabricante,
                capacidade:  Number(data.capacidade) > 0 ? Number(data.capacidade) : cur.capacidade,
                tensao:      Number(data.tensao)      > 0 ? Number(data.tensao)      : cur.tensao,
                tecnologia:  TECNOLOGIAS.includes(data.tecnologia as typeof TECNOLOGIAS[number])
                               ? (data.tecnologia as typeof TECNOLOGIAS[number])
                               : cur.tecnologia,
              });
            }}
            onBatchCreate={async (modelos) => {
              let ok = 0;
              for (const d of modelos) {
                const tec = TECNOLOGIAS.includes(d.tecnologia as typeof TECNOLOGIAS[number])
                  ? (d.tecnologia as typeof TECNOLOGIAS[number])
                  : "LiFePO4";
                try {
                  await createBattery.mutateAsync({ data: {
                    nome: String(d.nome ?? ""),
                    fabricante: String(d.fabricante ?? ""),
                    capacidade: Number(d.capacidade ?? 0),
                    tensao: Number(d.tensao ?? 48),
                    tecnologia: tec,
                  }});
                  ok++;
                } catch { /* skip failed */ }
              }
              queryClient.invalidateQueries({ queryKey: getListBatteriesQueryKey() });
              toast({ title: `${ok} bateria(s) criada(s) com sucesso` });
              if (ok > 0) { setIsCreateOpen(false); form.reset(); }
            }}
          />
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField control={form.control} name="fabricante" render={({ field }) => (
            <FormItem><FormLabel>Fabricante</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="nome" render={({ field }) => (
            <FormItem><FormLabel>Modelo</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="capacidade" render={({ field }) => (
            <FormItem><FormLabel>Capacidade (kWh)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="tensao" render={({ field }) => (
            <FormItem><FormLabel>Tensão Nominal (V)</FormLabel><FormControl><Input type="number" step="1" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="tecnologia" render={({ field }) => (
            <FormItem><FormLabel>Tecnologia</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {TECNOLOGIAS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            <FormMessage /></FormItem>
          )} />
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={isEdit ? updateBattery.isPending : createBattery.isPending} className="w-full sm:w-auto">
            {isEdit
              ? (updateBattery.isPending ? "A atualizar..." : "Atualizar Bateria")
              : (createBattery.isPending ? "A criar..." : "Criar Bateria")}
          </Button>
        </div>
      </form>
    </Form>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Baterias</h1>
          <p className="text-muted-foreground mt-1">Gira o catálogo de sistemas de armazenamento.</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          if (!open) form.reset();
          setIsCreateOpen(open);
        }}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Nova Bateria
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nova Bateria</DialogTitle>
            </DialogHeader>
            <BatteryForm />
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar baterias..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fabricante</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead>Capacidade</TableHead>
              <TableHead>Tensão</TableHead>
              <TableHead>Tecnologia</TableHead>
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
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-16 inline-block" /></TableCell>
                </TableRow>
              ))
            ) : filtered?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhuma bateria encontrada.
                </TableCell>
              </TableRow>
            ) : (
              filtered?.map((bat) => (
                <TableRow key={bat.id}>
                  <TableCell className="font-medium">{bat.fabricante}</TableCell>
                  <TableCell>{bat.nome}</TableCell>
                  <TableCell>{bat.capacidade} kWh</TableCell>
                  <TableCell>{bat.tensao} V</TableCell>
                  <TableCell>{bat.tecnologia}</TableCell>
                  <TableCell className="text-right">
                    <Dialog open={editingBattery?.id === bat.id} onOpenChange={(open) => {
                      if (!open) { setEditingBattery(null); form.reset(); }
                      else openEdit(bat);
                    }}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Editar Bateria</DialogTitle>
                        </DialogHeader>
                        <BatteryForm isEdit />
                      </DialogContent>
                    </Dialog>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(bat.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10">
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
