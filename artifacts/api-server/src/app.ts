import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import compression from "compression";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";
import { pinoHttp } from "pino-http";
import type { IncomingMessage, ServerResponse } from "node:http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// ── Structured request logging ────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    customLogLevel(_req: IncomingMessage, res: ServerResponse, err: Error | undefined) {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    serializers: {
      req(req: IncomingMessage & { id?: unknown }) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res: ServerResponse) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
    customSuccessMessage(req: IncomingMessage, res: ServerResponse) {
      const time = (res as Response & { responseTime?: number }).responseTime;
      if (time && time > 3000) {
        return `SLOW ${req.method} ${req.url?.split("?")[0]} (${time}ms)`;
      }
      return `${req.method} ${req.url?.split("?")[0]}`;
    },
  }),
);

// ── Core middleware ────────────────────────────────────────────────────────────
app.use(compression());
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── Session middleware (PG-backed) ─────────────────────────────────────────────
const PgStore = connectPgSimple(session);
const sessionSecret = process.env["SESSION_SECRET"];
if (!sessionSecret) {
  throw new Error("SESSION_SECRET environment variable is required");
}
app.set("trust proxy", 1);
app.use(
  session({
    store: new PgStore({
      pool,
      tableName: "session",
      createTableIfMissing: false,
    }),
    name: "sd.sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env["NODE_ENV"] === "production",
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    },
  }),
);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api", router);

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDistCandidates = [
  path.resolve(moduleDir, "../../pv-sizing/dist/public"),
  path.resolve(process.cwd(), "../pv-sizing/dist/public"),
  path.resolve(process.cwd(), "artifacts/pv-sizing/dist/public"),
];
const frontendDist = frontendDistCandidates.find((candidate) =>
  fs.existsSync(path.join(candidate, "index.html")),
);

if (frontendDist) {
  logger.info({ frontendDist }, "Serving PV Sizing frontend");
  app.use(
    express.static(frontendDist, {
      index: false,
      maxAge: "1y",
      immutable: true,
      setHeaders(res, filePath) {
        if (!filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
        }
      },
    }),
  );
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) {
      next();
      return;
    }

    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    res.sendFile(path.join(frontendDist, "index.html"));
  });
} else {
  logger.warn(
    { candidates: frontendDistCandidates },
    "PV Sizing frontend build not found; API-only mode",
  );
}

// ── Global error handler ──────────────────────────────────────────────────────
// Must be last — Express identifies error middleware by 4-arg signature.
// Express 5 forwards async errors automatically.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  // Multer file size / type errors
  if ((err as NodeJS.ErrnoException).code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "Ficheiro demasiado grande. Limite: 10 MB." });
    return;
  }

  const status =
    (err as { status?: number }).status ??
    (err as { statusCode?: number }).statusCode ??
    500;

  req.log?.error({ err, status }, "Unhandled request error");

  if (res.headersSent) return;

  res.status(status).json({
    error:
      process.env["NODE_ENV"] === "production" && status >= 500
        ? "Erro interno do servidor. Por favor tente mais tarde."
        : (err.message ?? "Erro interno"),
  });
});

export default app;
