/** Fire a Meta Pixel standard or custom event (no-op if pixel not loaded) */
export function fbqTrack(event: string, params?: Record<string, any>) {
  if (typeof window !== 'undefined' && (window as any).fbq) {
    (window as any).fbq('track', event, params)
  }
}
