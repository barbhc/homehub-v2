/**
 * Credentials + Firebase clients for the eval harness.
 *
 * Read-only against the live project: the corpus addresses real manuals that
 * real people uploaded, and the eval must never write to their homes. Every
 * artefact this harness produces lands on local disk.
 */
import { initializeApp, cert, getApps } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"
import { readFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export const HERE = dirname(fileURLToPath(import.meta.url))
export const EVAL_DIR = join(HERE, "..")
export const ROOT = join(EVAL_DIR, "..", "..")
/** Downloaded PDFs. Gitignored — a single manual runs to 12MB. */
export const PDF_CACHE = join(EVAL_DIR, ".pdf-cache")

export function readEnvFile(): Record<string, string> {
  const path = join(ROOT, ".env")
  if (!existsSync(path)) return {}
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=")
        // Strip surrounding quotes — a quoted path yields a file that does not exist.
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2")]
      }),
  )
}

export const env = { ...readEnvFile(), ...process.env } as Record<string, string>

/** The Anthropic key, or a clear instruction. Only needed to RUN, not to SCORE. */
export function requireAnthropicKey(): string {
  const key = env.ANTHROPIC_API_KEY
  if (!key) {
    console.error(
      "ANTHROPIC_API_KEY is not set (checked .env and the environment).\n" +
        "Scoring an existing run needs no key: npm run eval:parser -- --offline",
    )
    process.exit(2)
  }
  return key
}

let inited = false
/** Lazily init firebase-admin. Only needed when a PDF is not already cached. */
export function firebase() {
  const saPath = env.GOOGLE_APPLICATION_CREDENTIALS
  if (!saPath || !existsSync(saPath)) {
    console.error(
      `GOOGLE_APPLICATION_CREDENTIALS points at no readable file (${saPath ?? "unset"}).\n` +
        "It is only needed to DOWNLOAD a corpus PDF that is not yet in .pdf-cache/.\n" +
        "Scoring an existing run needs neither: npm run eval:parser -- --offline",
    )
    process.exit(2)
  }
  if (!inited) {
    const sa = JSON.parse(readFileSync(saPath, "utf8"))
    if (getApps().length === 0) {
      initializeApp({ credential: cert(sa), projectId: sa.project_id, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET })
    }
    inited = true
  }
  return { db: getFirestore(), bucket: getStorage().bucket() }
}
