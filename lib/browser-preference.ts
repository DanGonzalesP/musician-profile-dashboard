/** Scalar preference store: stable snapshots, SSR default and tab synchronization. */
export function createBrowserPreference<T extends string>(
  key: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
) {
  const eventName = `vibe:preference:${key}`
  let volatileValue: T | undefined

  const getSnapshot = (): T => {
    if (typeof window === "undefined") return fallback
    if (volatileValue !== undefined) return volatileValue
    try {
      const value = window.localStorage.getItem(key)
      return isValid(value) ? value : fallback
    } catch {
      return fallback
    }
  }

  const set = (value: T) => {
    if (typeof window === "undefined" || !isValid(value)) return
    try {
      window.localStorage.setItem(key, value)
      volatileValue = undefined
    } catch {
      // A blocked/full store must not disable the control for this session.
      volatileValue = value
    }
    window.dispatchEvent(new Event(eventName))
  }

  const subscribe = (notify: () => void) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== key) return
      try {
        if (event.storageArea !== window.localStorage) return
      } catch {
        return
      }
      volatileValue = undefined
      notify()
    }
    window.addEventListener("storage", onStorage)
    window.addEventListener(eventName, notify)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(eventName, notify)
    }
  }

  return { getSnapshot, getServerSnapshot: () => fallback, set, subscribe }
}
