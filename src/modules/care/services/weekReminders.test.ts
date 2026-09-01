import { describe, it, expect, vi, beforeEach } from "vitest"
import { getWeekReminders } from "./weekReminders"
import * as weekAgenda from "./weekAgenda"
import * as taskService from "./taskService"
import type { WeekAgendaItem } from "./weekAgenda"
import type { TaskTemplate } from "@/integrations/types"

vi.mock("./weekAgenda", () => ({ getWeekAgenda: vi.fn() }))
vi.mock("./taskService", () => ({ getTaskTemplates: vi.fn() }))

const agendaRow = (over: Partial<WeekAgendaItem> = {}): WeekAgendaItem =>
  ({
    taskInstanceId: "i1",
    taskTemplateId: "t1",
    title: "Replace the furnace filter",
    source: "appliance",
    priorityTier: "recommended",
    estimatedMinutes: 10,
    dueDate: "2026-09-05",
    isOverdue: false,
    pastDue: false,
    dueKind: "window",
    windowState: "in_window",
    duePhrase: "This week",
    safetyNote: null,
    trulyOverdue: false,
    itemUnitId: "u1",
    itemName: "Furnace",
    roomName: null,
    ...over,
  }) as WeekAgendaItem

const template = (over: Partial<TaskTemplate> = {}): TaskTemplate =>
  ({
    task_template_id: "t1",
    remind_enabled: null,
    priority_tier: "recommended",
    supplies: [],
    is_active: true,
    deleted_at: null,
    ...over,
  }) as unknown as TaskTemplate

beforeEach(() => vi.resetAllMocks())

const ok = <T,>(data: T) => ({ data, error: null })
const fail = { data: null, error: { message: "boom" } }

describe("getWeekReminders — the notification lens over the week", () => {
  it("curated mode keeps only explicit remindEnabled === true", async () => {
    vi.mocked(weekAgenda.getWeekAgenda).mockResolvedValue(
      ok([agendaRow({ taskTemplateId: "on" }), agendaRow({ taskTemplateId: "null", taskInstanceId: "i2" }), agendaRow({ taskTemplateId: "off", taskInstanceId: "i3" })])
    )
    vi.mocked(taskService.getTaskTemplates).mockResolvedValue(
      ok([
        template({ task_template_id: "on", remind_enabled: true }),
        template({ task_template_id: "null", remind_enabled: null, priority_tier: "essential" }),
        template({ task_template_id: "off", remind_enabled: false }),
      ])
    )
    const res = await getWeekReminders("h1", "curated")
    expect(res.error).toBeNull()
    expect(res.data!.items.map((i) => i.taskTemplateId)).toEqual(["on"])
    expect(res.data!.hiddenCount).toBe(2)
  })

  it("curated+essential admits the never-chose Essential too", async () => {
    vi.mocked(weekAgenda.getWeekAgenda).mockResolvedValue(
      ok([agendaRow({ taskTemplateId: "on" }), agendaRow({ taskTemplateId: "null", taskInstanceId: "i2", priorityTier: "essential" })])
    )
    vi.mocked(taskService.getTaskTemplates).mockResolvedValue(
      ok([
        template({ task_template_id: "on", remind_enabled: true }),
        template({ task_template_id: "null", remind_enabled: null, priority_tier: "essential" }),
      ])
    )
    const res = await getWeekReminders("h1", "curated+essential")
    expect(res.data!.items).toHaveLength(2)
    expect(res.data!.hiddenCount).toBe(0)
  })

  it("a row whose template is missing survives the join (tier default decides)", async () => {
    vi.mocked(weekAgenda.getWeekAgenda).mockResolvedValue(ok([agendaRow({ taskTemplateId: "ghost", priorityTier: "essential" })]))
    vi.mocked(taskService.getTaskTemplates).mockResolvedValue(ok([]))
    const res = await getWeekReminders("h1", "curated+essential")
    expect(res.data!.items).toHaveLength(1)
    expect(res.data!.items[0].remindEnabled).toBeNull()
    expect(res.data!.items[0].supplies).toEqual([])
  })

  it("supplies ride along from the template", async () => {
    vi.mocked(weekAgenda.getWeekAgenda).mockResolvedValue(ok([agendaRow()]))
    vi.mocked(taskService.getTaskTemplates).mockResolvedValue(
      ok([
        template({
          remind_enabled: true,
          supplies: [{ name: "Furnace filter", category: "filter", part_number: "FPR10", url: "https://filterbuy.com/x", size: "16x25x1", buy_ahead: true }],
        }),
      ])
    )
    const res = await getWeekReminders("h1", "curated")
    expect(res.data!.items[0].supplies[0].url).toContain("filterbuy.com")
    expect(res.data!.items[0].supplies[0].buy_ahead).toBe(true)
  })

  it("a failed template fetch is an ERROR, never an empty week", async () => {
    vi.mocked(weekAgenda.getWeekAgenda).mockResolvedValue(ok([agendaRow()]))
    vi.mocked(taskService.getTaskTemplates).mockResolvedValue(fail as never)
    const res = await getWeekReminders("h1", "curated")
    expect(res.data).toBeNull()
    expect(res.error?.message).toBe("boom")
  })

  it("a failed agenda fetch propagates too", async () => {
    vi.mocked(weekAgenda.getWeekAgenda).mockResolvedValue(fail as never)
    vi.mocked(taskService.getTaskTemplates).mockResolvedValue(ok([]))
    const res = await getWeekReminders("h1", "all")
    expect(res.data).toBeNull()
    expect(res.error?.message).toBe("boom")
  })
})
