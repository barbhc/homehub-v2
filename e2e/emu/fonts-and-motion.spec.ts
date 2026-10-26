import { test, expect, type Page } from "@playwright/test"

/**
 * Apple polish, Phase 1 foundation: self-hosted fonts and Reduce Motion.
 *
 * Plain @playwright/test, NOT e2e/fixtures: that fixture zeroes every animation
 * and transition duration, which would make "the spinner still spins" pass or
 * fail for the wrong reason.
 */

const INTER_WEIGHTS = [400, 500, 600, 700, 800]
const DISPLAY_WEIGHTS = [400, 600, 700, 800]

async function openHome(page: Page) {
  await page.goto("/home")
  await expect(page.getByRole("navigation").first()).toBeVisible({ timeout: 20_000 })
}

test.describe("self-hosted fonts", () => {
  test("no Google Fonts request; every weight in use loads from our own origin", async ({ page }) => {
    const google: string[] = []
    const fontFiles: string[] = []
    page.on("request", (req) => {
      const url = req.url()
      if (/fonts\.(googleapis|gstatic)\.com/.test(url)) google.push(url)
      if (/\.woff2?(\?|$)/.test(url)) fontFiles.push(url)
    })

    await openHome(page)

    // document.fonts.check() alone is not proof: it returns true when NO face
    // matches the family at all. load() returns the faces it actually loaded,
    // so an empty array means the weight is missing.
    const loaded = await page.evaluate(
      async ({ inter, display }) => {
        const out: Record<string, { faces: number; check: boolean }> = {}
        for (const [family, weights] of [["Inter", inter], ["Plus Jakarta Sans", display]] as const) {
          for (const w of weights) {
            const spec = `${w} 16px "${family}"`
            const faces = await document.fonts.load(spec)
            out[`${family} ${w}`] = { faces: faces.filter((f) => f.status === "loaded").length, check: document.fonts.check(spec) }
          }
        }
        return out
      },
      { inter: INTER_WEIGHTS, display: DISPLAY_WEIGHTS },
    )
    for (const [face, r] of Object.entries(loaded)) {
      expect(r.faces, `${face} has a loaded face`).toBeGreaterThan(0)
      expect(r.check, `${face} passes document.fonts.check`).toBe(true)
    }

    expect(google, "requests to Google Fonts").toEqual([])
    const origin = new URL(page.url()).origin
    expect(fontFiles.length, "font files were fetched").toBeGreaterThan(0)
    for (const url of fontFiles) expect(url.startsWith(origin), `${url} is same-origin`).toBe(true)
  })
})

/**
 * Mount probe elements carrying the real utility classes and read their
 * computed motion. The classes are the app's own compiled CSS (skeleton.tsx,
 * ItemDetailPage and WarrantiesPage use animate-pulse; 60 call sites use
 * animate-spin), so the computed style is exactly what a rendered skeleton or
 * spinner gets — without racing a loading state that lasts a few frames.
 */
async function probeMotion(page: Page) {
  return page.evaluate(() => {
    const mk = (cls: string) => {
      const el = document.createElement("div")
      el.className = cls
      el.style.cssText = "width:20px;height:20px"
      document.body.appendChild(el)
      return el
    }
    const pulse = mk("animate-pulse")
    const spin = mk("animate-spin")
    const slide = mk("transition-transform duration-300")
    const fade = mk("transition-opacity duration-300")
    const read = {
      pulse: getComputedStyle(pulse).animationName,
      spin: getComputedStyle(spin).animationName,
      spinRunning: spin.getAnimations().some((a) => a.playState === "running"),
      slide: getComputedStyle(slide).transitionProperty,
      fade: getComputedStyle(fade).transitionProperty,
      scroll: getComputedStyle(document.documentElement).scrollBehavior,
    }
    for (const el of [pulse, spin, slide, fade]) el.remove()
    return read
  })
}

test.describe("Reduce Motion", () => {
  test("without the setting, skeletons pulse and slides move (control)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" })
    await openHome(page)
    const m = await probeMotion(page)
    expect(m.pulse).toBe("pulse")
    expect(m.slide).toContain("transform")
  })

  test("with the setting, skeletons stand still, slides stop, the spinner keeps spinning", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await openHome(page)
    const m = await probeMotion(page)
    expect(m.pulse).toBe("none")
    // A spinner is a progress indicator; iOS keeps its own spinning too.
    expect(m.spin).toBe("spin")
    expect(m.spinRunning).toBe(true)
    for (const p of ["transform", "translate", "scale", "rotate", "all"]) {
      expect(m.slide.split(/,\s*/)).not.toContain(p)
    }
    // Fades may stay.
    expect(m.fade.split(/,\s*/)).toContain("opacity")
    expect(m.scroll).toBe("auto")
  })
})
