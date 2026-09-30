import "@testing-library/jest-dom/vitest"
import { afterEach } from "vitest"
import { installTestMatchMedia, resetTestViewportWidth } from "./matchMedia"

// jsdom has no matchMedia; components that choose their tree in JS need one.
// Phone width unless a test asks otherwise — see ./matchMedia.
installTestMatchMedia()
afterEach(() => resetTestViewportWidth())
