/**
 * generate_deck must bound the work one request can ask for. approx_pages used
 * to flow straight into the planner loop (ceil(approx / 12) LLM calls) and into
 * the progress checklist injected on every turn, so approx_pages: 100000 meant
 * thousands of planner calls and a page list far larger than the context it was
 * injected into.
 */
import { describe, it, expect } from 'vitest'
import { createSlidesSkill, type DeckAccess } from '../src/renderer/ai/slides-skill'
import type { RenderSlide } from '@genoffice/pptx-render'
import type { AgentToolCall } from '../src/shared/ipc'

const PLAN_BATCH = 12
const MAX_DECK_PAGES = 200
const MAX_PLANNER_CALLS = Math.ceil(MAX_DECK_PAGES / PLAN_BATCH)

/** Every page generation fails, so the run stops after planning without landing anything. */
function makeFailingAccess() {
  let planCalls = 0
  const planTotals: number[] = []
  const access: DeckAccess = {
    getSlides: () => [] as RenderSlide[],
    getCurrent: () => 0,
    getSelectedIds: () => [],
    applySlide: () => {},
    applyDeck: () => {},
    fitWidthPx: 1280,
    retryBackoffMs: 0,
    landGeneratedPages: async () => ({ ok: true, pages: 0 }),
    isCloudPageGenEnabled: async () => true,
    generatePageCloud: async () => ({ ok: false, error: 'mock fail' }),
    generatePageLocal: async () => ({ ok: false, error: 'mock fail' }),
    generateStyleSkill: async () => ({ ok: true, styleSkill: 'STYLE' }),
    planDeckOutline: async (a) => {
      planCalls++
      planTotals.push(a.count)
      return {
        ok: true,
        outline: {
          core_hook: 'CH',
          pages: Array.from({ length: a.count }, (_, i) => ({
            title: `Planned page ${a.startPage + i}`,
            brief: `b${a.startPage + i}`,
            layout: 'data',
            image_queries: [],
          })),
        },
      }
    },
    searchImages: async () => [],
  }
  return {
    access,
    planCalls: () => planCalls,
    planTotals: () => planTotals,
  }
}

const call = (approx: number): AgentToolCall => ({
  id: 'c-budget',
  name: 'generate_deck',
  input: { topic: 'Huge deck', approx_pages: approx },
})

describe('generate_deck planner budget', () => {
  it('clamps an oversized approx_pages to the documented deck maximum', async () => {
    const { access, planCalls, planTotals } = makeFailingAccess()
    const totals: number[] = []
    access.onProgress = (e) => {
      if (e.stage === 'plan' && 'total' in e) totals.push(e.total)
    }
    const skill = createSlidesSkill(access)

    await skill.executeTool(call(100_000))

    // ceil(200 / 12) planner batches, never the ~8333 an unclamped value asks for
    expect(planCalls()).toBeLessThanOrEqual(MAX_PLANNER_CALLS)
    expect(planCalls()).toBeGreaterThan(0)
    // The last batch is a partial one, never more than PLAN_BATCH pages
    for (const n of planTotals()) expect(n).toBeLessThanOrEqual(PLAN_BATCH)
    // No progress event advertises a deck larger than the maximum
    expect(totals.length).toBeGreaterThan(0)
    for (const total of totals) expect(total).toBeLessThanOrEqual(MAX_DECK_PAGES)
  })

  it('leaves a normal approx_pages untouched', async () => {
    const { access, planCalls } = makeFailingAccess()
    const skill = createSlidesSkill(access)

    await skill.executeTool(call(5))

    expect(planCalls()).toBe(1)
  })

  it('declares the bound in the tool schema', () => {
    const { access } = makeFailingAccess()
    const tool = createSlidesSkill(access).tools.find((t) => t.name === 'generate_deck')!
    const approx = (tool.inputSchema as { properties: Record<string, unknown> }).properties
      .approx_pages as { minimum?: number; maximum?: number }
    expect(approx.minimum).toBe(1)
    expect(approx.maximum).toBe(MAX_DECK_PAGES)
  })

  it('keeps the unfinished-page checklist bounded', async () => {
    const { access } = makeFailingAccess()
    const skill = createSlidesSkill(access)

    await skill.executeTool(call(100_000))

    const context = skill.buildContext!()
    const unfinished = context.split('Unfinished: ')[1]?.split('\n')[0] ?? ''
    const named = unfinished.split(', ').filter((p) => p.startsWith('page '))
    expect(named.length).toBeGreaterThan(0)
    expect(named.length).toBeLessThanOrEqual(40)
    // Everything past the named window is counted rather than listed
    expect(unfinished).toContain('more')
    expect(context.length).toBeLessThan(4000)
  })
})
