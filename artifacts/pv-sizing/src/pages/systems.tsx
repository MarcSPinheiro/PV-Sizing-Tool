import { useState } from "react";
import { Link } from "wouter";
import { 
  useListSystems, 
  useListCustomers,
  useListPanels,
  useListInverters,
  useDeleteSystem,
  getListSystemsQueryKey
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
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Trash2, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Systems() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: systems, isLoading: loadingSystems } = useListSystems();
  const { data: customers, isLoading: loadingCustomers } = useListCustomers();
  const { data: panels, isLoading: loadingPanels } = useListPanels();
  const { data: inverters, isLoading: loadingInverters } = useListInverters();
  
  const deleteSystem = useDeleteSystem();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const isLoading = loadingSystems || loadingCustomers || loadingPanels || loadingInverters;

  const handleDelete = (id: number) => {
    if (confirm("Tem a certeza que deseja eliminar este sistema?")) {
      deleteSystem.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListSystemsQueryKey() });
            toast({ title: "Sistema eliminado" });
          },
        }
      );
    }
  };

  const getCustomerName = (id: number) => customers?.find(c => c.id === id)?.nome || `ID: ${id}`;
  const getPanelModel = (id: number) => panels?.find(p => p.id === id)?.nome || `ID: ${id}`;
  const getInverterModel = (id: number) => inverters?.find(i => i.id === id)?.nome || `ID: ${id}`;
  const getPanelPower = (id: number) => panels?.find(p => p.id === id)?.potencia || 0;

  const filteredSystems = systems?.filter(s => {
    const custName = getCustomerName(s.customerId).toLowerCase();
    return custName.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Sistemas PV</h1>
          <p className="text-muted-foreground mt-1">Gira os dimensionamentos efetuados.</p>
        </div>
        <Link href="/sistemas/novo">
          <Button className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Novo Dimensionamento
          </Button>
        </Link>
      </div>

      <div className="flex items-center space-x-2">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar por cliente..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-x-auto border rounded-md bg-card">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Potência Total</TableHead>
              <TableHead>Painéis</TableHead>
              <TableHead>Inversor</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ?(
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-20 inline-block" /></TableCell>
                </TableRow>
              ))
            ) : filteredSystems?.length === 0 ?(
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhum sistema encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filteredSystems?.map((sys) => {
                const totalPowerW = sys.numPaineis * getPanelPower(sys.panelId);
                const totalPowerkW = (totalPowerW / 1000).toFixed(2);
                return (
                  <TableRow key={sys.id}>
                    <TableCell className="font-medium font-mono text-muted-foreground">#{sys.id}</TableCell>
                    <TableCell className="font-medium">{getCustomerName(sys.customerId)}</TableCell>
                    <TableCell>{totalPowerkW} kWp</TableCell>
                    <TableCell>
                      {sys.numPaineis}x {getPanelModel(sys.panelId)}
                      <div className="text-xs text-muted-foreground">
                        {sys.numStrings} string(s) de {sys.paineisporstring} painéis
                      </div>
                    </TableCell>
                    <TableCell>{getInverterModel(sys.inverterId)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Link href={`/sistemas/${sys.id}`}>
                          <Button variant="ghost" size="sm" className="font-medium text-primary hover:text-primary">
                            Abrir <ArrowRight className="ml-1.5 h-4 w-4" />
                          </Button>
                        </Link>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(sys.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                          <Trash2 className="h-4 w-4" />
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
    </div>
  );
}
