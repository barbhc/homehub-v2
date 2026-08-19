import path from 'path'
import { execFileSync } from 'node:child_process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'

/**
 * The build's identity in Sentry. Uploaded source maps are filed under this
 * name, and `Sentry.init` tags every event with the same one — if the two ever
 * disagree, the maps are present but never applied and stack traces stay
 * minified while looking like they should work.
 */
function resolveRelease(fromEnv: string | undefined): string {
  if (fromEnv) return fromEnv
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
  } catch {
    // No git (a tarball build, some CI images). An untagged build is fine —
    // Sentry just cannot map its traces — so this must never fail the build.
    return ''
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Empty prefix: loads NON-VITE_ vars too, so SENTRY_AUTH_TOKEN can live in
  // the same .env as everything else. These are read here in Node and passed
  // only to the plugin — they are never prefixed VITE_, so they cannot reach
  // the client bundle. The auth token is a real secret, unlike the DSN.
  const env = loadEnv(mode, process.cwd(), '')
  const release = resolveRelease(env.SENTRY_RELEASE)
  const authToken = env.SENTRY_AUTH_TOKEN
  const org = env.SENTRY_ORG
  const project = env.SENTRY_PROJECT

  const canUpload = Boolean(authToken && org && project)
  if (mode === 'production' && !canUpload) {
    // Not an error: CI and any clean checkout build without these, and must
    // still succeed. But a production build whose traces will be unreadable
    // should say so rather than look identical to one that works.
    console.warn(
      '[sentry] no SENTRY_AUTH_TOKEN/ORG/PROJECT — source maps will NOT be uploaded, ' +
        'so stack traces in Sentry stay minified.',
    )
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      // Last in the chain: it consumes the emitted maps.
      ...(canUpload
        ? [
            sentryVitePlugin({
              org,
              project,
              authToken,
              release: { name: release },
              sourcemaps: {
                // Upload, then delete. Maps that survive the build are maps
                // that can be deployed, and a published .map hands anyone the
                // original source.
                filesToDeleteAfterUpload: ['dist/**/*.map'],
              },
              telemetry: false,
            }),
          ]
        : []),
    ],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    define: {
      // Read by Sentry.init in src/main.tsx. Must match the `release` handed
      // to the plugin above.
      'import.meta.env.VITE_SENTRY_RELEASE': JSON.stringify(release),
    },
    build: {
      /**
       * "hidden", not true: maps are emitted for upload but NO
       * `//# sourceMappingURL=` comment is appended to the bundles. Browsers
       * therefore never request them, so a map that does linger in dist is not
       * advertised. `**\/*.map` is also excluded from the hosting deploy in
       * firebase.json, and the plugin deletes them after a successful upload —
       * three independent reasons a map cannot reach the public bucket.
       */
      sourcemap: 'hidden',
      rollupOptions: {
        output: {
          /**
           * Split the dependencies that never change away from the app code that
           * changes every deploy.
           *
           * The entry chunk was a single ~1MB file containing React, the Firebase
           * SDK and the whole app, so EVERY web deploy invalidated all of it and
           * each tester re-downloaded the lot. During an active beta — where the
           * point of remote-URL mode is shipping fixes several times a day —
           * that is the same megabyte over cellular again and again.
           *
           * Split out, Firebase and React keep their content hashes across app
           * deploys and stay in the immutable cache (max-age=1y), so a typical
           * fix costs only the app chunk. Total bytes on a genuinely cold cache
           * are unchanged; repeat cold starts are what improve.
           */
          manualChunks: {
            firebase: ["firebase/app", "firebase/auth", "firebase/firestore", "firebase/functions", "firebase/storage"],
            react: ["react", "react-dom", "react-router-dom"],
          },
        },
      },
    },
  }
})
