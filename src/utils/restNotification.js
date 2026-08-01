/**
 * Rest-timer notifications.
 *
 * Vibration only reaches you if the phone is in your hand and the app is in
 * front — which is exactly not the case between sets, when you've usually
 * switched to something else. A notification covers that gap.
 *
 * Deliberately opt-in: permission is only ever requested from an explicit
 * Settings toggle, never mid-workout, because a prompt that interrupts a set
 * is worse than no notification at all.
 */

export const notificationsSupported = () =>
  typeof window !== 'undefined' && 'Notification' in window;

/** 'granted' | 'denied' | 'default' | 'unsupported' */
export const notificationPermission = () =>
  notificationsSupported() ? Notification.permission : 'unsupported';

/**
 * Ask for permission. Must be called from a user gesture — browsers reject
 * (and Safari throws on) requests made outside one.
 */
export const requestNotificationPermission = async () => {
  if (!notificationsSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
};

/**
 * Fire the "rest over" notification, but only when the page is actually hidden.
 * If the user is looking at the app, the flashing timer already tells them and
 * a second alert is just noise.
 *
 * Prefers the service worker registration: on Android (and installed PWAs) a
 * plain `new Notification()` throws once the page is backgrounded, whereas
 * showNotification via the registration is the supported path.
 */
export const notifyRestComplete = async ({ exerciseName } = {}) => {
  if (!notificationsSupported()) return false;
  if (Notification.permission !== 'granted') return false;
  if (typeof document !== 'undefined' && !document.hidden) return false;

  const title = 'Rest complete';
  const options = {
    body: exerciseName ? `Next set: ${exerciseName}` : 'Time for your next set.',
    tag: 'rest-complete',        // replaces any previous one instead of stacking
    renotify: true,
    silent: false
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, options);
        return true;
      }
    }
    new Notification(title, options);
    return true;
  } catch {
    // Notification delivery is best-effort; the vibration already fired.
    return false;
  }
};
