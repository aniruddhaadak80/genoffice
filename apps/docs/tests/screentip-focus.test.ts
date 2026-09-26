import { afterEach, describe, expect, it, vi } from 'vitest'
import { installScreenTips } from '@genoffice/ui'

let uninstall: (() => void) | null = null

afterEach(() => {
  uninstall?.()
  uninstall = null
  document.body.innerHTML = ''
  vi.useRealTimers()
})

function control(attrs: Record<string, string>): HTMLButtonElement {
  const el = document.createElement('button')
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value)
  document.body.appendChild(el)
  return el
}

function tip(): HTMLElement | null {
  return document.querySelector('.ui-screentip')
}

function describeOf(el: Element): string | null {
  return el.getAttribute('aria-describedby')
}

function pointer(over: Element): void {
  over.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
}

describe('ScreenTip focus handling', () => {
  it('shows the tip as soon as the control takes focus', () => {
    uninstall = installScreenTips()
    const el = control({ 'data-tip': 'Bold', 'data-tip-kbd': 'Ctrl+B' })

    el.focus()

    const node = tip()
    expect(node).not.toBeNull()
    expect(node!.getAttribute('role')).toBe('tooltip')
    expect(node!.style.visibility).toBe('visible')
    expect(node!.textContent).toContain('Bold')
    expect(node!.textContent).toContain('Ctrl+B')
  })

  it('associates the tip with the focused control through aria-describedby', () => {
    uninstall = installScreenTips()
    const el = control({ 'data-tip': 'Bold' })

    el.focus()

    const node = tip()!
    const id = describeOf(el)
    expect(id).toBe(node.id)
    expect(id).not.toBe('')
    expect(document.getElementById(id!)).toBe(node)
  })

  it('moves the description with focus and clears it on blur', () => {
    uninstall = installScreenTips()
    const first = control({ 'data-tip': 'Bold' })
    const second = control({ 'data-tip': 'Italic' })

    first.focus()
    const firstId = describeOf(first)
    expect(firstId).toBe(tip()!.id)

    second.focus()
    expect(describeOf(first)).toBeNull()
    expect(describeOf(second)).toBe(tip()!.id)
    expect(tip()!.textContent).toContain('Italic')

    second.blur()
    expect(describeOf(second)).toBeNull()
    expect(tip()!.style.visibility).toBe('hidden')
  })

  it("keeps a control's own description and restores it", () => {
    uninstall = installScreenTips()
    const el = control({ 'data-tip': 'Bold', 'aria-describedby': 'hint' })

    el.focus()
    expect(describeOf(el)).toBe(`hint ${tip()!.id}`)

    el.blur()
    expect(describeOf(el)).toBe('hint')
  })

  it('leaves controls without a tip alone', () => {
    uninstall = installScreenTips()
    const el = control({})

    el.focus()

    expect(tip()).toBeNull()
    expect(describeOf(el)).toBeNull()
  })

  it('keeps the tip up while focus moves inside the same control', () => {
    uninstall = installScreenTips()
    const host = document.createElement('div')
    host.setAttribute('data-tip', 'Row')
    const child = document.createElement('button')
    host.appendChild(child)
    document.body.appendChild(host)

    child.focus()
    expect(describeOf(host)).toBe(tip()!.id)

    host.focus()
    expect(describeOf(host)).toBe(tip()!.id)
  })

  it('does not resurrect a tip the pointer just dismissed by clicking', () => {
    vi.useFakeTimers()
    uninstall = installScreenTips()
    const el = control({ 'data-tip': 'Bold' })

    pointer(el)
    vi.advanceTimersByTime(500)
    expect(tip()!.style.visibility).toBe('visible')
    el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))

    el.focus()

    expect(tip()!.style.visibility).toBe('hidden')
    expect(describeOf(el)).toBeNull()
  })

  it('still shows on hover after the standard initial delay', () => {
    vi.useFakeTimers()
    uninstall = installScreenTips()
    const el = control({ 'data-tip': 'Bold' })

    pointer(el)
    expect(tip()?.style.visibility).not.toBe('visible')

    vi.advanceTimersByTime(500)
    expect(tip()!.style.visibility).toBe('visible')
    expect(describeOf(el)).toBe(tip()!.id)
  })

  it('stops listening after uninstall', () => {
    const stop = installScreenTips()
    const el = control({ 'data-tip': 'Bold' })
    stop()

    el.focus()

    expect(tip()).toBeNull()
    expect(describeOf(el)).toBeNull()
  })
})
