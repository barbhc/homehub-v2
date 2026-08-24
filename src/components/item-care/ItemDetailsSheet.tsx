import { useState } from "react"
import { Loader2Icon } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { DateField } from "@/components/ui/date-field"
import { StoreField } from "@/components/ui/store-field"
import { updateItemUnit, type UpdateItemUnitInput } from "@/modules/items"
import { warrantyExpiry } from "@/lib/warrantyWindow"
import type { ItemUnit, Room } from "@/integrations/types"

/** Coverage lengths that cover almost every appliance receipt, plus a way out. */
const WARRANTY_MONTHS: { value: string; label: string }[] = [
  { value: "none", label: "Not tracked" },
  { value: "12", label: "1 year" },
  { value: "24", label: "2 years" },
  { value: "36", label: "3 years" },
  { value: "60", label: "5 years" },
  { value: "120", label: "10 years" },
]

const NO_ROOM = "__none__"

/**
 * Every record about an item, edited together in one pass.
 *
 * Two things were true before this, both from HH-96. Mobile had NO way to enter
 * purchase date, price, serial or warranty — the fields were display-only and
 * self-hid when empty, so the add flow's "you can fill this in from the item
 * page later" was a promise the item page could not keep, and "we track your
 * warranty window" needed data the phone could not supply.
 *
 * The obvious fix — an "Add" affordance on every empty row — was the owner's
 * explicit call to avoid: a column of open fields for things like a serial
 * number nobody intends to type is a page that always looks unfinished. So the
 * read view keeps showing only what is filled, and everything is entered here,
 * at once, behind one button.
 *
 * Saves ONE update: partial data is normal here and half of it landing is not.
 */
export function ItemDetailsSheet({
  open, onOpenChange, item, rooms, homeId, onItemUpdate, storeHistory = [],
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: ItemUnit
  rooms: Room[]
  homeId: string
  onItemUpdate?: (item: ItemUnit) => void
  /** Every `store_name` on this home's items, so the field can offer back the
   *  spelling already in use instead of collecting three of them. */
  storeHistory?: readonly (string | null | undefined)[]
}) {
  const [roomId, setRoomId] = useState(item.room_id ?? NO_ROOM)
  const [serial, setSerial] = useState(item.serial_number ?? "")
  const [purchaseDate, setPurchaseDate] = useState(item.purchase_date?.slice(0, 10) ?? "")
  const [price, setPrice] = useState(item.price_paid != null ? String(item.price_paid) : "")
  const [store, setStore] = useState(item.store_name ?? "")
  const [months, setMonths] = useState(
    item.warranty_duration_months != null ? String(item.warranty_duration_months) : "none",
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setError(null)

    const parsedMonths = months === "none" ? null : Number(months)
    const cleanPrice = price.replace(/[^0-9.]/g, "")
    const updates: UpdateItemUnitInput = {
      room_id: roomId === NO_ROOM ? null : roomId,
      serial_number: serial.trim() || null,
      purchase_date: purchaseDate.trim() || null,
      price_paid: cleanPrice ? Number(cleanPrice) : null,
      store_name: store.trim() || null,
      warranty_duration_months: parsedMonths,
    }

    // The window closes on purchase date + coverage. Clear it when either half
    // goes away rather than leaving a stale expiry the Warranties page would
    // still count down.
    updates.warranty_expiry_date = warrantyExpiry(purchaseDate.trim(), parsedMonths)

    const res = await updateItemUnit(homeId, item.item_unit_id, updates)
    setSaving(false)
    if (res.error) {
      // Keep the sheet open with everything they typed still in it.
      setError(res.error.message)
      return
    }
    if (res.data) onItemUpdate?.(res.data)
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      {/* SheetContent carries no padding of its own — only SheetHeader/Footer do
          — so the body supplies its own px-4, and only the body scrolls: with
          overflow on the content itself, Save and Cancel scroll off the bottom
          of a phone. */}
      <SheetContent side="bottom" className="max-h-[88dvh] sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Details &amp; records</SheetTitle>
          <SheetDescription>
            Purchase details are important for warranty and insurance claims. Everything here is
            optional, and blanks stay hidden on the item page.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4">
          <div>
            <Label htmlFor="details-room">Room</Label>
            <Select value={roomId} onValueChange={setRoomId}>
              <SelectTrigger id="details-room" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ROOM}>No room</SelectItem>
                {rooms.map((r) => (
                  <SelectItem key={r.room_id} value={r.room_id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="details-serial">Serial number</Label>
            <Input id="details-serial" value={serial} onChange={(e) => setSerial(e.target.value)}
              placeholder="Off the label on the unit" className="mt-1" />
          </div>

          <div>
            <Label htmlFor="details-purchased">Date purchased</Label>
            <DateField id="details-purchased" value={purchaseDate}
              onChange={setPurchaseDate} className="mt-1" />
          </div>

          <div>
            <Label htmlFor="details-warranty">Warranty length</Label>
            <Select value={months} onValueChange={setMonths}>
              <SelectTrigger id="details-warranty" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WARRANTY_MONTHS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Say what the two fields buy them, at the moment they'd decide to
                skip both. */}
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              With the purchase date, you&apos;ll see when coverage ends.
            </p>
          </div>

          <div>
            <Label htmlFor="details-price">Price paid</Label>
            <Input id="details-price" inputMode="decimal" value={price}
              onChange={(e) => setPrice(e.target.value)} placeholder="$0.00" className="mt-1" />
          </div>

          <div>
            <Label htmlFor="details-store">Where you bought it</Label>
            <StoreField id="details-store" value={store} onChange={setStore}
              homeEntries={storeHistory} className="mt-1" />
          </div>
        </div>

        <SheetFooter className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {error && <p className="text-[13px] font-semibold text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button className="flex-[2] gap-2" onClick={() => void save()} disabled={saving}>
              {saving ? <><Loader2Icon className="size-4 animate-spin" /> Saving…</> : "Save details"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
