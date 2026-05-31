import { Router, type IRouter } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { anthropic as defaultAnthropic } from "@workspace/integrations-anthropic-ai";
import { pvgisGet, pvgisSet } from "../lib/pvgis-cache";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const AI_MODEL = process.env.AI_MODEL || "claude-sonnet-4-6";

function getAnthropicClient(req: { get?: (name: string) => string | undefined }) {
  const headerKey = req.get?.("x-anthropic-api-key")?.trim();
  const envKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY?.trim();
  const apiKey = headerKey || envKey;
  const isPlaceholder = !apiKey || apiKey === "local-dev-placeholder";

  if (isPlaceholder) {
    throw Object.assign(
      new Error("Chave Anthropic em falta. Adicione a chave nas definições da empresa."),
      { status: 400 },
    );
  }

  if (headerKey) {
    const AnthropicClient = (defaultAnthropic as unknown as { constructor: new (options: { apiKey: string; baseURL?: string }) => typeof defaultAnthropic }).constructor;
    return new AnthropicClient({
      apiKey: headerKey,
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com",
    });
  }

  return defaultAnthropic;
}

function handleAiError(res: { status: (code: number) => { json: (body: unknown) => void } }, err: unknown, fallback: string) {
  const status = typeof err === "object" && err !== null && "status" in err
    ? Number((err as { status?: unknown }).status)
    : 502;
  const message = err instanceof Error ? err.message : fallback;
  res.status(Number.isFinite(status) ? status : 502).json({ error: message || fallback });
}

// ── File upload (memory, 10 MB, MIME filter) ──────────────────────────────────
const ALLOWED_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        Object.assign(
          new Error("Formato não suportado. Use PDF ou imagem (JPEG, PNG, WebP)."),
          { status: 415 },
        ),
      );
    }
  },
});

// ── Rate limiters ─────────────────────────────────────────────────────────────
const aiLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler(req, res) {
    req.log?.warn({ ip: req.ip }, "AI rate limit exceeded");
    res
      .status(429)
      .json({ error: "Demasiadas chamadas à IA. Aguarde 1 minuto e tente novamente." });
  },
});

const calcLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req, res) {
    res
      .status(429)
      .json({ error: "Demasiadas chamadas. Tente novamente em breve." });
  },
});

// ── Zod schemas ───────────────────────────────────────────────────────────────
const AutoSizeBodySchema = z.object({
  consumoAnual: z.coerce.number().positive("consumoAnual deve ser positivo"),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  inclinacao: z.coerce.number().min(0).max(90).default(30),
  azimute: z.coerce.number().min(-180).max(180).default(0),
  coberturaMeta: z.coerce.number().min(10).max(200).default(80),
  incluirBateria: z
    .union([z.boolean(), z.string().transform((v) => v === "true")])
    .default(false),
  horasAutonomia: z.coerce.number().min(1).max(24).default(4),
  crescimentoFuturo: z.coerce.number().min(0).max(100).default(0),
  percVazio: z.coerce.number().min(0).max(100).default(40),
  percCheio: z.coerce.number().min(0).max(100).default(35),
  percPonta: z.coerce.number().min(0).max(100).default(25),
  precoKwh: z.coerce.number().min(0).max(10).default(0.18),
});

const AutoSizeBodySchemaExt = AutoSizeBodySchema.extend({
  consumoMensalInput: z.array(z.coerce.number()).optional(),
  perfilDiurnoPct: z.coerce.number().min(0).max(100).default(60),
});

const BatterySizeBodySchema = z.object({
  consumoDiario: z.coerce.number().positive("consumoDiario deve ser positivo"),
  percConsumoNoturno: z.coerce.number().min(0).max(100),
  horasAutonomia: z.coerce.number().min(1).max(24).default(4),
  dod: z.coerce.number().min(10).max(100).default(80),
});

// ── Monthly irradiance factors for Portugal (fallback when PVGIS unavailable) ─
const PT_MONTHLY_FACTORS = [
  0.577, 0.721, 0.954, 1.065, 1.243, 1.420, 1.498, 1.376, 1.132, 0.866, 0.621, 0.510,
];
const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH_LABELS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

// ── Hourly simulation helpers (server-side) ───────────────────────────────────

// Normalized solar bell-curve: 6h–20h, peak at 13h, σ = 3h (Portugal)
const SOLAR_FRACS_PT: readonly number[] = (() => {
  const raw = Array.from({ length: 24 }, (_, h) => {
    if (h < 6 || h >= 20) return 0;
    return Math.exp(-((h - 13) ** 2) / (2 * 3 * 3));
  });
  const s = raw.reduce((a: number, b: number) => a + b, 0);
  return raw.map(v => v / s);
})();

function consumoHourlyFracs(diurnoPct: number): readonly number[] {
  const d = Math.max(0, Math.min(100, diurnoPct)) / 100;
  const n = 1 - d;
  return Array.from({ length: 24 }, (_, h) =>
    h >= 7 && h < 22 ? d / 15 : n / 9,
  );
}

function calcAutoconsumoMensal(
  producaoMes: number,
  consumoMes: number,
  perfilDiurnoPct: number,
  m: number,
): number {
  const dias = DAYS_PER_MONTH[m];
  const producaoDia = producaoMes / dias;
  const consumoDia  = consumoMes  / dias;
  const cFracs = consumoHourlyFracs(perfilDiurnoPct);

  let autoconsumo = 0;
  for (let h = 0; h < 24; h++) {
    const solar   = SOLAR_FRACS_PT[h] * producaoDia;
    const consumo = cFracs[h] * consumoDia;
    autoconsumo  += Math.min(solar, consumo);
  }
  return Math.round(autoconsumo * dias);
}

