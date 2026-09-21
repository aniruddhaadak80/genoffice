/**
 * Run-hyperlink string encoding shared by renderer and main: external url, "slide:N"
 * (0-based) for in-doc jumps, "action:<name>" for named show actions — same encoding as
 * the engine's TextRun.hyperlink.
 */
import { NAMED_ACTIONS, type NamedAction } from '@genoffice/pptx-engine/named-action'
import type { LinkTargetOp } from './ipc'

export function encodeLinkTarget(target: LinkTargetOp): string {
  if (target.kind === 'slide') return `slide:${target.slideIndex}`
  if (target.kind === 'action') return `action:${target.action}`
  return target.url
}

export function decodeLinkTarget(s: string | null | undefined): LinkTargetOp | null {
  if (!s) return null
  const m = /^slide:(\d+)$/.exec(s)
  if (m) return { kind: 'slide', slideIndex: Number(m[1]) }
  const a = /^action:(\w+)$/.exec(s)
  if (a) {
    return (NAMED_ACTIONS as readonly string[]).includes(a[1]!)
      ? { kind: 'action', action: a[1] as NamedAction }
      : null
  }
  // File-authored URLs reach the browser/PDF export: only http(s)/mailto
  // survive; javascript:/file:/vbscript: links decode to null (dropped).
  return safeExternalUrl(s) === null ? null : { kind: 'url', url: s }
}

/**
 * Allowlist for external link schemes. Returns the URL when it is a safe
 * http(s)/mailto link, else null. Guards every layer that follows or
 * exports a file-authored URL (decode, slideshow follow, PDF export hrefs).
 */
export function safeExternalUrl(url: string): string | null {
  let scheme: string
  try {
    scheme = new URL(url).protocol.toLowerCase()
  } catch {
    return null
  }
  return scheme === 'http:' || scheme === 'https:' || scheme === 'mailto:' ? url : null
}
