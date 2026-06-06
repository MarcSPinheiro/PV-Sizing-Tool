import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { 
  useListCustomers, 
  useCreateCustomer, 
  useUpdateCustomer, 
  useDeleteCustomer,
  getListCustomersQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Customer, CreateCustomerBodyTipoCliente, CreateCustomerBodyPerfilConsumo } from "@workspace/api-client-react";

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
import { LocateFixed, Plus, Pencil, Trash2, Search, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const customerSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  morada: z.string().min(1, "Morada é obrigatória"),
  codigoPostal: z.string().optional(),
  localidade: z.string().optional(),
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  tipoCliente: z.enum(["Residencial", "Comercial", "Industrial"]),
  precoEletricidade: z.coerce.number().min(0),
  potenciaContratada: z.coerce.number().min(0),
  perfilConsumo: z.enum(["Diurno", "Noturno", "Personalizado"]),
  consumoMensal: z.coerce.number().nullable().optional(),
  consumoAnual: z.coerce.number().nullable().optional(),
});

type CustomerFormValues = z.infer<typeof customerSchema>;

export default function Customers() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const { data: customers, isLoading } = useListCustomers();
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      nome: "",
      morada: "",
      codigoPostal: "",
      localidade: "",
      latitude: 38.7223, // Lisbon default
      longitude: -9.1393,
      tipoCliente: "Residencial",
      precoEletricidade: 0.16,
      potenciaContratada: 6.9,
      perfilConsumo: "Diurno",
      consumoMensal: null,
      consumoAnual: null,
    },
  });

  const toCustomerPayload = (data: CustomerFormValues) => {
    const { codigoPostal, localidade, ...payload } = data;
    const trimmedPostal = codigoPostal?.trim();
    const trimmedLocalidade = localidade?.trim();
    const locationParts = [trimmedPostal, trimmedLocalidade].filter(Boolean);
    const suffix = locationParts.join(" ");
    return {
      ...payload,
      morada:
        suffix && !payload.morada.toLowerCase().includes(suffix.toLowerCase())
          ? `${payload.morada}, ${suffix}`
          : payload.morada,
    };
  };

  const extractPostalCode = (morada: string) => morada.match(/\b\d{4}-\d{3}\b/)?.[0] ?? "";

  const extractLocalidade = (morada: string) => {
    const postal = extractPostalCode(morada);
    if (!postal) return "";
    const afterPostal = morada.slice(morada.indexOf(postal) + postal.length).replace(/^[,\s-]+/, "");
    return afterPostal.split(",")[0]?.trim() ?? "";
  };

  const updateCoordinatesFromAddress = async () => {
    const codigoPostal = form.getValues("codigoPostal")?.trim();
    const localidade = form.getValues("localidade")?.trim();

    if (!codigoPostal && !localidade) {
      toast({
        title: "Indique o código postal ou a localidade",
        variant: "destructive",
      });
      return;
    }

    setIsLocating(true);
    try {
      const structured = new URLSearchParams({
        format: "json",
        limit: "1",
        countrycodes: "pt",
        country: "Portugal",
      });
      if (codigoPostal) structured.set("postalcode", codigoPostal);
      if (localidade) structured.set("city", localidade);

      const query = [codigoPostal, localidade, "Portugal"].filter(Boolean).join(", ");
      const fallback = new URLSearchParams({
        format: "json",
        limit: "1",
        countrycodes: "pt",
        q: query,
      });

      let response = await fetch(`https://nominatim.openstreetmap.org/search?${structured.toString()}`);
      let results: Array<{ lat: string; lon: string; display_name?: string }> = await response.json();
      if (!response.ok || results.length === 0) {
        response = await fetch(`https://nominatim.openstreetmap.org/search?${fallback.toString()}`);
        results = await response.json();
      }

      if (!response.ok || results.length === 0) {
        throw new Error("Location not found");
      }

      const latitude = Number.parseFloat(results[0].lat);
      const longitude = Number.parseFloat(results[0].lon);

      form.setValue("latitude", Number(latitude.toFixed(6)), { shouldDirty: true, shouldValidate: true });
      form.setValue("longitude", Number(longitude.toFixed(6)), { shouldDirty: true, shouldValidate: true });

      toast({
        title: "Coordenadas atualizadas",
        description: results[0].display_name,
      });
    } catch {
      toast({
        title: "Não foi possível encontrar essa localização",
        description: "Confirme a localidade e o código postal.",
        variant: "destructive",
      });
    } finally {
      setIsLocating(false);
    }
  };

  const onSubmit = (data: CustomerFormValues) => {
    const payload = toCustomerPayload(data);
    if (editingCustomer) {
      updateCustomer.mutate(
        { id: editingCustomer.id, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
            toast({ title: "Cliente atualizado com sucesso" });
            setEditingCustomer(null);
            form.reset();
          },
        }
      );
    } else {
      createCustomer.mutate(
        { data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
            toast({ title: "Cliente criado com sucesso" });
            setIsCreateOpen(false);
            form.reset();
          },
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem a certeza que deseja eliminar este cliente?")) {
      deleteCustomer.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
            toast({ title: "Cliente eliminado" });
          },
        }
      );
    }
  };

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    form.reset({
      nome: customer.nome,
      morada: customer.morada,
      codigoPostal: extractPostalCode(customer.morada),
      localidade: extractLocalidade(customer.morada),
      latitude: customer.latitude,
      longitude: customer.longitude,
      tipoCliente: customer.tipoCliente as "Residencial" | "Comercial" | "Industrial",
      precoEletricidade: customer.precoEletricidade,
      potenciaContratada: customer.potenciaContratada,
      perfilConsumo: customer.perfilConsumo as "Diurno" | "Noturno" | "Personalizado",
      consumoMensal: customer.consumoMensal,
      consumoAnual: customer.consumoAnual,
    });
  };

  const filtered = customers?.filter(p => 
    p.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.morada.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground mt-1">Gira os perfis de consumo e dados dos clientes.</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          if (!open) form.reset();
          setIsCreateOpen(open);
        }}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Novo Cliente
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Novo Cliente</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField control={form.control} name="nome" render={({ field }) => (
                    <FormItem className="sm:col-span-2"><FormLabel>Nome / Empresa</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="morada" render={({ field }) => (
                    <FormItem className="sm:col-span-2"><FormLabel>Morada Completa</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="codigoPostal" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Código postal</FormLabel>
                      <FormControl><Input placeholder="0000-000" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="localidade" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Localidade</FormLabel>
                      <FormControl><Input placeholder="Ex.: São Pedro do Sul" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="flex items-end sm:col-span-2">
                    <Button type="button" variant="outline" className="w-full" onClick={updateCoordinatesFromAddress} disabled={isLocating}>
                      <LocateFixed className="mr-2 h-4 w-4" />
                      {isLocating ? "A localizar..." : "Atualizar coordenadas"}
                    </Button>
                  </div>
                  <FormField control={form.control} name="latitude" render={({ field }) => (
                    <FormItem><FormLabel>Latitude</FormLabel><FormControl><Input type="number" step="0.000001" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="longitude" render={({ field }) => (
                    <FormItem><FormLabel>Longitude</FormLabel><FormControl><Input type="number" step="0.000001" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  
                  <FormField control={form.control} name="tipoCliente" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Cliente</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="Residencial">Residencial</SelectItem>
                          <SelectItem value="Comercial">Comercial</SelectItem>
                          <SelectItem value="Industrial">Industrial</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="perfilConsumo" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Perfil de Consumo</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Selecione o perfil" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="Diurno">Diurno</SelectItem>
                          <SelectItem value="Noturno">Noturno</SelectItem>
                          <SelectItem value="Personalizado">Personalizado</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="precoEletricidade" render={({ field }) => (
                    <FormItem><FormLabel>Preço Energia (€/kWh)</FormLabel><FormControl><Input type="number" step="0.001" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="potenciaContratada" render={({ field }) => (
                    <FormItem><FormLabel>Potência Contratada (kVA)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  
                  <FormField control={form.control} name="consumoMensal" render={({ field: { value, ...rest } }) => (
                    <FormItem><FormLabel>Consumo Mensal Est. (kWh)</FormLabel><FormControl><Input type="number" value={value || ""} {...rest} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="consumoAnual" render={({ field: { value, ...rest } }) => (
                    <FormItem><FormLabel>Consumo Anual Est. (kWh)</FormLabel><FormControl><Input type="number" value={value || ""} {...rest} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={createCustomer.isPending} className="w-full sm:w-auto">
                    {createCustomer.isPending ?"A guardar..." : "Guardar Cliente"}
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
            placeholder="Pesquisar clientes..."
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
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Morada</TableHead>
              <TableHead>Potência Contratada</TableHead>
              <TableHead>Preço Energia</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ?(
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-24 inline-block" /></TableCell>
                </TableRow>
              ))
            ) : filtered?.length === 0 ?(
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhum cliente encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filtered?.map((cust) => (
                <TableRow key={cust.id}>
                  <TableCell className="font-medium">{cust.nome}</TableCell>
                  <TableCell>
                    <Badge variant={cust.tipoCliente === "Residencial" ?"default" : cust.tipoCliente === "Comercial" ?"secondary" : "outline"}>
                      {cust.tipoCliente}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate" title={cust.morada}>{cust.morada}</TableCell>
                  <TableCell>{cust.potenciaContratada} kVA</TableCell>
                  <TableCell>{cust.precoEletricidade} €/kWh</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Link href={`/clientes/${cust.id}`}>
                        <Button variant="ghost" size="icon" title="Ver detalhes">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Dialog open={editingCustomer?.id === cust.id} onOpenChange={(open) => {
                        if (!open) { setEditingCustomer(null); form.reset(); }
                        else openEdit(cust);
                      }}>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon" title="Editar">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Editar Cliente</DialogTitle>
                          </DialogHeader>
                          <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <FormField control={form.control} name="nome" render={({ field }) => (
                                  <FormItem className="sm:col-span-2"><FormLabel>Nome / Empresa</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                                <FormField control={form.control} name="morada" render={({ field }) => (
                                  <FormItem className="sm:col-span-2"><FormLabel>Morada Completa</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                                <FormField control={form.control} name="codigoPostal" render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Código postal</FormLabel>
                                    <FormControl><Input placeholder="0000-000" {...field} value={field.value ?? ""} /></FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )} />
                                <FormField control={form.control} name="localidade" render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Localidade</FormLabel>
                                    <FormControl><Input placeholder="Ex.: São Pedro do Sul" {...field} value={field.value ?? ""} /></FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )} />
                                <div className="flex items-end sm:col-span-2">
                                  <Button type="button" variant="outline" className="w-full" onClick={updateCoordinatesFromAddress} disabled={isLocating}>
                                    <LocateFixed className="mr-2 h-4 w-4" />
                                    {isLocating ? "A localizar..." : "Atualizar coordenadas"}
                                  </Button>
                                </div>
                                <FormField control={form.control} name="latitude" render={({ field }) => (
                                  <FormItem><FormLabel>Latitude</FormLabel><FormControl><Input type="number" step="0.000001" {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                                <FormField control={form.control} name="longitude" render={({ field }) => (
                                  <FormItem><FormLabel>Longitude</FormLabel><FormControl><Input type="number" step="0.000001" {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                                
                                <FormField control={form.control} name="tipoCliente" render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Tipo de Cliente</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                      <FormControl><SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger></FormControl>
                                      <SelectContent>
                                        <SelectItem value="Residencial">Residencial</SelectItem>
                                        <SelectItem value="Comercial">Comercial</SelectItem>
                                        <SelectItem value="Industrial">Industrial</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )} />

                                <FormField control={form.control} name="perfilConsumo" render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Perfil de Consumo</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                      <FormControl><SelectTrigger><SelectValue placeholder="Selecione o perfil" /></SelectTrigger></FormControl>
                                      <SelectContent>
                                        <SelectItem value="Diurno">Diurno</SelectItem>
                                        <SelectItem value="Noturno">Noturno</SelectItem>
                                        <SelectItem value="Personalizado">Personalizado</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )} />

                                <FormField control={form.control} name="precoEletricidade" render={({ field }) => (
                                  <FormItem><FormLabel>Preço Energia (€/kWh)</FormLabel><FormControl><Input type="number" step="0.001" {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                                <FormField control={form.control} name="potenciaContratada" render={({ field }) => (
                                  <FormItem><FormLabel>Potência Contratada (kVA)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                                
                                <FormField control={form.control} name="consumoMensal" render={({ field: { value, ...rest } }) => (
                                  <FormItem><FormLabel>Consumo Mensal Est. (kWh)</FormLabel><FormControl><Input type="number" value={value || ""} {...rest} /></FormControl><FormMessage /></FormItem>
                                )} />
                                <FormField control={form.control} name="consumoAnual" render={({ field: { value, ...rest } }) => (
                                  <FormItem><FormLabel>Consumo Anual Est. (kWh)</FormLabel><FormControl><Input type="number" value={value || ""} {...rest} /></FormControl><FormMessage /></FormItem>
                                )} />
                              </div>
                              <div className="flex justify-end">
                                <Button type="submit" disabled={updateCustomer.isPending} className="w-full sm:w-auto">
                                  {updateCustomer.isPending ?"A atualizar..." : "Atualizar Cliente"}
                                </Button>
                              </div>
                            </form>
                          </Form>
                        </DialogContent>
                      </Dialog>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(cust.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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
