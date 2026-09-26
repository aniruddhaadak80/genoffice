import type { Lang, PluralCategory } from '@genoffice/i18n'
import { pluralCategory } from '@genoffice/i18n'
import type { RecentPage } from '../../shared/home-api'

export type PluralSuffix = 'Zero' | 'One' | 'Two' | 'Few' | 'Many' | 'Other'
export type FileCountKey = `fileCount${PluralSuffix}`
export type TimelineCountKey = `timelineCount${PluralSuffix}`

/** Sidebar counts use the same filtered total as the visible list. */
export function visiblePageCount(page: Pick<RecentPage, 'total'>): number {
  return page.total
}

const SUFFIX: Record<PluralCategory, PluralSuffix> = {
  zero: 'Zero',
  one: 'One',
  two: 'Two',
  few: 'Few',
  many: 'Many',
  other: 'Other',
}

export function fileCountKey(lang: Lang, count: number): FileCountKey {
  return `fileCount${SUFFIX[pluralCategory(lang, count)]}`
}

export function timelineCountKey(lang: Lang, count: number): TimelineCountKey {
  return `timelineCount${SUFFIX[pluralCategory(lang, count)]}`
}
