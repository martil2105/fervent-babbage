// Charts draw in briefly, unless the phone asks for reduced motion. Read once
// at start-up: the setting rarely changes while the app is open.
const reduceMotion =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const chartAnimation = {
  isAnimationActive: !reduceMotion,
  animationDuration: 450,
  animationEasing: 'ease-out'
};
