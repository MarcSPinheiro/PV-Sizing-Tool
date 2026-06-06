import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useAuth, updateCompany, type Company } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getStoredAnthropicKey, setStoredAnthropicKey } from "@/lib/ai-key";

export default function CompanySettingsPage() {
  const { company, setCompany, refresh } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<Company | null>(company);
  const [anthropicKey, setAnthropicKey] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(company); }, [company]);
  useEffect(() => { setAnthropicKey(getStoredAnthropicKey()); }, []);

  if (!form) return <div className="text-muted-foreground">A carregar…</div>;

  function update<K extends keyof Company>(k: K, v: Company[K]) {
    setForm(f => f ?{ ...f, [k]: v } : f);
  }

  async function onLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Logótipo demasiado grande", description: "Máximo 2 MB.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update("logoUrl", String(reader.result));
    reader.readAsDataURL(file);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const updated = await updateCompany(form);
      setStoredAnthropicKey(anthropicKey);
      setCompany(updated);
      await refresh();
      toast({ title: "Definições guardadas" });
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ?err.message : "Falha ao guardar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Definições da Empresa</h1>
        <p className="text-muted-foreground text-sm">Personalize a sua marca e dados fiscais usados nas propostas.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Dados Fiscais</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2"><Label>Nome</Label>
              <Input value={form.nome} onChange={e => update("nome", e.target.value)} required /></div>
            <div className="space-y-1.5"><Label>NIF</Label>
              <Input value={form.nif ??""} onChange={e => update("nif", e.target.value || null)} /></div>
            <div className="space-y-1.5"><Label>Telefone</Label>
              <Input value={form.telefone ??""} onChange={e => update("telefone", e.target.value || null)} /></div>
            <div className="space-y-1.5 md:col-span-2"><Label>Morada</Label>
              <Input value={form.morada ??""} onChange={e => update("morada", e.target.value || null)} /></div>
            <div className="space-y-1.5"><Label>Email</Label>
              <Input type="email" value={form.email ??""} onChange={e => update("email", e.target.value || null)} /></div>
            <div className="space-y-1.5"><Label>Website</Label>
              <Input value={form.website ??""} onChange={e => update("website", e.target.value || null)} /></div>
            <div className="space-y-1.5 md:col-span-2"><Label>IBAN</Label>
              <Input value={form.iban ??""} onChange={e => update("iban", e.target.value || null)} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Marca</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Logótipo (PNG/JPG, máx. 2 MB)</Label>
              <Input type="file" accept="image/*" onChange={onLogoChange} />
              {form.logoUrl && (
                <div className="mt-2 p-3 border rounded bg-muted/30 inline-block">
                  <img src={form.logoUrl} alt="Logo" className="h-16 object-contain" />
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Cor primária</Label>
                <div className="flex gap-2 items-center">
                  <Input type="color" className="w-16 h-10 p-1" value={form.corPrimaria}
                    onChange={e => update("corPrimaria", e.target.value)} />
                  <Input value={form.corPrimaria} onChange={e => update("corPrimaria", e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5"><Label>Cor secundária</Label>
                <div className="flex gap-2 items-center">
                  <Input type="color" className="w-16 h-10 p-1" value={form.corSecundaria}
                    onChange={e => update("corSecundaria", e.target.value)} />
                  <Input value={form.corSecundaria} onChange={e => update("corSecundaria", e.target.value)} />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Rodapé personalizado da proposta</Label>
              <Textarea value={form.rodapeProposta ??""} rows={3}
                onChange={e => update("rodapeProposta", e.target.value || null)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Inteligência Artificial</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Chave API Anthropic</Label>
              <Input
                type="password"
                value={anthropicKey}
                onChange={e => setAnthropicKey(e.target.value)}
                placeholder="sk-ant-api..."
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Guardada apenas neste navegador. Será usada para analisar faturas e fichas técnicas com IA.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => {
                setStoredAnthropicKey(anthropicKey);
                toast({ title: anthropicKey.trim() ?"Chave de IA guardada" : "Chave de IA removida" });
              }}>
                Guardar chave IA
              </Button>
              <Button type="button" variant="ghost" onClick={() => {
                setAnthropicKey("");
                setStoredAnthropicKey("");
                toast({ title: "Chave de IA removida" });
              }}>
                Remover
              </Button>
            </div>
          </CardContent>
        </Card>
        <Button type="submit" disabled={saving} className="w-full sm:w-auto">{saving ?"A guardar…" : "Guardar alterações"}</Button>
      </form>
    </div>
  );
}
