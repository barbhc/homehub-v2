/**
 * Money, written the way money is written.
 *
 * A bare toLocaleString() renders a $1,099.50 dishwasher as "$1,099.5" — the
 * first thing HH-96's new "Price paid" row did on real data.
 */
export function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })
}
