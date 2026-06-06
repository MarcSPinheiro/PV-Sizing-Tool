import { useGetDashboardSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Sun, Zap, Battery, Boxes, Plus, ArrowRight, TrendingUp } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Legend,
  Label,
} from "recharts";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

const KPI_CONFIG = [
  {
    key: "totalClientes" as const,
    label: "Clientes",
    icon: Users,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/40",
    desc: "clientes registados",
  },
  {
    key: "totalSistemas" as const,
    label: "Sistemas PV",
    icon: Sun,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    desc: "sistemas dimensionados",
  },
  {
    key: "totalPaineis" as const,
    label: "Painéis",
    icon: Boxes,
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-950/40",
    desc: "modelos no catálogo",
  },
  {
    key: "totalInversores" as const,
    label: "Inversores",
    icon: Zap,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-950/40",
    desc: "modelos no catálogo",
  },
  {
    key: "totalBaterias" as const,
    label: "Baterias",
    icon: Battery,
    color: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-50 dark:bg-teal-950/40",
    desc: "modelos no catálogo",
  },
] as const;

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
];

type SummaryRecord = {
  totalClientes: number;
  totalSistemas: number;
  totalPaineis: number;
  totalInversores: number;
  totalBaterias: number;
  clientesPorTipo: { label: string; count: number }[];
};

function KpiCard({
  config,
  value,
  loading,
}: {
  config: (typeof KPI_CONFIG)[number];
  value: number;
  loading: boolean;
}) {
  const Icon = config.icon;
  return (
    <Card className="shadow-sm border-border/60 hover:shadow-md transition-shadow duration-200">
      <CardContent className="pt-5 pb-5 px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
              {config.label}
            </p>
            {loading ? (
              <Skeleton className="h-9 w-16" />
            ) : (
              <p className="text-3xl font-bold tracking-tight text-foreground">
                {value.toLocaleString("pt-PT")}
              </p>
            )}
            <p className="text-xs text-muted-foreground/60 mt-1.5">{config.desc}</p>
          </div>
          <div className={cn("rounded-xl p-2.5 shrink-0", config.bg)}>
            <Icon className={cn("h-5 w-5", config.color)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary();
  const [, navigate] = useLocation();

  const typed = summary as SummaryRecord | undefined;
  const totalClientes =
    typed?.clientesPorTipo?.reduce((acc, t) => acc + t.count, 0) ?? 0;

  const QUICK_ACTIONS = [
    {
      label: "Novo Dimensionamento",
      desc: "Iniciar o wizard passo-a-passo",
      icon: TrendingUp,
      path: "/dimensionamento",
      accent: "text-primary",
    },
    {
      label: "Gerir Clientes",
      desc: "Consultar e editar registos",
      icon: Users,
      path: "/clientes",
      accent: "text-blue-600 dark:text-blue-400",
    },
    {
      label: "Catálogo de Painéis",
      desc: "Painéis disponíveis",
      icon: Boxes,
      path: "/equipamentos/paineis",
      accent: "text-green-600 dark:text-green-400",
    },
    {
      label: "Catálogo de Inversores",
      desc: "Inversores disponíveis",
      icon: Zap,
      path: "/equipamentos/inversores",
      accent: "text-violet-600 dark:text-violet-400",
    },
    {
      label: "Catálogo de Baterias",
      desc: "Baterias disponíveis",
      icon: Battery,
      path: "/equipamentos/baterias",
      accent: "text-teal-600 dark:text-teal-400",
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Painel Principal
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Resumo do catálogo e dimensionamentos registados.
          </p>
        </div>
        <Button
          onClick={() => navigate("/dimensionamento")}
          className="w-full shrink-0 gap-1.5 sm:w-auto sm:self-auto"
        >
          <Plus size={15} /> Novo Dimensionamento
        </Button>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {KPI_CONFIG.map((cfg) => (
          <KpiCard
            key={cfg.key}
            config={cfg}
            value={typed ? typed[cfg.key] : 0}
            loading={isLoading}
          />
        ))}
      </div>

      {/* Charts + Quick Actions */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Donut Chart */}
        <Card className="shadow-sm border-border/60">
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base font-semibold">
                Clientes por Tipo
              </CardTitle>
              {!isLoading && typed && (
                <Badge variant="secondary" className="text-xs font-normal">
                  {totalClientes} total
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              {isLoading ? (
                <div className="h-full flex flex-col items-center justify-center gap-4">
                  <Skeleton className="h-36 w-36 rounded-full" />
                  <div className="flex gap-4">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ) : typed?.clientesPorTipo && typed.clientesPorTipo.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={typed.clientesPorTipo}
                      cx="50%"
                      cy="45%"
                      innerRadius={68}
                      outerRadius={90}
                      paddingAngle={4}
                      dataKey="count"
                      nameKey="label"
                      strokeWidth={0}
                    >
                      {typed.clientesPorTipo.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={CHART_COLORS[index % CHART_COLORS.length]}
                        />
                      ))}
                      <Label
                        content={({ viewBox }) => {
                          if (!viewBox || !("cx" in viewBox)) return null;
                          const { cx, cy } = viewBox as {
                            cx: number;
                            cy: number;
                          };
                          return (
                            <g>
                              <text
                                x={cx}
                                y={cy - 8}
                                textAnchor="middle"
                                fill="currentColor"
                                fontSize={26}
                                fontWeight={700}
                              >
                                {totalClientes}
                              </text>
                              <text
                                x={cx}
                                y={cy + 14}
                                textAnchor="middle"
                                fill="#888"
                                fontSize={11}
                              >
                                clientes
                              </text>
                            </g>
                          );
                        }}
                      />
                    </Pie>
                    <RechartsTooltip
                      formatter={(value: number, name: string) => [
                        `${value} clientes`,
                        name,
                      ]}
                      contentStyle={{
                        borderRadius: "10px",
                        border: "1px solid hsl(var(--border))",
                        boxShadow: "0 4px 12px rgb(0 0 0 / 0.08)",
                        fontSize: 13,
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      iconType="circle"
                      iconSize={8}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
                  <Users className="h-10 w-10 text-muted-foreground/25" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Sem dados disponíveis
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">
                      Registe clientes para ver a distribuição.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate("/clientes")}
                    className="gap-1.5 mt-1"
                  >
                    <Users size={13} /> Gerir Clientes
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="shadow-sm border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              Acções Rápidas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.path}
                  onClick={() => navigate(action.path)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:border-border hover:bg-muted/40 transition-all duration-150 text-left group"
                >
                  <Icon
                    className={cn("h-4 w-4 shrink-0", action.accent)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {action.label}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {action.desc}
                    </p>
                  </div>
                  <ArrowRight
                    size={13}
                    className="text-muted-foreground/30 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all shrink-0"
                  />
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