// ── PVGIS fetch helper for auto-size ──────────────────────────────────────────

type PvgisAutoSizeResp = {
  outputs?: {
    monthly?: { fixed?: Array<{ month: number; E_m: number }> };
  };
};

async function fetchPvgisMonthlyKwhPerKwp(
  lat: number,
  lon: number,
  inclinacao: number,
  azimute: number,
): Promise<number[] | null> {
  // azimute 0 = South (from-South convention, same as PVGIS aspect)
  const url =
    `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?` +
    `lat=${lat}&lon=${lon}&peakpower=1&loss=14` +
    `&angle=${inclinacao}&aspect=${azimute}` +
    `&outputformat=json&mountingplace=building`;

  const cached = pvgisGet(url) as PvgisAutoSizeResp | null;
  let data: PvgisAutoSizeResp;

  if (cached) {
    data = cached;
  } else {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 8000);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(tid);
      if (!resp.ok) {
        logger.warn({ pvgisStatus: resp.status }, "PVGIS auto-size: non-OK response");
        return null;
      }
      data = (await resp.json()) as PvgisAutoSizeResp;
      pvgisSet(url, data);
    } catch (err) {
      clearTimeout(tid);
      logger.warn({ err }, "PVGIS auto-size: fetch failed or timed out — using HSP fallback");
      return null;
    }
  }

  const monthly = data.outputs?.monthly?.fixed;
  if (!monthly || monthly.length !== 12) return null;
  // Return monthly kWh per kWp (PVGIS loss=14 already applied)
  return monthly.map(e => e.E_m);
}

// ── Confidence score (server-side) ───────────────────────────────────────────

function buildConfianca(pvgisOk: boolean, mesesDados: number) {
  const avisos: string[] = [];
  let pontuacao = 10;

  if (pvgisOk) {
    pontuacao += 40;
  } else {
    avisos.push("Produção estimada por HSP médio local (PVGIS indisponível).");
  }

  if (mesesDados >= 12) {
    pontuacao += 40;
  } else if (mesesDados >= 3) {
    pontuacao += 20;
    avisos.push(`Perfil de consumo baseado em ${mesesDados} meses de fatura — sazonalidade parcial.`);
  } else {
    pontuacao += 5;
    avisos.push("Consumo mensal uniforme assumido. Carregue faturas para maior precisão.");
  }

  if (!pvgisOk && mesesDados < 3) {
    avisos.push("Estimativa baseada em dados incompletos — resultados indicativos.");
  }

  const nivel: "alto" | "medio" | "baixo" =
    pontuacao >= 70 ? "alto" : pontuacao >= 40 ? "medio" : "baixo";

  return { pontuacao, nivel, pvgis: pvgisOk, avisos };
}

type ImageMime = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const VALID_IMAGE_MIMES: ImageMime[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

function toSafeImageMime(mime: string): ImageMime {
  return VALID_IMAGE_MIMES.includes(mime as ImageMime) ? (mime as ImageMime) : "image/jpeg";
}

function buildFileBlock(isPdf: boolean, mime: string, base64: string) {
  if (isPdf) {
    return {
      type: "document" as const,
      source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 },
    };
  }
  return {
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: toSafeImageMime(mime),
      data: base64,
    },
  };
}

function cleanAiJson(text: string) {
  return text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
}

const InvoiceTextBodySchema = z.object({
  texto: z.string().min(20, "Cole texto da fatura com pelo menos 20 caracteres"),
});

const DatasheetTextBodySchema = z.object({
  tipoEquipamento: z.enum(["painel", "inversor", "bateria"]),
  texto: z.string().min(10, "Indique modelo, fabricante ou especificações"),
});

interface CenarioParams {
  tipo: "conservador" | "equilibrado" | "agressivo";
  coberturaMeta: number;
  consumoAnualAjustado: number;
  hsp: number;
  fatorRendimento: number;
  precoKwh: number;
  custoKwp: number;
  incluirBateria: boolean;
  capacidadeBateriaBase: number | null;
  custoBateria: number;
  // Enhanced engine fields
  pvgisMonthlyKwhPerKwp?: number[];  // 12 values from PVGIS (loss=14 already applied)
  consumoMensalInput?: number[];     // 12 values from invoice data
  perfilDiurnoPct: number;           // daytime consumption % for hourly simulation
}

