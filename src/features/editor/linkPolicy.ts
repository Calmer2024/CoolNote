type LinkPointerEvent = {
  href: string | null
  button: number
  ctrlKey: boolean
  metaKey: boolean
}

export const shouldAutoLink = (value:string) => {
  const candidate=value.trim()
  if (/^https?:\/\/\S+$/i.test(candidate)) {
    try {
      return Boolean(new URL(candidate).hostname)
    } catch {
      return false
    }
  }
  return /^www\.[^\s.]+(?:\.[^\s.]+)+(?:[/?#]\S*)?$/i.test(candidate)
}

export const linkActivationFromPointerEvent = ({ href, button, ctrlKey, metaKey }:LinkPointerEvent) => {
  if (button !== 0 || (!ctrlKey && !metaKey) || !href) return null
  const candidate=href.trim()
  if (!/^https?:\/\//i.test(candidate)) return null
  try {
    const parsed=new URL(candidate)
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) return null
    return { url:parsed.href }
  } catch {
    return null
  }
}
