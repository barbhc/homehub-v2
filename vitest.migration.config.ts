import { defineConfig } from "vitest/config"
import path from "path"

/**
 * The legacy-Storage migration, proven against the emulators
 * (firebase/storage-migration.emu.test.ts; run via `npm run test:migration:emu`).
 *
 * Separate from vitest.config.ts because it needs the Auth, Firestore and
 * Storage emulators and runs in NODE. VITE_USE_EMULATORS makes the app's own
 * Firebase client (src/integrations/firebase) connect to them, so the suite can
 * read migrated files through the real client services as a signed-in member,
 * with storage.rules enforcing — the client pins project demo-homehub, which is
 * why the npm script starts the emulators under that project.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["firebase/storage-migration.emu.test.ts"],
    env: { VITE_USE_EMULATORS: "true" },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
