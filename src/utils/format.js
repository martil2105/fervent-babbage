// Small display formatters shared by the screens. Dates follow the phone's
// locale; figures are rounded for reading, never for storage.

const DAY_MS = 86400000;

// "6 days ago" reads faster between sets than a date does.
export const daysAgo = (ts, now) => {
  if (!ts) return null;
  const days = Math.max(0, Math.floor((now - ts) / DAY_MS));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
};

// "Thu, Sep 24" — with the year only when it isn't this year.
export const sessionDate = (ts, now = ts) => {
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' })
  });
};

// "September 2026"
export const monthLabel = (ts) =>
  new Date(ts).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

// 12480 -> "12,480" (or "12 480", by locale)
export const formatNumber = (n) => Math.round(n || 0).toLocaleString();

// "Increase Weight" -> "Increase weight"
export const sentenceCase = (text) =>
  text ? text.charAt(0) + text.slice(1).toLowerCase() : '';
