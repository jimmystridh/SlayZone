import { useMemo } from 'react'
import { diffLines, type Change } from 'diff'
import { cn } from './utils'

interface DiffViewProps {
  left: string
  right: string
  leftLabel?: string
  rightLabel?: string
  className?: string
}

interface AlignedLine {
  left: string | null
  right: string | null
  type: 'equal' | 'removed' | 'added' | 'modified'
}

function alignChanges(changes: Change[]): AlignedLine[] {
  const lines: AlignedLine[] = []

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]
    const raw = change.value.endsWith('\n') ? change.value.slice(0, -1) : change.value
    const chLines = raw.split('\n')

    if (!change.added && !change.removed) {
      for (const l of chLines) lines.push({ left: l, right: l, type: 'equal' })
    } else if (change.removed) {
      const next = changes[i + 1]
      if (next?.added) {
        // Pair removed+added as side-by-side
        const addedRaw = next.value.endsWith('\n') ? next.value.slice(0, -1) : next.value
        const addedLines = addedRaw.split('\n')
        const max = Math.max(chLines.length, addedLines.length)
        for (let j = 0; j < max; j++) {
          lines.push({
            left: j < chLines.length ? chLines[j] : null,
            right: j < addedLines.length ? addedLines[j] : null,
            type: 'modified'
          })
        }
        i++ // skip next (already consumed)
      } else {
        for (const l of chLines) lines.push({ left: l, right: null, type: 'removed' })
      }
    } else if (change.added) {
      for (const l of chLines) lines.push({ left: null, right: l, type: 'added' })
    }
  }
  return lines
}

const removedBg = 'bg-red-500/15 text-red-800 dark:text-red-200'
const addedBg = 'bg-green-500/15 text-green-800 dark:text-green-200'
const emptyBg = 'bg-muted/30'

export function DiffView({ left, right, leftLabel, rightLabel, className }: DiffViewProps) {
  const aligned = useMemo(() => {
    const changes = diffLines(left, right)
    return alignChanges(changes)
  }, [left, right])

  const identical = aligned.every((l) => l.type === 'equal')

  if (identical) {
    return (
      <div
        className={cn(
          'flex items-center justify-center py-8 text-sm text-muted-foreground',
          className
        )}
      >
        Files are identical
      </div>
    )
  }

  return (
    <div className={cn('overflow-auto rounded-md border font-mono text-xs', className)}>
      {/* Header */}
      <div className="grid grid-cols-2 border-b bg-muted/50 text-muted-foreground">
        <div className="px-3 py-1.5 font-sans text-xs font-medium">{leftLabel ?? 'Left'}</div>
        <div className="border-l px-3 py-1.5 font-sans text-xs font-medium">
          {rightLabel ?? 'Right'}
        </div>
      </div>
      {/* Lines */}
      <div className="grid grid-cols-2">
        {aligned.map((line, i) => (
          <Line key={i} line={line} />
        ))}
      </div>
    </div>
  )
}

function Line({ line }: { line: AlignedLine }) {
  const leftCls =
    line.type === 'removed' || line.type === 'modified'
      ? removedBg
      : line.left === null
        ? emptyBg
        : ''
  const rightCls =
    line.type === 'added' || line.type === 'modified' ? addedBg : line.right === null ? emptyBg : ''

  return (
    <>
      <div className={cn('min-h-[1.5rem] whitespace-pre-wrap break-all px-3 py-0.5', leftCls)}>
        {line.left ?? ''}
      </div>
      <div
        className={cn(
          'min-h-[1.5rem] whitespace-pre-wrap break-all border-l px-3 py-0.5',
          rightCls
        )}
      >
        {line.right ?? ''}
      </div>
    </>
  )
}
