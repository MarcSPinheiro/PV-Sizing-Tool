import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useListProjects,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useDuplicateProject,
  useListCustomers,
  useListPanels,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";
import type { Project } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, FolderKanban, Play, Copy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const NONE = "__none__";

const projectSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  customerId: z.coerce.number().int().positive().nullable().optional(),
  morada: z.string().nullable().optional(),
  panelId: z.coerce.number().int().positive().nullable().optional(),
  numPaineis: z.coerce.number().int().nonnegative().nullable().optional(),
  potenciaKwp: z.coerce.number().nonnegative().nullable().optional(),
  inclinacao: z.coerce.number().nullable().optional(),
  azimute: z.coerce.number().nullable().optional(),
  orientacao: z.string().nullable().optional(),
  layoutRows: z.coerce.number().int().nonnegative().nullable().optional(),
  layoutCols: z.coerce.number().int().nonnegative().nullable().optional(),
  mountType: z.string().nullable().optional(),
  notas: z.string().nullable().optional(),
});

type ProjectFormValues = z.infer<typeof projectSchema>;

const ORIENTATIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

type StatusKey = "todos" | "rascunho" | "em_analise" | "pronto_proposta" | "finalizado";

const STATUS_META: Record<Exclude<StatusKey, "todos">, { label: string; cls: string }> = {
  rascunho:        { label: "Rascunho",            cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  em_analise:      { label: "Em análise",          cls: "bg-blue-100  text-blue-800  dark:bg-blue-950  dark:text-blue-200" },
  pronto_proposta: { label: "Pronto para proposta", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  finalizado:      { label: "Finalizado",          cls: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200" },
};

function relTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const ms = Date.now() - d.getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d2 = Math.floor(h / 24);
  return `há ${d2} dia${d2 === 1 ? "" : "s"}`;
}

export default function Projects() {
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [filter, setFilter] = useState<StatusKey>("todos");
  const [, navigate] = useLocation();

  const { data: projects, isLoading } = useListProjects();
  const { data: customers } = useListCustomers();
  const { data: panels } = useListPanels();
  const create = useCreateProject();
  const update = useUpdateProject();
  const del = useDeleteProject();
  const duplicate = useDuplicateProject();
  const qc = useQueryClient();
  const { toast } = useToast();

  const filtered = useMemo(() => {
    const list = projects ?? [];
    if (filter === "todos") return list;
    return list.filter((p) => p.status === filter);
  }, [projects, filter]);

  const counts = useMemo(() => {
    const out: Record<StatusKey, number> = {
      todos: 0, rascunho: 0, em_analise: 0, pronto_proposta: 0, finalizado: 0,
    };
    out.todos = projects?.length ?? 0;
    for (const p of projects ?? []) {
      const k = p.status as Exclude<StatusKey, "todos">;
      if (k in out) out[k]++;
    }
    return out;
  }, [projects]);

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      nome: "", customerId: null, morada: "", panelId: null, numPaineis: null,
      potenciaKwp: null, inclinacao: 30, azimute: 180, orientacao: "S",
      layoutRows: null, layoutCols: null, mountType: "triangulos", notas: "",
    },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({
      nome: "", customerId: null, morada: "", panelId: null, numPaineis: null,
      potenciaKwp: null, inclinacao: 30, azimute: 180, orientacao: "S",
      layoutRows: null, layoutCols: null, mountType: "triangulos", notas: "",
    });
    setIsOpen(true);
  };

  const openEdit = (p: Project) => {
    setEditing(p);
    form.reset({
      nome: p.nome,
      customerId: p.customerId,
      morada: p.morada ?? "",
      panelId: p.panelId,
      numPaineis: p.numPaineis,
      potenciaKwp: p.potenciaKwp,
      inclinacao: p.inclinacao,
      azimute: p.azimute,
      orientacao: p.orientacao ?? "S",
      layoutRows: p.layoutRows,
      layoutCols: p.layoutCols,
      mountType: p.mountType ?? "triangulos",
      notas: p.notas ?? "",
    });
    setIsOpen(true);
  };

  const onSubmit = (data: ProjectFormValues) => {
    const payload = {
      ...data,
      morada: data.morada || null,
      orientacao: data.orientacao || null,
      mountType: data.mountType || null,
      notas: data.notas || null,
    };
    if (editing) {
      update.mutate(
        { id: editing.id, data: payload },
        {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
            toast({ title: "Estudo atualizado" });
            setIsOpen(false);
          },
          onError: (e) => toast({ title: "Erro", description: String(e), variant: "destructive" }),
        },
      );
    } else {
      create.mutate(
        { data: payload },
        {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
            toast({ title: "Estudo criado" });
            setIsOpen(false);
          },
          onError: (e) => toast({ title: "Erro", description: String(e), variant: "destructive" }),
        },
      );
    }
  };

  const onDelete = (p: Project) => {
    if (!confirm(`Eliminar o estudo «${p.nome}»? Esta ação não pode ser revertida.`)) return;
    del.mutate(
      { id: p.id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          toast({ title: "Estudo eliminado" });
        },
      },
    );
  };

  const onContinue = (p: Project) => {
    navigate(`${BASE || ""}/dimensionamento?projectId=${p.id}`);
  };

  const onDuplicate = (p: Project) => {
    duplicate.mutate(
      { id: p.id },
      {
        onSuccess: (copy: Project) => {
          qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          toast({ title: "Estudo duplicado", description: `«${copy.nome}» criado.` });
        },
        onError: (e) => toast({ title: "Erro ao duplicar", description: String(e), variant: "destructive" }),
      },
    );
  };

  const customerName = (id: number | null) =>
    customers?.find((c) => c.id === id)?.nome ?? "—";
  const panelName = (id: number | null) =>
    panels?.find((p) => p.id === id)?.nome ?? "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FolderKanban className="text-primary" />
            Estudos / Projetos
          </h1>
          <p className="text-muted-foreground text-sm">
            Todos os estudos do dimensionamento, com estado e auto-save persistente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => navigate(`${BASE || ""}/dimensionamento`)} data-testid="button-new-wizard" className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" /> Novo Estudo (Wizard)
          </Button>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" onClick={openCreate} data-testid="button-new-project" className="w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" /> Manual
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar Estudo" : "Novo Estudo (Manual)"}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField control={form.control} name="nome" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome do estudo *</FormLabel>
                      <FormControl><Input {...field} placeholder="Ex: Casa Silva — Telhado Sul" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <FormField control={form.control} name="customerId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cliente</FormLabel>
                        <Select
                          value={field.value != null ? String(field.value) : NONE}
                          onValueChange={(v) => field.onChange(v === NONE ? null : Number(v))}
                        >
                          <FormControl><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value={NONE}>— Sem cliente —</SelectItem>
                            {customers?.map((c) => (
                              <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="morada" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Morada</FormLabel>
                        <FormControl><Input {...field} value={field.value ?? ""} /></FormControl>
                      </FormItem>
                    )} />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <FormField control={form.control} name="panelId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Painel</FormLabel>
                        <Select
                          value={field.value != null ? String(field.value) : NONE}
                          onValueChange={(v) => field.onChange(v === NONE ? null : Number(v))}
                        >
                          <FormControl><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value={NONE}>— Sem painel —</SelectItem>
                            {panels?.map((p) => (
                              <SelectItem key={p.id} value={String(p.id)}>
                                {p.fabricante} {p.nome} ({p.potencia}W)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="numPaineis" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nº Painéis</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))} />
                        </FormControl>
                      </FormItem>
                    )} />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <FormField control={form.control} name="potenciaKwp" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Potência (kWp)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))} />
                        </FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="inclinacao" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Inclinação (°)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.1" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))} />
                        </FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="azimute" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Azimute (°)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.1" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))} />
                        </FormControl>
                      </FormItem>
                    )} />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <FormField control={form.control} name="orientacao" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Orientação</FormLabel>
                        <Select value={field.value ?? "S"} onValueChange={field.onChange}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            {ORIENTATIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="layoutRows" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fileiras</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))} />
                        </FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="layoutCols" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Colunas</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))} />
                        </FormControl>
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="mountType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Estrutura</FormLabel>
                      <Select value={field.value ?? "triangulos"} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="triangulos">Triângulos</SelectItem>
                          <SelectItem value="coplanar">Coplanar (telhado)</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="notas" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notas</FormLabel>
                      <FormControl><Textarea rows={3} {...field} value={field.value ?? ""} /></FormControl>
                    </FormItem>
                  )} />

                  <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                    <Button type="button" variant="outline" onClick={() => setIsOpen(false)} className="w-full sm:w-auto">Cancelar</Button>
                    <Button type="submit" disabled={create.isPending || update.isPending} className="w-full sm:w-auto">
                      {editing ? "Atualizar" : "Criar"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as StatusKey)}>
        <TabsList className="grid w-full grid-cols-3 sm:w-auto">
          <TabsTrigger value="todos">Todos ({counts.todos})</TabsTrigger>
          <TabsTrigger value="rascunho">Rascunho ({counts.rascunho})</TabsTrigger>
          <TabsTrigger value="em_analise">Em análise ({counts.em_analise})</TabsTrigger>
          <TabsTrigger value="pronto_proposta">Pronto ({counts.pronto_proposta})</TabsTrigger>
          <TabsTrigger value="finalizado">Finalizado ({counts.finalizado})</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <Skeleton className="h-60 w-full" />
      ) : filtered.length > 0 ? (
        <div className="border rounded-lg bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Projeto</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Potência FV</TableHead>
                <TableHead>Última alteração</TableHead>
                <TableHead className="w-[160px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const meta = STATUS_META[(p.status as Exclude<StatusKey, "todos">) ?? "rascunho"] ?? STATUS_META.rascunho;
                const last = p.lastSavedAt ?? p.updatedAt;
                return (
                  <TableRow key={p.id} data-testid={`row-project-${p.id}`}>
                    <TableCell>
                      <div className="font-medium">{p.nome}</div>
                      <div className="text-xs text-muted-foreground">Painel: {panelName(p.panelId)}</div>
                    </TableCell>
                    <TableCell>{customerName(p.customerId)}</TableCell>
                    <TableCell>
                      <Badge className={meta.cls}>{meta.label}</Badge>
                      {p.currentStep > 1 && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">Passo {p.currentStep}/8</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.potenciaKwp != null
                        ? <Badge variant="secondary">{p.potenciaKwp.toFixed(2)} kWp</Badge>
                        : <span className="text-muted-foreground text-xs">—</span>}
                      {p.numPaineis != null && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">{p.numPaineis} painéis</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{relTime(last)}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button variant="default" size="sm" onClick={() => onContinue(p)} data-testid={`button-continue-${p.id}`}>
                          <Play className="h-3.5 w-3.5 mr-1" /> Continuar
                        </Button>
                        <Button
                          variant="ghost" size="icon" title="Duplicar"
                          onClick={() => onDuplicate(p)} disabled={duplicate.isPending}
                          data-testid={`button-duplicate-${p.id}`}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Editar dados manuais" onClick={() => openEdit(p)} data-testid={`button-edit-${p.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Eliminar" onClick={() => onDelete(p)} data-testid={`button-delete-${p.id}`}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="border rounded-lg bg-card p-12 text-center text-muted-foreground">
          <FolderKanban className="mx-auto h-12 w-12 mb-3 opacity-50" />
          <p>
            {filter === "todos"
              ? "Ainda não existem estudos. Comece um novo a partir do Dimensionamento."
              : "Nenhum estudo neste estado."}
          </p>
        </div>
      )}
    </div>
  );
}
