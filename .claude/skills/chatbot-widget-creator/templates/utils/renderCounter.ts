/**
 * Render Counter Utility for Debugging
 *
 * Helps track component re-renders during development to identify
 * infinite loop issues.
 */

// Global render counter
let renderCount = 0;

/**
 * Increments and logs the render count
 * @param componentName Name of the component being rendered
 */
export function incrementRenderCount(componentName: string): number {
  renderCount++;

  if (process.env.NODE_ENV === 'development') {
    console.log(`🔄 ${componentName} render #${renderCount}`, {
      renderCount,
      timestamp: new Date().toISOString(),
      url: window.location.href
    });
  }

  return renderCount;
}

/**
 * Gets the current render count
 */
export function getRenderCount(): number {
  return renderCount;
}

/**
 * Resets the render counter
 */
export function resetRenderCount(): void {
  renderCount = 0;
}

/**
 * Creates a render tracking HOC (Higher-Order Component)
 * @param WrappedComponent The component to track
 * @param componentName Name for logging
 */
export function withRenderTracking<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  componentName: string = WrappedComponent.displayName || WrappedComponent.name || 'Component'
) {
  const TrackedComponent = React.forwardRef<any, P>((props, ref) => {
    incrementRenderCount(componentName);
    return <WrappedComponent {...props} ref={ref} />;
  });

  TrackedComponent.displayName = `withRenderTracking(${componentName})`;

  return TrackedComponent;
}