function buildCenario(p: CenarioParams) {
  const consumoDiario = p.consumoAnualAjustado / 365;

  // Panel sizing (always uses HSP for conservative sizing)
  const energiaAlvoDiaria = consumoDiario * (p.coberturaMeta / 100);
  const potenciaBruta = energiaAlvoDiaria / p.hsp;
  const potenciaMinima = potenciaBruta / p.fatorRendimento;
  const numPaineis = Math.ceil((potenciaMinima * 1000) / 400);
  const potenciaInstalada = Math.round(numPaineis * 400) / 1000;

  // Monthly production: use PVGIS real data if available, else HSP formula
  const fonteProducao: "pvgis" | "estimativa_hsp" = p.pvgisMonthlyKwhPerKwp ? "pvgis" : "estimativa_hsp";
  const producaoMensal = p.pvgisMonthlyKwhPerKwp
    ? p.pvgisMonthlyKwhPerKwp.map(v => Math.round(v * potenciaInstalada))
    : PT_MONTHLY_FACTORS.map((factor, m) =>
        Math.round(potenciaInstalada * p.hsp * factor * DAYS_PER_MONTH[m] * p.fatorRendimento),
      );

  // Monthly consumption: use invoice data if available (12 values), else uniform
  const consumoMensal =
    p.consumoMensalInput?.length === 12
      ? p.consumoMensalInput.map(v => Math.round(v))
      : DAYS_PER_MONTH.map(days => Math.round(consumoDiario * days));

  // Autoconsumo: hourly temporal simulation (replaces simple min(prod, consumo))
  const autoconsumoMensal = producaoMensal.map((prod, m) =>
    calcAutoconsumoMensal(prod, consumoMensal[m], p.perfilDiurnoPct, m),
  );
  const excessoMensal = producaoMensal.map((prod, m) =>
    Math.max(0, prod - autoconsumoMensal[m]),
  );

  const energiaAnualEstimada = producaoMensal.reduce((a, b) => a + b, 0);
  const consumoAnualReal = consumoMensal.reduce((a, b) => a + b, 0);
  const coberturaReal = Math.round((energiaAnualEstimada / consumoAnualReal) * 100);
  const autoconsumoAnual = autoconsumoMensal.reduce((a, b) => a + b, 0);
  const excessoAnual = excessoMensal.reduce((a, b) => a + b, 0);
  const autoconsumoPerc =
    energiaAnualEstimada > 0
      ? Math.round((autoconsumoAnual / energiaAnualEstimada) * 100)
      : 0;

  const investPV = Math.round(potenciaInstalada * p.custoKwp);
  const investBat =
    p.incluirBateria && p.capacidadeBateriaBase
      ? Math.round(p.capacidadeBateriaBase * p.custoBateria)
      : 0;
  const investimentoEstimado = investPV + investBat;
  const poupancaAnual = Math.round(autoconsumoAnual * p.precoKwh * 100) / 100;
  const paybackAnos =
    poupancaAnual > 0
      ? Math.round((investimentoEstimado / poupancaAnual) * 10) / 10
      : 99;

  const META: Record<string, { label: string; descricao: string }> = {
    conservador: {
      label: "Económico",
      descricao: "Menor investimento inicial, melhor autoconsumo relativo e retorno mais rápido",
    },
    equilibrado: {
      label: "Equilibrado",
      descricao: "Bom equilíbrio entre cobertura anual, autoconsumo e retorno financeiro",
    },
    agressivo: {
      label: "Premium",
      descricao: "Máxima cobertura e produção solar — maior investimento, benefícios a longo prazo",
    },
  };

  return {
    tipo: p.tipo,
    label: META[p.tipo].label,
    descricao: META[p.tipo].descricao,
    potenciaInstalada: Math.round(potenciaInstalada * 100) / 100,
    numPaineis,
    energiaAnualEstimada,
    coberturaReal,
    producaoMensal,
    consumoMensal,
    autoconsumoMensal,
    excessoMensal,
    autoconsumoAnual,
    excessoAnual,
    autoconsumoPerc,
    investimentoEstimado,
    poupancaAnual,
    paybackAnos,
    capacidadeBateriaRecomendada: p.incluirBateria ? p.capacidadeBateriaBase : null,
    fonteProducao,
  };
}

type RawCenario = ReturnType<typeof buildCenario>;

function generateAlertas(
  c: RawCenario,
): Array<{ tipo: "info" | "aviso" | "erro"; mensagem: string }> {
  const out: Array<{ tipo: "info" | "aviso" | "erro"; mensagem: string }> = [];
  if (c.coberturaReal < 60) {
    out.push({
      tipo: "aviso",
      mensagem: `Cobertura de ${c.coberturaReal}% — sistema subdimensionado para o consumo indicado.`,
    });
  } else if (c.coberturaReal > 115) {
    out.push({
      tipo: "info",
      mensagem: `Cobertura de ${c.coberturaReal}% — excedente elevado no verão; considere autoconsumo colectivo.`,
    });
  }
  if (c.paybackAnos > 13) {
    out.push({
      tipo: "aviso",
      mensagem: `Retorno em ${c.paybackAnos} anos — verifique subsídios disponíveis (SRP, InvestPortugal).`,
    });
  }
  if (c.potenciaInstalada > 10) {
    out.push({
      tipo: "info",
      mensagem: `Sistema de ${c.potenciaInstalada} kWp pode requerer licenciamento DGEG.`,
    });
  }
  if (c.autoconsumoPerc < 50) {
    out.push({
      tipo: "aviso",
      mensagem: `Autoconsumo de ${c.autoconsumoPerc}% — grande parte da produção é injectada na rede.`,
    });
  }
  if (c.capacidadeBateriaRecomendada && c.capacidadeBateriaRecomendada > 0) {
    out.push({
      tipo: "info",
      mensagem: `Bateria de ${c.capacidadeBateriaRecomendada} kWh recomendada para maximizar autoconsumo nocturno.`,
    });
  }
  return out;
}

