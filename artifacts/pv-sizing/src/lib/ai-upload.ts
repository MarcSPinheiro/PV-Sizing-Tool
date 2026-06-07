export const AI_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const AI_UPLOAD_TIMEOUT_MS = 90_000;

export function isSupportedAiUpload(file: File) {
  return file.type === "application/pdf" || file.type.startsWith("image/");
}

export function validateAiUpload(file: File) {
  if (!isSupportedAiUpload(file)) {
    throw new Error("Formato não suportado. Use PDF ou imagem.");
  }

  if (file.size > AI_UPLOAD_MAX_BYTES) {
    throw new Error("O ficheiro é demasiado grande. Use um PDF ou imagem até 10 MB.");
  }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = AI_UPLOAD_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: init.signal ?? controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }
}

export function normalizeAiUploadError(err: unknown, fallback: string) {
  if (err instanceof DOMException && err.name === "AbortError") {
    return "A IA demorou demasiado tempo a responder. Tente novamente com um ficheiro mais pequeno ou converta o PDF para imagem.";
  }

  return err instanceof Error ? err.message : fallback;
}
