import { Link, useLocation } from "wouter";
import {
  Sun,
  Users,
  LayoutDashboard,
  Menu,
  Layers,
  FolderKanban,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { company, user, logout } = useAuth();
  const brandName = company?.nome ?? "SolarDim";
  const logoUrl = company?.logoUrl ?? null;

  const navItems = [
    { href: "/painel", label: "Painel Principal", icon: LayoutDashboard },
    { href: "/clientes", label: "Clientes", icon: Users },
    { href: "/dimensionamento", label: "Dimensionamento FV", icon: Layers },
    { href: "/estudos", label: "Estudos / Projetos", icon: FolderKanban },
  ];

  const SidebarContent = () => (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="p-6 flex items-center gap-3 border-b border-sidebar-border">
        {logoUrl ? (
          <img src={logoUrl} alt={brandName} className="w-8 h-8 object-contain rounded" />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-sm">
            <Sun size={20} />
          </div>
        )}
        <span className="font-bold text-lg tracking-tight truncate" title={brandName}>{brandName}</span>
      </div>
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} onClick={() => setIsMobileOpen(false)}>
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors cursor-pointer text-sm font-medium",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon size={18} className={cn(isActive ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/50")} />
                {item.label}
              </div>
            </Link>
          );
        })}
        <div className="pt-3 mt-3 border-t border-sidebar-border">
          <Link href="/empresa" onClick={() => setIsMobileOpen(false)}>
            <div className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors cursor-pointer text-sm font-medium",
              location === "/empresa"
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}>
              <Settings size={18} className="text-sidebar-foreground/50" />
              Definições da Empresa
            </div>
          </Link>
        </div>
      </nav>
      <div className="p-4 border-t border-sidebar-border text-xs text-sidebar-foreground/60 space-y-2">
        {user && (
          <div className="space-y-0.5">
            <div className="font-medium text-sidebar-foreground truncate" title={user.nome}>{user.nome}</div>
            <div className="truncate text-[10px]" title={user.email}>{user.email}</div>
          </div>
        )}
        <button onClick={() => { void logout(); }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-sidebar-accent/40 hover:bg-sidebar-accent text-sidebar-foreground text-xs">
          <LogOut size={14} /> Terminar sessão
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-60 flex-col fixed inset-y-0 left-0 z-50 border-r border-sidebar-border shadow-xl">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar & Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-sidebar border-b border-sidebar-border flex items-center px-4 z-40">
        <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-60 border-r-sidebar-border bg-sidebar">
            <SidebarContent />
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2 ml-4">
          {logoUrl ? (
            <img src={logoUrl} alt={brandName} className="w-6 h-6 object-contain rounded" />
          ) : (
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center text-primary-foreground">
              <Sun size={14} />
            </div>
          )}
          <span className="font-bold text-sidebar-foreground truncate max-w-[160px]" title={brandName}>{brandName}</span>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 md:pl-60 pt-14 md:pt-0 min-w-0">
        <div className="px-3 py-4 sm:p-5 md:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
