/**
 * The words `SuggestedSource` fills into "Typical for {kindLabel}", keyed by the
 * care library's kind (`kindOf` in shared/care/library). Kept out of
 * SuggestedRow.tsx so that file exports only components (react-refresh).
 */
export const KIND_LABELS: Record<string, string> = {
  air_purifier: "air purifiers", range_hood: "range hoods", dishwasher: "dishwashers", refrigerator: "refrigerators",
  furnace: "furnaces", hvac: "heating and cooling", dryer: "dryers", washer: "washers", coffee_machine: "coffee machines",
  microwave: "microwaves", water_heater: "water heaters", ceiling_fan: "ceiling fans", food_recycler: "food recyclers",
  oven_range: "ranges", smoke_alarm: "alarms", home: "a home like yours",
}
