const ALPHA = {
  page: '08', // full-page background tint
  tab: '28', // inactive tab
  tabActive: '40' // active tab
} as const

export type ProjectColorVariant = keyof typeof ALPHA

export function projectColorBg(
  color: string | null | undefined,
  variant: ProjectColorVariant = 'page'
): string | undefined {
  if (!color) return undefined
  return color + ALPHA[variant]
}