// ── POST /tools/parse-invoice ─────────────────────────────────────────────────
router.post(
  "/tools/parse-invoice",
  aiLimiter,
  upload.single("file"),
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "Ficheiro é obrigatório" });
      return;
    }

    const { mimetype, buffer, size } = req.file;
    const isPdf = mimetype === "application/pdf";
    const isImage = mimetype.startsWith("image/");

    if (!isPdf && !isImage) {
      res.status(415).json({ error: "Formato não suportado. Use PDF ou imagem." });
      return;
    }

    req.log.info({ mimetype, size }, "parse-invoice: processing file");

    try {
      const base64 = buffer.toString("base64");
      const contentBlock = buildFileBlock(isPdf, mimetype, base64);

      const message = await getAnthropicClient(req).messages.create({
        model: AI_MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              contentBlock,
              {
                type: "text",
                text: `És um especialista em faturas de eletricidade portuguesas. A tua tarefa principal é extrair dados de consumo, com foco especial no GRÁFICO DE BARRAS DO HISTÓRICO DE CONSUMO.

════════════════════════════════════════
PASSO 1 — LOCALIZA O GRÁFICO DE BARRAS
════════════════════════════════════════
Quase todas as faturas portuguesas (EDP, Endesa, Galp, Iberdrola, BTN, etc.) incluem uma secção visual chamada "Gráfico de consumo mensal" ou "Histórico de consumo". É um gráfico de barras verticais com:
• Eixo X: abreviações dos meses (jan, fev, mar, abr, mai, jun, jul, ago, set, out, nov, dez)
• Eixo Y: valores em kWh (ex: 0, 500, 1000, 1500, 2000, 2500, 3000, 3500)
• Normalmente 12 a 14 barras representando o histórico dos últimos 12-13 meses
• Pode estar na parte inferior ou lateral da fatura

PROCURA este gráfico mesmo que esteja pequeno, em tons de cinza, ou que as barras não tenham rótulos numéricos.

════════════════════════════════════════
PASSO 2 — LÊ O GRÁFICO VISUALMENTE (OBRIGATÓRIO)
════════════════════════════════════════
Se encontrares o gráfico:
1. Identifica a escala do eixo Y: lê os valores marcados (ex: 0, 500, 1000, 1500, 2000, 2500, 3000, 3500)
2. Para cada barra, estima a sua altura como percentagem do valor máximo do eixo Y
3. Calcula o valor em kWh: altura_percentagem × valor_maximo_eixo_Y
4. Exemplo: se o eixo Y vai até 3500 kWh e uma barra atinge ~70% da altura → 3500 × 0,70 = 2450 kWh

REGRA ABSOLUTA: Se vires barras no gráfico, TENS de estimar os valores mesmo sem rótulos. Nunca retornes [] se houver barras visíveis. A precisão não precisa de ser perfeita — uma estimativa razoável é muito melhor do que nenhum dado.

════════════════════════════════════════
PASSO 3 — EXTRAI O JSON
════════════════════════════════════════
Devolve APENAS este JSON (sem texto adicional, sem markdown):

{
  "consumoTotal": kWh total neste período de faturação (não anualizado) ou null,
  "consumoMensal": média mensal em kWh se o período for >1 mês, senão igual a consumoTotal, ou null,
  "consumoAnual": consumo anual em kWh se explicitamente indicado na fatura, senão null,
  "consumoPonta": kWh em horas de ponta (se tarifa bi/tri-horária) ou null,
  "consumoCheio": kWh em horas cheias (se tarifa bi/tri-horária) ou null,
  "consumoVazio": kWh em horas de vazio/super-vazio (se tarifa bi/tri-horária) ou null,
  "potenciaContratada": potência contratada em kVA ou null,
  "precoKwh": preço médio por kWh em EUR (inclui energia + redes + impostos se possível) ou null,
  "operador": nome da comercializadora (ex: "EDP", "Galp", "Endesa", "Iberdrola", "Casa do Povo de Valongo do Vouga") ou null,
  "tarifario": "simples", "bi-horária" ou "tri-horária" ou null,
  "dataInicio": data início do período em formato YYYY-MM-DD ou null,
  "dataFim": data fim do período em formato YYYY-MM-DD ou null,
  "periodoMeses": número de meses cobertos por esta fatura (normalmente 1 ou 2) ou null,
  "leiturasMensais": array de {"mes": "Abr 2024", "consumo": 312} com leituras de texto/tabela (não do gráfico), ou [],
  "historicoMensalGrafico": array com TODOS os meses visíveis no gráfico de barras. Formato: [{"mes": "Fev 2025", "consumo": 2000}, {"mes": "Mar 2025", "consumo": 2500}, ...]. Usa os meses do eixo X e o ano da fatura para construir as datas correctas (o mês mais à direita é o mês actual da fatura; os anteriores são meses anteriores em ordem cronológica). Se não existir NENHUM gráfico de barras, retorna []. NUNCA retornas [] se houver barras visíveis.,
  "mesesNoGrafico": número total de barras/meses visíveis no gráfico (0 apenas se não houver gráfico),
  "consumoAnualGrafico": soma de todos os valores do historicoMensalGrafico se tiver ≥12 entradas; se tiver <12 entradas, calcula (soma ÷ número_meses) × 12; null se não houver gráfico,
  "sazonalidade": "verao_pico" se Jun-Set claramente superior, "inverno_pico" se Nov-Mar claramente superior, "uniforme" se sem variação clara, null se sem dados,
  "confianca": número 0.0 a 1.0 (0.9+ se valores explícitos; 0.6-0.8 se estimados visualmente; reduz se dados contraditórios),
  "notas": descreve brevemente o gráfico encontrado (ex: "Gráfico de consumo mensal com 13 barras, fev 2025 a fev 2026, pico em dez-jan ~3000 kWh") ou null se sem gráfico
}`,
              },
            ],
          },
        ],
      });

      const text =
        message.content[0].type === "text" ? message.content[0].text : "{}";
      const clean = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      const data = JSON.parse(clean);
      res.json(data);
    } catch (err) {
      req.log?.error({ err }, "parse-invoice AI error");
      handleAiError(res, err, "Erro ao processar fatura com IA");
    }
  },
);

