/** 'pt-BR' -> 'pt'; the tag itself when it carries no subtag, so the lookup index stays a string. */
export const baseLang = (lang: string): string => lang.split('-')[0] ?? lang

export function contextMenuLabels(lang: string): ContextMenuLabels {
  return LABELS[lang] ?? LABELS[baseLang(lang)] ?? EN
}