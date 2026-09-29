export const isLoopbackHostname = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (normalized === 'localhost') {
    return true
  }

  if (normalized === '::1') {
    return true
  }

  const ipv4 = normalized.match(/^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  return Boolean(ipv4 && ipv4.slice(1).every((part) => Number(part) <= 255))
}

export const isLocalAiAvailable = (): boolean =>
  typeof window !== 'undefined' && isLoopbackHostname(window.location.hostname)