// ── POST /tools/auto-size ─────────────────────────────────────────────────────
router.post(
  "/tools/parse-invoice-text",
  aiLimiter,
  async (req, res): Promise<void> => {
    const parsed = InvoiceTextBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join("; ") });
      return;
    }

    try {
      const message = await getAnthropicClient(req).messages.create({
        model: AI_MODEL,
        max_tokens: 1536,
        messages: [
          {
            role: "user",
            content: `És um especialista em faturas de eletricidade portuguesas. Extrai os dados do texto abaixo e devolve APENAS JSON, sem markdown.

Formato obrigatório:
{
  "consumoTotal": number|null,
  "consumoMensal": number|null,
  "consumoAnual": number|null,
  "consumoPonta": number|null,
  "consumoCheio": number|null,
  "consumoVazio": number|null,
  "potenciaContratada": number|null,
  "precoKwh": number|null,
  "operador": string|null,
  "tarifario": "simples"|"bi-horária"|"tri-horária"|null,
  "dataInicio": "YYYY-MM-DD"|null,
  "dataFim": "YYYY-MM-DD"|null,
  "periodoMeses": number|null,
  "leiturasMensais": [],
  "historicoMensalGrafico": [],
  "mesesNoGrafico": 0,
  "consumoAnualGrafico": null,
  "sazonalidade": "verao_pico"|"inverno_pico"|"uniforme"|null,
  "confianca": number,
  "notas": string|null
}

Se só existir valor do período, calcula consumoMensal com base no período. Se houver custo total e kWh, estima precoKwh.

Texto da fatura:
${parsed.data.texto}`,
          },
        ],
      });

      const text = message.content[0].type === "text" ? message.content[0].text : "{}";
      res.json(JSON.parse(cleanAiJson(text)));
    } catch (err) {
      req.log?.error({ err }, "parse-invoice-text AI error");
      handleAiError(res, err, "Erro ao processar texto da fatura com IA");
    }
  },
);

