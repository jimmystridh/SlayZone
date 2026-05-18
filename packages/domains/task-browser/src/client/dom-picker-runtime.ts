function pickElementInGuestPage() {
  return new Promise((resolve) => {
    const doc = document
    const w = window as Window & { __slzDomPickerCleanup?: () => void }
    if (typeof w.__slzDomPickerCleanup === 'function') {
      try {
        w.__slzDomPickerCleanup()
      } catch {
        /* noop */
      }
    }

    const overlay = doc.createElement('div')
    overlay.style.position = 'fixed'
    overlay.style.zIndex = '2147483646'
    overlay.style.pointerEvents = 'none'
    overlay.style.border = '2px solid #3b82f6'
    overlay.style.background = 'rgba(59, 130, 246, 0.14)'
    overlay.style.borderRadius = '6px'
    overlay.style.display = 'none'

    const label = doc.createElement('div')
    label.style.position = 'fixed'
    label.style.zIndex = '2147483647'
    label.style.pointerEvents = 'none'
    label.style.background = '#111827'
    label.style.color = '#f9fafb'
    label.style.padding = '4px 8px'
    label.style.borderRadius = '6px'
    label.style.font = '12px/1.2 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace'
    label.style.maxWidth = 'min(60vw, 520px)'
    label.style.whiteSpace = 'nowrap'
    label.style.overflow = 'hidden'
    label.style.textOverflow = 'ellipsis'
    label.style.display = 'none'

    const simpleId = /^[A-Za-z_][A-Za-z0-9_:\-.]*$/
    const safeAttr = (value: string): string => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const pushUnique = (arr: string[], selector: string): void => {
      if (!selector || arr.includes(selector)) return
      arr.push(selector)
    }

    const nthOfType = (el: Element): number => {
      let i = 1
      let sib = el.previousElementSibling
      while (sib) {
        if (sib.tagName === el.tagName) i += 1
        sib = sib.previousElementSibling
      }
      return i
    }

    const cssPath = (el: Element): string => {
      const parts: string[] = []
      let cur: Element | null = el
      while (cur && cur.nodeType === 1 && cur !== doc.body && parts.length < 6) {
        parts.push(`${cur.tagName.toLowerCase()}:nth-of-type(${nthOfType(cur)})`)
        cur = cur.parentElement
      }
      parts.push('body')
      return parts.reverse().join(' > ')
    }

    const extractText = (el: Element): string => {
      const raw =
        el.getAttribute('aria-label') ||
        el.getAttribute('alt') ||
        (el as HTMLElement).innerText ||
        el.textContent ||
        ''
      return raw.replace(/\s+/g, ' ').trim()
    }

    const selectorCandidates = (el: Element): string[] => {
      const out: string[] = []
      const tag = el.tagName.toLowerCase()
      const testId = el.getAttribute('data-testid')
      if (testId) {
        pushUnique(out, `[data-testid="${safeAttr(testId)}"]`)
        pushUnique(out, `${tag}[data-testid="${safeAttr(testId)}"]`)
      }
      const id = (el as HTMLElement).id
      if (id) {
        pushUnique(out, `[id="${safeAttr(id)}"]`)
        if (simpleId.test(id)) pushUnique(out, `#${id}`)
      }
      const ariaLabel = el.getAttribute('aria-label')
      if (ariaLabel) pushUnique(out, `${tag}[aria-label="${safeAttr(ariaLabel)}"]`)
      const name = el.getAttribute('name')
      if (name) pushUnique(out, `${tag}[name="${safeAttr(name)}"]`)
      const role = el.getAttribute('role')
      if (role) pushUnique(out, `${tag}[role="${safeAttr(role)}"]`)
      pushUnique(out, cssPath(el))
      return out.slice(0, 8)
    }

    const cleanup = (result: unknown): void => {
      doc.removeEventListener('mousemove', onMove, true)
      doc.removeEventListener('click', onClick, true)
      doc.removeEventListener('keydown', onKeyDown, true)
      doc.removeEventListener('contextmenu', onCancel, true)
      overlay.remove()
      label.remove()
      delete w.__slzDomPickerCleanup
      resolve(result)
    }

    const updateOverlay = (target: Element | null): void => {
      if (!target) {
        overlay.style.display = 'none'
        label.style.display = 'none'
        return
      }
      const rect = target.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        overlay.style.display = 'none'
        label.style.display = 'none'
        return
      }
      overlay.style.display = 'block'
      overlay.style.left = `${rect.left}px`
      overlay.style.top = `${rect.top}px`
      overlay.style.width = `${rect.width}px`
      overlay.style.height = `${rect.height}px`

      label.style.display = 'block'
      label.style.left = `${Math.max(8, rect.left)}px`
      label.style.top = `${Math.max(8, rect.top - 30)}px`
      const tag = target.tagName.toLowerCase()
      const id = (target as HTMLElement).id ? `#${(target as HTMLElement).id}` : ''
      label.textContent =
        target instanceof HTMLIFrameElement
          ? `iframe${id} (inside frame selection is limited in v1)`
          : `${tag}${id}`
    }

    const onMove = (event: MouseEvent): void => {
      updateOverlay(event.target instanceof Element ? event.target : null)
    }

    const onClick = (event: MouseEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      const target = event.target instanceof Element ? event.target : null
      if (!target) return cleanup(null)
      const note =
        target instanceof HTMLIFrameElement
          ? 'Selection came from iframe boundary; inner-frame elements may need manual targeting.'
          : undefined
      cleanup({
        url: location.href,
        tagName: target.tagName.toLowerCase(),
        textSample: extractText(target),
        selectorCandidates: selectorCandidates(target),
        note
      })
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        cleanup(null)
      }
    }

    const onCancel = (event: MouseEvent): void => {
      event.preventDefault()
      cleanup(null)
    }

    w.__slzDomPickerCleanup = () => cleanup(null)
    doc.documentElement.appendChild(overlay)
    doc.documentElement.appendChild(label)
    doc.addEventListener('mousemove', onMove, true)
    doc.addEventListener('click', onClick, true)
    doc.addEventListener('keydown', onKeyDown, true)
    doc.addEventListener('contextmenu', onCancel, true)
  })
}

export const DOM_PICKER_SCRIPT = `(${pickElementInGuestPage.toString()})()`
export const DOM_PICKER_CANCEL_SCRIPT =
  '(() => { const w = window; if (typeof w.__slzDomPickerCleanup === "function") { w.__slzDomPickerCleanup(); return true } return false })()'
