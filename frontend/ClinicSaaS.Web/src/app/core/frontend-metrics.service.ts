import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FrontendMetricsService {
  init(): void {
    if (typeof window === 'undefined' || typeof performance === 'undefined') return;

    // Lightweight baseline metrics for user-perceived loading.
    window.addEventListener('load', () => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      if (!nav) return;
      const ttfb = Math.round(nav.responseStart);
      const domInteractive = Math.round(nav.domInteractive);
      // Keep simple console-based reporting until analytics backend is connected.
      console.info('[metrics] ttfb_ms=%d dom_interactive_ms=%d', ttfb, domInteractive);
    });
  }
}