router.post("/tools/auto-size", calcLimiter, async (req, res): Promise<void> => {
  const parsed = AutoSizeBodySchemaExt.safeParse(req.body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    res.status(400).json({ error: `Dados inválidos: ${msg}` });
    return;
  }

  const {
    consumoAnual: consumoAnualBase,
    latitude,
    longitude,
    inclinacao,
    azimute,
    coberturaMeta,
    incluirBateria,
    horasAutonomia,
    crescimentoFuturo,
    percVazio: percVazioInput,
    percCheio: percCheioInput,
    percPonta: percPontaInput,
    precoKwh,
    consumoMensalInput,
    perfilDiurnoPct,
  } = parsed.data;

  const totalTarifa = percVazioInput + percCheioInput + percPontaInput || 100;
  const percVazio = Math.round((percVazioInput / totalTarifa) * 100);
  const percCheio = Math.round((percCheioInput / totalTarifa) * 100);
  const percPonta = 100 - percVazio - percCheio;

  const consumoAnualAjustado = consumoAnualBase * (1 + crescimentoFuturo / 100);
  const consumoDiario = consumoAnualAjustado / 365;

  const latRad = (Math.abs(latitude) * Math.PI) / 180;
  const baseHsp = 5.2 - latRad * 1.8;
  const tiltFactor = 1 - Math.abs(inclinacao - 35) * 0.005;
  const azimuthFactor = 1 - Math.abs(azimute) * 0.003;
  let hsp = Math.max(2.5, baseHsp * tiltFactor * azimuthFactor);

  const margemPerdas = 0.22;
  const fatorRendimento = 1 - margemPerdas;

  let capacidadeBateriaRecomendada: number | null = null;
  if (incluirBateria) {
    const energiaVazioDiaria = consumoDiario * (percVazio / 100);
    const horasVazioWindow = 10;
    const energiaBateriaNeeded =
      energiaVazioDiaria * (horasAutonomia / horasVazioWindow);
    capacidadeBateriaRecomendada = Math.ceil((energiaBateriaNeeded / 0.8) * 2) / 2;
  }

  const custoKwp = 1050;
  const custoBateria = 0; // battery cost not auto-estimated — must be defined by user

  // ── PVGIS real data (async, with 8 s timeout + fallback) ──────────────────
  const pvgisMonthlyKwhPerKwp = await fetchPvgisMonthlyKwhPerKwp(
    latitude, longitude, inclinacao, azimute,
  );
  req.log.info({ pvgisOk: pvgisMonthlyKwhPerKwp !== null }, "auto-size PVGIS fetch");

  // ── Derive HSP from PVGIS data (overrides formula estimate when available) ─
  let hspMensal: number[] | undefined;
  let hspMin: number | undefined;
  let hspMax: number | undefined;

  if (pvgisMonthlyKwhPerKwp) {
    hspMensal = pvgisMonthlyKwhPerKwp.map((e, i) =>
      Math.round((e / DAYS_PER_MONTH[i]) * 100) / 100,
    );
    hspMin = Math.round(Math.min(...hspMensal) * 100) / 100;
    hspMax = Math.round(Math.max(...hspMensal) * 100) / 100;
    const hspPvgisAnual = pvgisMonthlyKwhPerKwp.reduce((a, b) => a + b, 0) / 365;
    hsp = Math.round(hspPvgisAnual * 100) / 100;   // override formula estimate
    req.log.info({ hspPvgisAnual: hsp, hspMin, hspMax }, "PVGIS-derived HSP");
  }

  // ── Validate / normalise optional monthly consumption input ──────────────
  const consumoMensalNorm =
    Array.isArray(consumoMensalInput) && consumoMensalInput.length === 12
      ? consumoMensalInput
      : undefined;
  const mesesDados = consumoMensalNorm ? 12 : 0;

  // ── Confidence score ──────────────────────────────────────────────────────
  const confianca = buildConfianca(pvgisMonthlyKwhPerKwp !== null, mesesDados);

  const coberturaConservador = coberturaMeta * 0.68;
  const coberturaEquilibrado = coberturaMeta * 1.0;
  const coberturaAgressivo = coberturaMeta * 1.35;

  const cenParams = {
    consumoAnualAjustado,
    hsp,
    fatorRendimento,
    precoKwh,
    custoKwp,
    incluirBateria,
    capacidadeBateriaBase: capacidadeBateriaRecomendada,
    custoBateria,
    pvgisMonthlyKwhPerKwp: pvgisMonthlyKwhPerKwp ?? undefined,
    consumoMensalInput: consumoMensalNorm,
    perfilDiurnoPct,
  };

  const cenConservador = buildCenario({
    tipo: "conservador",
    coberturaMeta: coberturaConservador,
    ...cenParams,
  });
  const cenEquilibrado = buildCenario({
    tipo: "equilibrado",
    coberturaMeta: coberturaEquilibrado,
    ...cenParams,
  });
  const cenAgressivo = buildCenario({
    tipo: "agressivo",
    coberturaMeta: coberturaAgressivo,
    ...cenParams,
  });

  const candidates = [cenConservador, cenEquilibrado, cenAgressivo];
  const minCoberturaThreshold = coberturaMeta * 0.6;
  const eligible = candidates.filter(
    (c) => c.coberturaReal >= minCoberturaThreshold,
  );
  const recomendado = (
    eligible.length > 0
      ? eligible.reduce((best, c) =>
          c.paybackAnos < best.paybackAnos ? c : best,
        )
      : cenEquilibrado
  ).tipo;

  const potenciaInstalada = cenEquilibrado.potenciaInstalada;
  const numPaineis = cenEquilibrado.numPaineis;
  const potenciaMinima =
    Math.round(
      (((consumoAnualAjustado / 365) * (coberturaMeta / 100)) /
        hsp /
        fatorRendimento) *
        100,
    ) / 100;
  const energiaAnualEstimada = cenEquilibrado.energiaAnualEstimada;
  const coberturaReal = cenEquilibrado.coberturaReal;
  const potenciaRecomendada = potenciaInstalada;
  const coberturaPrevista = coberturaReal;

  const WATTAGES = [300, 350, 400, 450, 500] as const;
  const cenariosPaineis = WATTAGES.map((wp) => {
    const quantidade = Math.ceil((potenciaMinima * 1000) / wp);
    const potInst = Math.round(quantidade * wp) / 1000;
    const energiaAnual = Math.round(potInst * hsp * 365 * fatorRendimento);
    const coberturaScenario = Math.min(
      100,
      Math.round((energiaAnual / consumoAnualAjustado) * 1000) / 10,
    );
    return {
      potenciaWp: wp,
      quantidade,
      potenciaInstalada: potInst,
      energiaAnual,
      coberturaReal: coberturaScenario,
    };
  });

  const crescimentoTexto =
    crescimentoFuturo > 0
      ? ` (inclui ${crescimentoFuturo}% de crescimento futuro → ${consumoAnualAjustado.toFixed(0)} kWh/ano)`
      : "";
  const tarifaTexto = capacidadeBateriaRecomendada
    ? ` Bateria dimensionada com base em ${percVazio}% de consumo em vazio (período noturno): ${capacidadeBateriaRecomendada} kWh para ${horasAutonomia}h de autonomia.`
    : "";
  const fonteTexto = pvgisMonthlyKwhPerKwp
    ? "Produção calculada com dados reais PVGIS (JRC)."
    : "Produção estimada por HSP médio local (PVGIS indisponível).";
  const explicacao =
    `Consumo base: ${consumoAnualBase.toFixed(0)} kWh/ano${crescimentoTexto} → ${consumoDiario.toFixed(1)} kWh/dia. ` +
    `HSP estimado: ${hsp.toFixed(2)} h/dia. Fator de rendimento: ${(fatorRendimento * 100).toFixed(0)}%. ` +
    `Cenário Equilibrado (${coberturaMeta}% cobertura): ${numPaineis} painéis × 400 Wp = ${potenciaInstalada} kWp instalados, ` +
    `produção anual ${energiaAnualEstimada.toLocaleString("pt-PT")} kWh → cobertura real ${coberturaReal}%. ` +
    `${fonteTexto}` +
    tarifaTexto;

  res.json({
    consumoDiario: Math.round(consumoDiario * 10) / 10,
    consumoAnualAjustado: Math.round(consumoAnualAjustado),
    energiaAlvoDiaria:
      Math.round(
        ((consumoDiario * (coberturaMeta / 100)) * 100) / 100,
      ),
    potenciaBruta:
      Math.round(
        ((consumoDiario * (coberturaMeta / 100)) / hsp) * 100,
      ) / 100,
    margemPerdas,
    fatorRendimento,
    potenciaMinima,
    potenciaInstalada: Math.round(potenciaInstalada * 100) / 100,
    potenciaRecomendada: Math.round(potenciaRecomendada * 100) / 100,
    numPaineis,
    energiaAnualEstimada,
    coberturaPrevista,
    coberturaAlvo: coberturaMeta,
    coberturaReal,
    capacidadeBateriaRecomendada,
    hsp: Math.round(hsp * 100) / 100,
    hspMensal,
    hspMin,
    hspMax,
    percVazio,
    percCheio,
    percPonta,
    cenariosPaineis,
    cenariosDimensionamento: [
      { ...cenConservador, alertas: generateAlertas(cenConservador) },
      { ...cenEquilibrado, alertas: generateAlertas(cenEquilibrado) },
      { ...cenAgressivo,   alertas: generateAlertas(cenAgressivo)   },
    ],
    recomendado,
    explicacao,
    confianca,
    _monthLabels: MONTH_LABELS,
  });
});

