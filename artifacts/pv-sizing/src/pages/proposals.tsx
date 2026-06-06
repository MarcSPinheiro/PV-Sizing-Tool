import { useState } from "react";
import { useLocation } from "wouter";
import { useListProposals, useDeleteProposal, getListProposalsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Trash2, Eye, FileText, Wand2 } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { ProposalDetail } from "./proposal-detail";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  rascunho: { label: "Rascunho", variant: "secondary" },
  aprovada: { label: "Aprovada", variant: "default" },
  enviada: { label: "Enviada", variant: "outline" },
};

export default function Proposals() {
  const [search, setSearch] = useState("");
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [, navigate] = useLocation();
  const { data: proposals, isLoading } = useListProposals();
  const deleteProposal = useDeleteProposal();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const filtered = proposals?.filter(p =>
    p.titulo.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = (id: number) => {
    if (!confirm("Tem a certeza que deseja eliminar esta proposta?")) return;
    deleteProposal.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProposalsQueryKey() });
        toast({ title: "Proposta eliminada" });
      },
      onError: () => toast({ title: "Erro ao eliminar", variant: "destructive" }),
    });
  };

  if (viewingId !== null) {
    return <ProposalDetail id={viewingId} onBack={() => setViewingId(null)} />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Propostas Técnicas</h1>
          <p className="text-muted-foreground mt-1">Gerir e exportar propostas de sistemas solares.</p>
        </div>
        <Button onClick={() => navigate("/dimensionamento")} className="w-full shrink-0 sm:w-auto">
          <Wand2 size={16} className="mr-2" />
          Nova Proposta (Wizard)
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar propostas..."
          className="pl-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[820px]">
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Potência</TableHead>
                <TableHead>Produção Est.</TableHead>
                <TableHead>Payback</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(4)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(7)].map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <FileText size={36} />
                      <p className="font-medium">Nenhuma proposta encontrada</p>
                      <Button variant="outline" size="sm" onClick={() => navigate("/dimensionamento")}>
                        <Plus size={14} className="mr-1" /> Criar com Wizard
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered?.map(p => {
                  const st = STATUS_LABELS[p.status] ?? { label: p.status, variant: "secondary" as const };
                  return (
                    <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setViewingId(p.id)}>
                      <TableCell className="font-medium">{p.titulo}</TableCell>
                      <TableCell>{p.potenciaRecomendada != null ? `${p.potenciaRecomendada} kWp` : "—"}</TableCell>
                      <TableCell>{p.producaoAnualEstimada != null ? `${Number(p.producaoAnualEstimada).toLocaleString("pt-PT")} kWh` : "—"}</TableCell>
                      <TableCell>{p.payback != null ? `${p.payback} anos` : "—"}</TableCell>
                      <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {format(new Date(p.createdAt), "dd MMM yyyy", { locale: pt })}
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setViewingId(p.id)}>
                            <Eye size={14} />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(p.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
