/**
 * Performance Monitoring Utility for Chat Widget
 *
 * Tracks performance metrics during development to identify
 * bottlenecks and memory leaks in the chat widget implementation.
 */

import React from 'react';

// Performance metrics storage
interface PerformanceMetrics {
  renderCounts: Map<string, number>;
  memorySnapshots: MemoryInfo[];
  renderTimes: number[];
  lastResetTime: number;
  totalReRenders: number;
}

// Global metrics instance
let metrics: PerformanceMetrics = {
  renderCounts: new Map(),
  memorySnapshots: [],
  renderTimes: [],
  lastResetTime: Date.now(),
  totalReRenders: 0
};

/**
 * Records a render for a specific component
 */
export function recordRender(componentName: string): void {
  if (process.env.NODE_ENV !== 'development') return;

  const startTime = performance.now();

  // Update render count
  const currentCount = metrics.renderCounts.get(componentName) || 0;
  metrics.renderCounts.set(componentName, currentCount + 1);
  metrics.totalReRenders++;

  // Record render time
  const renderTime = performance.now() - startTime;
  metrics.renderTimes.push(renderTime);

  // Keep only last 100 render times
  if (metrics.renderTimes.length > 100) {
    metrics.renderTimes.shift();
  }

  // Log render info
  console.log(`🔍 ${componentName} rendered (#${currentCount + 1})`, {
    renderTime: `${renderTime.toFixed(2)}ms`,
    totalRenders: metrics.totalReRenders,
    componentRenders: currentCount + 1
  });
}

/**
 * Takes a memory snapshot
 */
export function takeMemorySnapshot(): void {
  if (process.env.NODE_ENV !== 'development') return;

  if ('memory' in performance) {
    const memory = (performance as any).memory as MemoryInfo;
    metrics.memorySnapshots.push({
      ...memory,
      timestamp: Date.now()
    } as MemoryInfo & { timestamp: number });

    // Keep only last 50 snapshots
    if (metrics.memorySnapshots.length > 50) {
      metrics.memorySnapshots.shift();
    }

    console.log('💾 Memory snapshot', {
      used: `${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
      total: `${(memory.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
      limit: `${(memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB`
    });
  }
}

/**
 * Gets current performance metrics
 */
export function getPerformanceMetrics() {
  const averageRenderTime = metrics.renderTimes.length > 0
    ? metrics.renderTimes.reduce((a, b) => a + b, 0) / metrics.renderTimes.length
    : 0;

  const latestMemory = metrics.memorySnapshots[metrics.memorySnapshots.length - 1];

  return {
    ...metrics,
    renderCounts: Object.fromEntries(metrics.renderCounts),
    averageRenderTime,
    latestMemory,
    timeSinceReset: Date.now() - metrics.lastResetTime
  };
}

/**
 * Resets all performance metrics
 */
export function resetMetrics(): void {
  metrics = {
    renderCounts: new Map(),
    memorySnapshots: [],
    renderTimes: [],
    lastResetTime: Date.now(),
    totalReRenders: 0
  };
  console.log('📊 Performance metrics reset');
}

/**
 * Logs a performance summary
 */
export function logPerformanceSummary(): void {
  if (process.env.NODE_ENV !== 'development') return;

  const summary = getPerformanceMetrics();
  const topRenderers = Object.entries(summary.renderCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  console.group('📈 Performance Summary');
  console.log('Total Re-renders:', summary.totalReRenders);
  console.log('Average Render Time:', `${summary.averageRenderTime.toFixed(2)}ms`);

  if (summary.latestMemory) {
    const memoryGrowth = metrics.memorySnapshots.length > 1
      ? summary.latestMemory.usedJSHeapSize - metrics.memorySnapshots[0].usedJSHeapSize
      : 0;
    console.log('Memory Usage:', `${(summary.latestMemory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`);
    console.log('Memory Growth:', `${(memoryGrowth / 1024 / 1024).toFixed(2)} MB`);
  }

  if (topRenderers.length > 0) {
    console.log('Top Rendering Components:');
    topRenderers.forEach(([name, count]) => {
      console.log(`  ${name}: ${count} renders`);
    });
  }

  console.groupEnd();
}

/**
 * Performance monitoring HOC
 */
export function withPerformanceMonitoring<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  componentName?: string
) {
  const displayName = componentName || WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const MonitoredComponent = React.forwardRef<any, P>((props, ref) => {
    // Record render before component renders
    recordRender(displayName);

    // Take memory snapshot every 10 renders
    if (metrics.totalReRenders % 10 === 0) {
      takeMemorySnapshot();
    }

    return React.createElement(WrappedComponent, { ...props, ref });
  });

  MonitoredComponent.displayName = `withPerformanceMonitoring(${displayName})`;

  return MonitoredComponent;
}

/**
 * Hook for performance monitoring
 */
export function usePerformanceMonitor(componentName: string) {
  const renderCountRef = React.useRef(0);

  React.useEffect(() => {
    renderCountRef.current++;
    recordRender(componentName);

    // Log warning for excessive re-renders
    if (renderCountRef.current > 50) {
      console.warn(`⚠️ ${componentName} has re-rendered ${renderCountRef.current} times`);
    }
  });

  return {
    renderCount: renderCountRef.current,
    takeSnapshot: takeMemorySnapshot,
    getMetrics: getPerformanceMetrics
  };
}

// Auto-monitor memory leaks in development
if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    takeMemorySnapshot();

    // Check for potential memory leaks
    if (metrics.memorySnapshots.length > 10) {
      const recent = metrics.memorySnapshots.slice(-5);
      const memoryTrend = recent.map(s => s.usedJSHeapSize);
      const isIncreasing = memoryTrend.every((val, i) => i === 0 || val >= memoryTrend[i - 1]);

      if (isIncreasing && memoryTrend[memoryTrend.length - 1] - memoryTrend[0] > 10 * 1024 * 1024) {
        console.warn('⚠️ Potential memory leak detected - Memory consistently increasing');
      }
    }
  }, 30000); // Check every 30 seconds
}