import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
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
})
