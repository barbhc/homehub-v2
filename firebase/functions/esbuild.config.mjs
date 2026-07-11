/**
 * Deploy bundler. `firebase deploy` uploads only the firebase/functions dir, but
 * the parse core lives at repo-root shared/parse/ (shared with the client +
 * harness). esbuild bundles the entry into a single dist/index.js, INLINING the
 * relative shared imports while keeping node_modules (firebase-admin/functions,
 * @anthropic-ai/sdk) external — those are reinstalled from package.json on the
 * Cloud Functions runtime. This is what makes the deployed package self-contained.
 *
 * `npm run build` (tsc) still emits lib/ for the emulator worker test; this bundle
 * (`npm run bundle`) is deploy-only and is what firebase.json predeploy runs.
 */
import { build } from "esbuild"

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  // Bare specifiers (node_modules) stay external; only relative imports
  // (../../../../shared/parse/*) are inlined into the bundle.
  packages: "external",
  outfile: "dist/index.js",
  sourcemap: true,
  logLevel: "info",
})