// ── POST /tools/battery-size ──────────────────────────────────────────────────
router.post(
  "/tools/battery-size",
  calcLimiter,
  async (req, res): Promise<void> => {
    const parsed = BatterySizeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      res.status(400).json({ error: `Dados inválidos: ${msg}` });
      return;
    }

    const { consumoDiario, percConsumoNoturno, horasAutonomia, dod } =
      parsed.data;

    const energiaNocturna =
      consumoDiario *
      (percConsumoNoturno / 100) *
      (horasAutonomia / (((24 * percConsumoNoturno) / 100) || 1));
    const capacidadeRecomendada = energiaNocturna / (dod / 100);
    const capacidadeUtilizavel = capacidadeRecomendada * (dod / 100);
    const numBaterias = Math.ceil(capacidadeRecomendada / 10);

    const explicacao = `Para um consumo diário de ${consumoDiario.toFixed(1)} kWh com ${percConsumoNoturno}% noturno e autonomia de ${horasAutonomia}h, a energia necessária à noite é ${energiaNocturna.toFixed(1)} kWh. Com profundidade de descarga (DoD) de ${dod}%, recomenda-se uma bateria de ${capacidadeRecomendada.toFixed(1)} kWh (capacidade utilizável: ${capacidadeUtilizavel.toFixed(1)} kWh). Equivale a ${numBaterias} módulo(s) de 10 kWh.`;

    res.json({
      capacidadeRecomendada: Math.round(capacidadeRecomendada * 10) / 10,
      capacidadeUtilizavel: Math.round(capacidadeUtilizavel * 10) / 10,
      energiaNocturna: Math.round(energiaNocturna * 10) / 10,
      numBaterias,
      explicacao,
    });
  },
);

// ── POST /tools/import-datasheet ──────────────────────────────────────────────
router.post(
  "/tools/import-datasheet-text",
  aiLimiter,
  async (req, res): Promise<void> => {
    const parsed = DatasheetTextBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join("; ") });
      return;
    }

    const { tipoEquipamento, texto } = parsed.data;
    const nomeTipo =
      tipoEquipamento === "painel"
        ? "painel solar"
        : tipoEquipamento === "inversor"
          ? "inversor fotovoltaico"
          : "bateria de armazenamento";

    const schemaByType: Record<string, string> = {
      painel: `{"nome":"string","fabricante":"string","potencia":number,"voc":number,"vmp":number,"isc":number,"imp":number,"coeficienteTemperatura":number,"coeficienteTemperaturaVoc":number,"noct":number,"alturaMm":number,"larguraMm":number}`,
      inversor: `{"nome":"string","fabricante":"string","potenciaAc":number,"potenciaDcMax":number,"vdcMax":number,"mpptMin":number,"mpptMax":number,"corrMaxMppt":number,"numMppt":number,"stringsPorMppt":number}`,
      bateria: `{"nome":"string","fabricante":"string","capacidade":number,"tensao":number,"tecnologia":"LiFePO4|Li-ion|AGM|Gel"}`,
    };

    try {
      const message = await getAnthropicClient(req).messages.create({
        model: AI_MODEL,
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: `Analisa estes dados de ${nomeTipo}. Pode ser uma referência curta, texto colado de uma ficha técnica ou uma lista de modelos.

Para cada modelo encontrado, extrai:
${schemaByType[tipoEquipamento]}

Devolve APENAS este JSON:
{
  "modelos": [ <array com um objeto por modelo> ],
  "confianca": <número 0-1>,
  "notas": <string|null>
}

Regras:
- Usa unidades normalizadas: W, V, A, kWh e mm.
- Para inversores, potenciaAc/potenciaDcMax em Watts.
- Se um campo numérico não existir, usa 0.
- Não inventes dados técnicos ausentes; só estima fabricante/modelo quando for evidente pela referência.

Dados:
${texto}`,
          },
        ],
      });

      const text = message.content[0].type === "text" ? message.content[0].text : "{}";
      const result = JSON.parse(cleanAiJson(text)) as {
        modelos?: Record<string, unknown>[];
        confianca?: number;
        notas?: string | null;
      };
      const modelos = Array.isArray(result.modelos) && result.modelos.length > 0
        ? result.modelos
        : [];
      res.json({
        tipoEquipamento,
        modelos,
        dados: modelos[0] ?? {},
        confianca: result.confianca ?? 0.75,
        notas: result.notas ?? null,
      });
    } catch (err) {
      req.log?.error({ err }, "import-datasheet-text AI error");
      handleAiError(res, err, "Erro ao processar texto técnico com IA");
    }
  },
);

