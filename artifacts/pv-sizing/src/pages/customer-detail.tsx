import { useParams } from "wouter";
import { useGetCustomer, useListSystems, getGetCustomerQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Zap, Euro, Activity, Clock, FileText, Sun } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const customerId = parseInt(id || "0", 10);

  const { data: customer, isLoading: isLoadingCustomer } = useGetCustomer(customerId, {
    query: { enabled: !!customerId, queryKey: getGetCustomerQueryKey(customerId) }
  });

  const { data: systems, isLoading: isLoadingSystems } = useListSystems();

  if (isLoadingCustomer) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!customer) {
    return <div className="text-destructive font-semibold">Cliente não encontrado.</div>;
  }

  const customerSystems = systems?.filter(s => s.customerId === customer.id) || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{customer.nome}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge variant={customer.tipoCliente === "Residencial" ?"default" : customer.tipoCliente === "Comercial" ?"secondary" : "outline"}>
              {customer.tipoCliente}
            </Badge>
            <span className="text-sm text-muted-foreground">Cliente desde {format(new Date(customer.createdAt), "dd/MM/yyyy")}</span>
          </div>
        </div>
        <Link href={`/sistemas/novo?customerId=${customer.id}`}>
          <Button className="w-full sm:w-auto">
            <Zap className="mr-2 h-4 w-4" />
            Novo Sistema PV
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Perfil Técnico e Financeiro
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
              <div className="space-y-1 min-w-0">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5"><MapPin className="h-4 w-4" /> Morada</span>
                <p className="font-medium break-words">{customer.morada}</p>
                <p className="text-xs text-muted-foreground font-mono break-all">{customer.latitude}, {customer.longitude}</p>
              </div>
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5"><Euro className="h-4 w-4" /> Preço Eletricidade</span>
                <p className="font-medium">{customer.precoEletricidade} € / kWh</p>
              </div>
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5"><Zap className="h-4 w-4" /> Potência Contratada</span>
                <p className="font-medium">{customer.potenciaContratada} kVA</p>
              </div>
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5"><Clock className="h-4 w-4" /> Perfil Consumo</span>
                <p className="font-medium">{customer.perfilConsumo}</p>
              </div>
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5"><Activity className="h-4 w-4" /> Consumo Mensal</span>
                <p className="font-medium">{customer.consumoMensal ?`${customer.consumoMensal} kWh` : "Não definido"}</p>
              </div>
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5"><Activity className="h-4 w-4" /> Consumo Anual</span>
                <p className="font-medium">{customer.consumoAnual ?`${customer.consumoAnual} kWh` : "Não definido"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sun className="h-5 w-5 text-primary" />
              Sistemas Associados
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSystems ?(
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : customerSystems.length === 0 ?(
              <div className="text-center py-6 text-muted-foreground">
                <p>Nenhum sistema dimensionado.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {customerSystems.map((sys) => (
                  <Link key={sys.id} href={`/sistemas/${sys.id}`}>
                    <div className="p-3 border rounded-lg hover:border-primary transition-colors cursor-pointer group">
                      <div className="flex flex-wrap justify-between items-center gap-2">
                        <span className="font-medium group-hover:text-primary transition-colors">Sistema #{sys.id}</span>
                        <Badge variant="outline">{sys.numPaineis} painéis</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-2 flex flex-col gap-1 sm:flex-row sm:justify-between">
                        <span>Tilt: {sys.inclinacao}° | Az: {sys.azimute}°</span>
                        <span>{format(new Date(sys.createdAt), "dd/MM/yyyy")}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
