import * as React from "react"

const MOBILE_BREAKPOINT = 768

function subscribe(callback: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", callback)
  return () => mql.removeEventListener("change", callback)
}

export function useIsMobile() {
  // Media-query state via useSyncExternalStore: no setState-in-effect,
  // SSR-safe (server snapshot = false), re-renders only on breakpoint change.
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false,
  )
}
