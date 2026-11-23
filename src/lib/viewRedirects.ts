import { createElement } from "react"
import { Navigate, Route } from "react-router-dom"
import { CLEANING_PATH, WARRANTIES_PATH } from "@/hooks/usePageView"

/**
 * Pages that became views of another page (design/tasks-items-views.md): Clean
 * is Tasks → Cleaning, Warranties is Items → Warranties. Their old addresses —
 * bookmarks, pushes, links in Home's components — still land, by a REPLACE, so
 * Back never returns to an address that only redirects. `/clean/:itemUnitId`
 * (an appliance's cleaning guide) is a page of its own and is not here.
 */
export const VIEW_REDIRECTS = [
  ["/clean", CLEANING_PATH],
  ["/warranties", WARRANTIES_PATH],
] as const

/**
 * The redirects as route elements, for App's route tree (and its test). Built
 * with createElement so this module stays plain TS: it exports no component.
 */
export function viewRedirectRoutes() {
  return VIEW_REDIRECTS.map(([from, to]) =>
    createElement(Route, { key: from, path: from, element: createElement(Navigate, { to, replace: true }) }),
  )
}
