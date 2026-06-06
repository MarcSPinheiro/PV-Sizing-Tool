import { useRef } from "react";
import { useGetProposal, useListPanels, useListInverters, useListBatteries } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Download, Sun, Zap, Battery, BarChart3, Calendar, FileText } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { ProposalPDF } from "@/components/proposal-pdf";

interface Props {
  id: number;
  onBack: () => void;
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  rascunho: { label: "Rascunho", variant: "secondary" },
  aprovada: { label: "Aprovada", variant: "default" },
  enviada: { label: "Enviada", variant: "outline" },
};

export function ProposalDetail({ id, onBack }: Props) {
  const { data: proposal, isLoading } = useGetProposal(id);
  const { data: panels } = useListPanels();
  const { data: inverters } = useListInverters();
  const { data: batteries } = useListBatteries();
  const printRef = useRef<HTMLDivElement>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!proposal) {
    return <div className="text-muted-foreground">Proposta não encontrada.</div>;
  }

  const panel = panels?.find(p => p.id === proposal.panelId);
  const inverter = inverters?.find(i => i.id === proposal.inverterId);
  const battery = batteries?.find(b => b.id === proposal.batteryId);
  const st = STATUS_LABELS[proposal.status] ?? { label: proposal.status, variant: "secondary" as const };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft size={18} /></Button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight break-words sm:text-2xl">{proposal.titulo}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <Badge variant={st.variant}>{st.label}</Badge>
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Calendar size={12} />
                {format(new Date(proposal.createdAt), "dd 'de' MMMM 'de' yyyy", { locale: pt })}
              </span>
            </div>
          </div>
        </div>
        <Button onClick={handlePrint} variant="outline" className="w-full sm:w-auto">
          <Download size={16} className="mr-2" /> Exportar / Imprimir
        </Button>
      </div>

      {/* Main content */}
      <div ref={printRef} className="overflow-x-auto">
        <ProposalPDF proposal={proposal} panel={panel} inverter={inverter} battery={battery} />
      </div>
    </div>
  );
}
