#!/usr/bin/env node
/**
 * Larger Text codemod: px font sizes → rem at the SAME value, plus the 12px floor.
 *
 * Why: a px font size ignores the iPhone's text-size setting. Rem sizes follow
 * the root, and the root grows only when someone raises that setting (see the
 * pre-paint script in index.html and `--type-scale` in src/index.css). At the
 * normal setting the root is the browser default (16px), so every converted
 * size renders exactly as before.
 *
 *   node scripts/design/px-to-rem.mjs            # text-[13px] → text-[0.8125rem]
 *   node scripts/design/px-to-rem.mjs --floor    # then raise sub-floor sizes
 *   add --dry to print without writing
 *
 * The floor (design rule 3): nothing under 12px; an UPPERCASE micro label may be
 * 11px. "Uppercase" is decided the way scripts/design/check_design.py decides it
 * — the word on the same line — so the codemod and the checker agree.
 *
 * The table below IS the mapping (px → rem = px / 16, exact). It lists every px
 * size the app used when the conversion ran; an unlisted size is an error, not
 * a guess.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

export const PX_TO_REM = {
  8: "0.5", 9: "0.5625", 9.5: "0.59375", 10: "0.625", 10.5: "0.65625",
  11: "0.6875", 11.5: "0.71875", 12: "0.75", 12.5: "0.78125", 13: "0.8125",
  13.5: "0.84375", 14: "0.875", 14.5: "0.90625", 15: "0.9375", 16: "1",
  16.5: "1.03125", 17: "1.0625", 18: "1.125", 19: "1.1875", 20: "1.25",
  21: "1.3125", 22: "1.375", 24: "1.5", 25: "1.5625", 26: "1.625",
  27: "1.6875", 28: "1.75", 30: "1.875", 32: "2", 33: "2.0625", 38: "2.375",
  52: "3.25",
}
const REM_TO_PX = Object.fromEntries(Object.entries(PX_TO_REM).map(([px, rem]) => [rem, Number(px)]))

const FLOOR_PX = 12
const MICRO_FLOOR_PX = 11

const root = process.cwd()
const args = new Set(process.argv.slice(2))
const dry = args.has("--dry")
const floor = args.has("--floor")

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (/\.(tsx?|css)$/.test(name)) yield p
  }
}

const PX = /(?<![\w-])text-\[(\d+(?:\.\d+)?)px\]/g
const REM = /(?<![\w-])text-\[(\d*\.?\d+)rem\]/g
const changes = []

for (const file of walk(join(root, "src"))) {
  const before = readFileSync(file, "utf8")
  const lines = before.split("\n")
  const out = lines.map((line, i) => {
    let next = line.replace(PX, (m, px) => {
      const rem = PX_TO_REM[Number(px)]
      if (!rem) throw new Error(`${relative(root, file)}:${i + 1}: no mapping for ${m} — add it to PX_TO_REM`)
      return `text-[${rem}rem]`
    })
    if (floor) {
      const micro = line.includes("uppercase")
      const min = micro ? MICRO_FLOOR_PX : FLOOR_PX
      next = next.replace(REM, (m, rem) => {
        const px = REM_TO_PX[rem] ?? Number(rem) * 16
        if (px >= min) return m
        const to = `text-[${PX_TO_REM[min]}rem]`
        changes.push({ file: relative(root, file), line: i + 1, from: `${px}px`, to: `${min}px`, micro })
        return to
      })
    }
    return next
  })
  const after = out.join("\n")
  if (after !== before && !dry) writeFileSync(file, after)
}

if (floor) {
  for (const c of changes) console.log(`${c.file}:${c.line}\t${c.from} → ${c.to}${c.micro ? "\t(uppercase)" : ""}`)
  console.error(`${changes.length} sizes raised to the floor`)
}
