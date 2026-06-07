import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import {
  useListProjects,
  useCreateProject,
  useListCustomers,
  getListProjectsQueryKey,
  type Project,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FolderKanban, Plus, ListChecks, ArrowRight, Loader2, FolderOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const NONE = "__none__";

const newProjectSchema = z.object({
  nome: z.string().min(2, "Introduza um nome para guardar o estudo."),
  customerId: z.coerce.number().int().positive("Selecione um cliente."),
  morada: z.string().nullable().optional(),
});

type NewProjectForm = z.infer<typeof newProjectSchema>;

const STATUS_META: Record<string, { label: string; cls: string }> = {
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
  return `há ${Math.floor(h / 24)} dia(s)`;
}

interface Props {
  onProjectReady: (projectId: number) => void;
}

export default function ProjectEntryCard({ onProjectReady }: Props) {
  const [mode, setMode] = useState<"choose" | "new" | "continue">("choose");
  const { data: projects, isLoading: loadingProjects } = useListProjects();
  const { data: customers } = useListCustomers();
  const create = useCreateProject();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const inProgress = (projects ?? []).filter((p) => p.status === "rascunho" || p.status === "em_analise");
  const mostRecent = inProgress[0];

  const form = useForm<NewProjectForm>({
    resolver: zodResolver(newProjectSchema),
    defaultValues: { nome: "", customerId: undefined as unknown as number, morada: "" },
  });

  const onCreate = (data: NewProjectForm) => {
    const customer = customers?.find((c) => c.id === data.customerId);
    create.mutate(
      {
        data: {
          nome: data.nome,
          customerId: data.customerId,
          morada: data.morada || customer?.morada || null,
          status: "rascunho",
          currentStep: 1,
        },
      },
      {
        onSuccess: (p: Project) => {
          qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          navigate(`${BASE || ""}/dimensionamento?projectId=${p.id}`);
          onProjectReady(p.id);
          window.scrollTo({ top: 0, behavior: "auto" });
        },
        onError: (e) =>
          toast({ title: "Erro ao criar estudo", description: String(e), variant: "destructive" }),
      },
    );
  };

  if (mode === "choose") {
    return (
      <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
        <div className="text-center space-y-2">
          <FolderKanban className="mx-auto h-12 w-12 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Dimensionamento FV</h1>
          <p className="text-muted-foreground">Cada estudo é guardado automaticamente como projeto.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card
            role="button"
            tabIndex={0}
            onClick={() => setMode("new")}
            onKeyDown={(e) => { if (e.key === "Enter") setMode("new"); }}
            className="hover-elevate active-elevate-2 cursor-pointer border-primary/40"
            data-testid="card-new-project"
          >
            <CardHeader>
              <div className="rounded-full bg-primary/10 w-10 h-10 flex items-center justify-center">
                <Plus className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-base mt-2">Novo Projeto</CardTitle>
              <CardDescription>Começar um estudo novo com nome e cliente.</CardDescription>
            </CardHeader>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            onClick={() => inProgress.length > 0 && setMode("continue")}
            onKeyDown={(e) => { if (e.key === "Enter" && inProgress.length > 0) setMode("continue"); }}
            className={`hover-elevate active-elevate-2 cursor-pointer ${inProgress.length === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
            data-testid="card-continue-project"
          >
            <CardHeader>
              <div className="rounded-full bg-blue-100 dark:bg-blue-950 w-10 h-10 flex items-center justify-center">
                <FolderOpen className="h-5 w-5 text-blue-600 dark:text-blue-300" />
              </div>
              <CardTitle className="text-base mt-2 flex items-center gap-2">
                Continuar Projeto
                {inProgress.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-4">{inProgress.length}</Badge>
                )}
              </CardTitle>
              <CardDescription>
                {mostRecent
                  ? <>Último: <strong>{mostRecent.nome}</strong> ({relTime(mostRecent.updatedAt)})</>
                  : "Nenhum estudo em curso."}
              </CardDescription>
            </CardHeader>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            onClick={() => navigate(`${BASE || ""}/estudos`)}
            onKeyDown={(e) => { if (e.key === "Enter") navigate(`${BASE || ""}/estudos`); }}
            className="hover-elevate active-elevate-2 cursor-pointer"
            data-testid="card-list-projects"
          >
            <CardHeader>
              <div className="rounded-full bg-zinc-100 dark:bg-zinc-800 w-10 h-10 flex items-center justify-center">
                <ListChecks className="h-5 w-5" />
              </div>
              <CardTitle className="text-base mt-2">Ver Projetos Guardados</CardTitle>
              <CardDescription>Lista completa com filtros e ações.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  if (mode === "new") {
    return (
      <div className="max-w-xl mx-auto animate-in fade-in duration-300">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" /> Novo Projeto
            </CardTitle>
            <CardDescription>O nome e o cliente são obrigatórios para guardar automaticamente.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onCreate)} className="space-y-4">
                <FormField control={form.control} name="nome" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do Projeto *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ex: Casa Sr. António — Valongo do Vouga"
                        {...field}
                        data-testid="input-project-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="customerId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente *</FormLabel>
                    <Select
                      value={field.value != null ? String(field.value) : NONE}
                      onValueChange={(v) => field.onChange(v === NONE ? undefined : Number(v))}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-project-customer">
                          <SelectValue placeholder="Selecione um cliente…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-[70vh] touch-pan-y">
                        {(customers ?? []).length === 0 && (
                          <SelectItem value={NONE} disabled>— Crie clientes primeiro —</SelectItem>
                        )}
                        {customers?.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="morada" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Morada da instalação</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="(opcional — usa morada do cliente se em branco)"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                  </FormItem>
                )} />

                <p className="text-xs text-muted-foreground border-l-2 border-amber-400 bg-amber-50 dark:bg-amber-950/20 p-2 rounded">
                  Introduza um nome para guardar o estudo. Sem nome não é possível continuar.
                </p>

                <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
                  <Button type="button" variant="outline" onClick={() => setMode("choose")} className="w-full sm:w-auto">Voltar</Button>
                  <Button type="submit" disabled={create.isPending} data-testid="button-create-project" className="w-full sm:w-auto">
                    {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Criar e começar
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // mode === "continue"
  return (
    <div className="max-w-2xl mx-auto animate-in fade-in duration-300">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-blue-600 dark:text-blue-300" /> Continuar Projeto
          </CardTitle>
          <CardDescription>Selecione o estudo a retomar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loadingProjects ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : inProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum estudo em curso.</p>
          ) : (
            inProgress.map((p) => {
              const meta = STATUS_META[p.status] ?? STATUS_META.rascunho;
              return (
                <button
                  key={p.id}
                  onClick={() => onProjectReady(p.id)}
                  className="w-full text-left p-3 rounded-md border hover-elevate active-elevate-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                  data-testid={`button-continue-${p.id}`}
                >
                  <div>
                    <div className="font-medium">{p.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      Passo {p.currentStep}/8 · {relTime(p.lastSavedAt ?? p.updatedAt)}
                    </div>
                  </div>
                  <div className="flex w-full items-center justify-between gap-2 sm:w-auto">
                    <Badge className={meta.cls}>{meta.label}</Badge>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </button>
              );
            })
          )}
          <div className="pt-2">
            <Button type="button" variant="outline" onClick={() => setMode("choose")}>Voltar</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
