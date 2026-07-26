import { Variants, MotionProps } from 'framer-motion';

// Animation durations (in seconds)
export const DURATIONS = {
  fast: 0.15,
  normal: 0.2,
  slow: 0.3,
  slower: 0.4,
} as const;

// Animation easings
export const EASINGS = {
  // Smooth easings
  easeOut: [0.0, 0.0, 0.2, 1] as [number, number, number, number],
  easeIn: [0.4, 0.0, 1, 1] as [number, number, number, number],
  easeInOut: [0.4, 0.0, 0.2, 1] as [number, number, number, number],

  // Spring easings
  spring: [0.68, -0.55, 0.265, 1.55] as [number, number, number, number],
  springGentle: [0.25, 0.1, 0.25, 1] as [number, number, number, number],

  // Custom easings
  bounce: [0.68, -0.6, 0.32, 1.6] as [number, number, number, number],
  smooth: [0.4, 0, 0.1, 1] as [number, number, number, number],
} as const;

// Device performance levels
export const PERFORMANCE_LEVELS = {
  high: {
    enabled: true,
    reduceAnimations: false,
    maxFPS: 60,
    particleCount: 50,
    complexAnimations: true,
  },
  medium: {
    enabled: true,
    reduceAnimations: false,
    maxFPS: 30,
    particleCount: 20,
    complexAnimations: true,
  },
  low: {
    enabled: true,
    reduceAnimations: true,
    maxFPS: 15,
    particleCount: 10,
    complexAnimations: false,
  },
  off: {
    enabled: false,
    reduceAnimations: true,
    maxFPS: 0,
    particleCount: 0,
    complexAnimations: false,
  },
} as const;

// Check device performance capabilities
export const getPerformanceLevel = () => {
  // Return default performance level during SSR
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return PERFORMANCE_LEVELS.medium;
  }

  const connection = (navigator as any).connection;
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // Determine hardware capabilities
  const hardwareConcurrency = navigator.hardwareConcurrency || 4;
  const deviceMemory = (navigator as any).deviceMemory || 4;
  const isSlowDevice = hardwareConcurrency < 4 || deviceMemory < 4 || isMobile;

  // Check network conditions
  const isSlowConnection = connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g';

  if (isSlowDevice || isSlowConnection) {
    return PERFORMANCE_LEVELS.low;
  } else if (isMobile) {
    return PERFORMANCE_LEVELS.medium;
  } else {
    return PERFORMANCE_LEVELS.high;
  }
};

// Check for reduced motion preference
export const shouldReduceMotion = () => {
  // Return false during SSR
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

// Animation variants for message entry
export const messageEntryVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.95,
    transition: {
      duration: DURATIONS.fast,
      ease: EASINGS.easeOut,
    },
  },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: DURATIONS.normal,
      ease: EASINGS.spring,
      delay: i * 0.1, // Stagger effect
      when: 'beforeChildren',
    },
  }),
  exit: {
    opacity: 0,
    y: -20,
    scale: 0.95,
    transition: {
      duration: DURATIONS.fast,
      ease: EASINGS.easeIn,
    },
  },
};

// Animation variants for streaming cursor
export const streamingCursorVariants: Variants = {
  visible: {
    opacity: [1, 0, 1],
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
  hidden: {
    opacity: 0,
  },
};

// Animation variants for widget container
export const widgetVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.8,
    y: 20,
    transition: {
      duration: DURATIONS.slow,
      ease: EASINGS.easeOut,
    },
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: DURATIONS.normal,
      ease: EASINGS.spring,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.8,
    y: 20,
    transition: {
      duration: DURATIONS.fast,
      ease: EASINGS.easeIn,
    },
  },
};

// Animation variants for floating button
export const floatingButtonVariants: Variants = {
  open: {
    rotate: 45,
    scale: 1.1,
    transition: {
      duration: DURATIONS.normal,
      ease: EASINGS.spring,
    },
  },
  closed: {
    rotate: 0,
    scale: 1,
    transition: {
      duration: DURATIONS.normal,
      ease: EASINGS.spring,
    },
  },
};

// Animation variants for tooltip
export const tooltipVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 4,
    scale: 0.95,
    transition: {
      duration: DURATIONS.fast,
      ease: EASINGS.easeOut,
    },
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: DURATIONS.fast,
      ease: EASINGS.easeOut,
    },
  },
  exit: {
    opacity: 0,
    y: -4,
    scale: 0.95,
    transition: {
      duration: DURATIONS.fast,
      ease: EASINGS.easeIn,
    },
  },
};

// Animation variants for thinking indicator
export const thinkingIndicatorVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.8,
    transition: {
      duration: DURATIONS.normal,
      ease: EASINGS.easeOut,
    },
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: DURATIONS.normal,
      ease: EASINGS.spring,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.8,
    transition: {
      duration: DURATIONS.fast,
      ease: EASINGS.easeIn,
    },
  },
};

// Optimized motion props for performance
export const getOptimizedMotionProps = (
  variants: Variants,
  performanceLevel?: string
): MotionProps => {
  const level = performanceLevel || getPerformanceLevel();
  const reduceMotion = shouldReduceMotion();
  const perf = PERFORMANCE_LEVELS[level as keyof typeof PERFORMANCE_LEVELS] || PERFORMANCE_LEVELS.medium;

  const baseProps: MotionProps = {
    variants,
    initial: reduceMotion ? 'visible' : 'hidden',
    animate: reduceMotion ? 'visible' : 'visible',
    exit: reduceMotion ? 'hidden' : 'exit',
  };

  if (!perf.enabled || reduceMotion) {
    return {
      ...baseProps,
      transition: { duration: 0 }, // Disable animations
    };
  }

  if (perf.reduceAnimations) {
    return {
      ...baseProps,
      transition: {
        duration: DURATIONS.fast,
        ease: EASINGS.easeOut,
      },
    };
  }

  return baseProps;
};

// Performance monitoring utilities
export class AnimationPerformanceMonitor {
  private frameCount = 0;
  private lastTime = performance.now();
  private fps = 60;
  private animationFrameId: number | null = null;

  start() {
    const measure = () => {
      this.frameCount++;
      const currentTime = performance.now();

      if (currentTime >= this.lastTime + 1000) {
        this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastTime));
        this.frameCount = 0;
        this.lastTime = currentTime;

        // Log performance warnings
        if (this.fps < 30) {
          console.warn(`Low animation performance: ${this.fps} FPS`);
        }
      }

      this.animationFrameId = requestAnimationFrame(measure);
    };

    this.animationFrameId = requestAnimationFrame(measure);
  }

  stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  getFPS() {
    return this.fps;
  }

  isPerformant() {
    return this.fps >= 45;
  }
}