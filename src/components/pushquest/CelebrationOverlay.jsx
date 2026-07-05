/**
 * CelebrationOverlay — Duolingo-style session-complete sequence with an XP
 * count-up and (on a win) a confetti burst in the brand palette.
 */
import { useState, useEffect } from 'react';
import { Trophy, Ghost, Flame, Crown } from 'lucide-react';
import confetti from 'canvas-confetti';
import { Button, Badge } from './ui';

const cel = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: '12px 6px', display: 'flex', flexDirection: 'column', gap: 2 };
const celVal = { fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums' };
const celCap = { fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' };

export default function CelebrationOverlay({ results, streak, celebration = 'full', onContinue }) {
  const [shownXp, setShownXp] = useState(0);
  const win = results.victory;

  // XP count-up (~1.2s, cubic ease-out)
  useEffect(() => {
    const target = results.xp;
    if (target <= 0) return undefined;
    const t0 = performance.now();
    const dur = 1200;
    let raf;
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      setShownXp(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [results.xp]);

  // Confetti (win only, unless subtle)
  useEffect(() => {
    if (!win || celebration === 'subtle' || typeof confetti !== 'function') return undefined;
    const shot = (opts) => confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 }, colors: ['#58cc02', '#1cb0f6', '#ffc800', '#ff4b4b'], ...opts });
    shot();
    const t = setTimeout(() => shot({ particleCount: 50, spread: 100 }), 350);
    return () => clearTimeout(t);
  }, [win, celebration]);

  const delta = results.yourVol - results.ghostVol;

  return (
    <div style={{ position: 'fixed', top: 0, bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 'var(--app-max-width)', zIndex: 2000, background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: 28, textAlign: 'center', animation: 'push-modal-in .25s var(--ease-spring)' }}>
      <div style={{ width: 88, height: 88, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: win ? 'var(--success-glow)' : 'var(--accent-glow)', border: `2px solid ${win ? 'var(--success)' : 'var(--accent)'}`, animation: 'cel-bob 1.4s ease-in-out infinite alternate' }}>
        {win ? <Trophy size={42} style={{ color: 'var(--success)' }} /> : <Ghost size={42} style={{ color: 'var(--accent)' }} />}
      </div>

      <div>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '.02em', color: win ? 'var(--success)' : 'var(--text-primary)' }}>
          {win ? 'GHOST DEFEATED' : 'GHOST SURVIVED'}
        </h2>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
          {win
            ? `You out-lifted ${results.ghostVol.toLocaleString()} kg by ${delta.toLocaleString()} kg. A stronger ghost takes its place.`
            : `${Math.abs(delta).toLocaleString()} kg short. The ghost is still ahead — it's waiting for the rematch.`}
        </p>
      </div>

      {/* XP tally */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 44, fontWeight: 700, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>+{shownXp}</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', color: 'var(--text-muted)' }}>XP EARNED</span>
      </div>

      {/* Stat rows */}
      <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <div style={cel}><span style={celVal}>{results.sets}</span><span style={celCap}>sets logged</span></div>
        <div style={cel}><span style={{ ...celVal, color: 'var(--success)' }}>{results.edges}</span><span style={celCap}>edges won</span></div>
        <div style={cel}><span style={{ ...celVal, color: 'var(--warning)', display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}><Flame size={16} /> {streak}</span><span style={celCap}>day streak</span></div>
      </div>

      {win && <Badge tone="warning"><Crown size={11} /> New personal ghost banked for next time</Badge>}

      <Button variant={win ? 'success' : 'primary'} onClick={onContinue} style={{ width: '100%', maxWidth: 260 }}>Continue</Button>
    </div>
  );
}
