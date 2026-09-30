import { useEffect, useRef } from 'react';
import { notifyRestComplete } from '../utils/restNotification';

// How long "rest complete" stays on screen before the timer clears itself.
export const REST_COMPLETE_LINGER_MS = 6000;

// An expiry older than this (the app was closed through it) is cleared
// quietly rather than buzzing the phone the moment the app is reopened.
const STALE_ALERT_MS = 60000;

// The exercise holding the most recently ticked set — what you're resting from.
const restingFrom = (workout) => {
  let name = null;
  let latest = -Infinity;
  (workout?.exercises || []).forEach((ex) => {
    (ex.sets || []).forEach((s) => {
      if (s.completedAt && s.completedAt > latest) {
        latest = s.completedAt;
        name = ex.name;
      }
    });
  });
  return name;
};

/**
 * Fires the end-of-rest alert (vibration, plus a notification when the app is
 * in the background) exactly once per rest interval, then clears the timer.
 *
 * This lives at the app root rather than in the workout screen. It used to be
 * an effect inside WorkoutActive, which had two problems: switching to another
 * tab mid-rest unmounted it, so the alert never came; and it listed the
 * (unmemoised) clearRestTimer as a dependency, so every re-render during the
 * "rest complete" window re-armed it and buzzed again.
 */
export function useRestAlarm({ restEndTime, clearRestTimer, currentWorkout }) {
  const clearRef = useRef(clearRestTimer);
  const workoutRef = useRef(currentWorkout);
  const alertedFor = useRef(null);

  useEffect(() => {
    clearRef.current = clearRestTimer;
    workoutRef.current = currentWorkout;
  });

  useEffect(() => {
    if (!restEndTime) return undefined;

    const check = () => {
      const now = Date.now();
      if (now < restEndTime) return;

      if (alertedFor.current !== restEndTime) {
        alertedFor.current = restEndTime;
        if (now - restEndTime < STALE_ALERT_MS) {
          if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate([300, 100, 300]);
          }
          // No-ops unless permission was granted and the app is backgrounded.
          notifyRestComplete({ exerciseName: restingFrom(workoutRef.current) });
        }
      }

      // Measured from the expiry itself, so a re-render or remount can't
      // postpone it the way a fresh setTimeout would.
      if (now >= restEndTime + REST_COMPLETE_LINGER_MS) clearRef.current?.();
    };

    check();
    const id = setInterval(check, 500);
    return () => clearInterval(id);
  }, [restEndTime]);
}