router.post(
  "/tools/import-datasheet",
  aiLimiter,
  upload.single("file"),
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "Ficheiro é obrigatório" });
      return;
    }

    const tipoEquipamento = req.body.tipoEquipamento as string;
    if (!["painel", "inversor", "bateria"].includes(tipoEquipamento)) {
      res.status(400).json({
        error: "tipoEquipamento deve ser painel, inversor ou bateria",
      });
      return;
    }

    const { mimetype, buffer, size } = req.file;
    const isPdf = mimetype === "application/pdf";
    const isImage = mimetype.startsWith("image/");
    if (!isPdf && !isImage) {
      res
        .status(415)
        .json({ error: "Formato não suportado. Use PDF ou imagem." });
      return;
    }

    req.log.info({ mimetype, size, tipoEquipamento }, "import-datasheet: processing file");

    const nomeTipo =
      tipoEquipamento === "painel"
        ? "painel solar"
        : tipoEquipamento === "inversor"
          ? "inversor fotovoltaico"
          : "bateria de armazenamento";

    const schemaByType: Record<string, string> = {
      painel: `{"nome":"string","fabricante":"string","potencia":number,"voc":number,"vmp":number,"isc":number,"imp":number,"coeficienteTemperatura":number,"coeficienteTemperaturaVoc":number,"noct":number,"alturaMm":number,"larguraMm":number}`,
      inversor: `{"nome":"string","fabricante":"string","potenciaAc":number,"potenciaDcMax":number,"mpptMin":number,"mpptMax":number,"corrMaxMppt":number,"numMppt":number,"stringsPorMppt":number}`,
      bateria: `{"nome":"string","fabricante":"string","capacidade":number,"tensao":number,"tecnologia":"LiFePO4|Li-ion|AGM|Gel"}`,
    };

    try {
      const base64 = buffer.toString("base64");
      const contentBlock = buildFileBlock(isPdf, mimetype, base64);

      const message = await getAnthropicClient(req).messages.create({
        model: AI_MODEL,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              contentBlock,
              {
                type: "text",
                text: `Analisa esta ficha técnica de ${nomeTipo}.

REGRA FUNDAMENTAL: fichas técnicas frequentemente apresentam VÁRIOS MODELOS em paralelo numa tabela comparativa (uma coluna por modelo). Identifica TODOS os modelos presentes no documento e extrai os dados de cada um individualmente.

Para cada modelo encontrado, extrai os campos no seguinte formato:
${schemaByType[tipoEquipamento]}

Devolve um objeto JSON com EXATAMENTE esta estrutura:
{
  "modelos": [ <array com um objeto por modelo, usando o schema acima> ],
  "confianca": <número 0-1 da confiança geral na extração>,
  "notas": <string com observações, ex. "5 modelos detetados na tabela comparativa da pág. 2"> ou null
}

Instruções importantes:
- Se a tabela tiver colunas por modelo (ex: SUN-14K, SUN-15K, SUN-16K...), cria um registo separado para cada coluna.
- Associa cada valor ao modelo correto — não mistures dados entre modelos.
- Para inversores: potenciaAc e potenciaDcMax em Watts (W), mpptMin/mpptMax em Volts (V), corrMaxMppt em Amperes (A).
- Para painéis: potencia em Watts pico (Wp), tensões em Volts, correntes em Amperes, coeficienteTemperatura e coeficienteTemperaturaVoc em %/°C (valores negativos, ex: -0.35 e -0.28), noct em °C, alturaMm/larguraMm em milímetros.
- Para baterias: capacidade em kWh, tensao em Volts.
- Se um valor não estiver disponível para um modelo, usa 0 (nunca null nos campos numéricos).
- fabricante deve ser o mesmo para todos os modelos da mesma ficha.

Responde APENAS com o JSON pedido, sem texto adicional, sem markdown.`,
              },
            ],
          },
        ],
      });

      const text =
        message.content[0].type === "text" ? message.content[0].text : "{}";
      const clean = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      const parsed = JSON.parse(clean) as {
        modelos?: Record<string, unknown>[];
        confianca?: number;
        notas?: string | null;
      };

      const modelos: Record<string, unknown>[] =
        Array.isArray(parsed.modelos) && parsed.modelos.length > 0
          ? parsed.modelos
          : [parsed as Record<string, unknown>];

      res.json({
        tipoEquipamento,
        modelos,
        dados: modelos[0],
        confianca: parsed.confianca ?? 0.8,
        notas: parsed.notas ?? null,
      });
    } catch (err) {
      req.log?.error({ err }, "import-datasheet AI error");
      handleAiError(res, err, "Erro ao processar ficha técnica com IA");
    }
  },
);

export default router;
