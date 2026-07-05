/**
 * DuelScreen — race the ghost of your last session, set by set. XP, combo,
 * edges. Weight steppers honour each exercise's whole-kg weightStep (no
 * decimals). On finish it hands the logged sets back so the session is saved
 * to real history and the result drives the celebration.
 */
import { useState } from 'react';
import { Swords, Zap, Ghost, TrendingUp, Check, Flag } from 'lucide-react';
import { Card, Button, Badge, Stepper, ProgressBar } from './ui';

const vol = (s) => (parseFloat(s.w) || 0) * (parseInt(s.r) || 0);

export default function DuelScreen({ ghost, onFinish, onAward }) {
  const [exs, setExs] = useState(() =>
    ghost.exercises.map((e) => ({
      ...e,
      sets: e.ghostSets.map((g) => ({ w: g.w, r: g.r, done: false })),
    }))
  );
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [xp, setXp] = useState(0);
  const [toast, setToast] = useState(null);

  const allSets = exs.flatMap((e) => e.sets);
  const doneCount = allSets.filter((s) => s.done).length;
  const totalCount = allSets.length;

  const yourVol = Math.round(allSets.filter((s) => s.done).reduce((a, s) => a + vol(s), 0));
  const ghostSetsFlat = ghost.exercises.flatMap((e) => e.ghostSets);
  const ghostVolPaced = Math.round(ghostSetsFlat.slice(0, doneCount).reduce((a, s) => a + vol(s), 0));
  const ghostVolTotal = Math.round(ghostSetsFlat.reduce((a, s) => a + vol(s), 0));
  const lead = yourVol - ghostVolPaced;

  const fire = (label, tone) => setToast({ id: Date.now(), label, tone });

  const upd = (ei, si, key, val) =>
    setExs((prev) => prev.map((e, i) => (i !== ei ? e : { ...e, sets: e.sets.map((s, j) => (j !== si ? s : { ...s, [key]: val })) })));

  const toggle = (ei, si) => {
    const s = exs[ei].sets[si];
    const g = exs[ei].ghostSets[si];
    if (!s.done) {
      const mult = combo >= 2 ? 2 : 1;
      const edge = g && vol(s) > vol(g);
      const gain = (15 + (edge ? 10 : 0)) * mult;
      setXp((x) => x + gain);
      setCombo((c) => {
        const next = c + 1;
        setMaxCombo((m) => Math.max(m, next));
        return next;
      });
      onAward && onAward(gain);
      fire(edge ? `EDGE! +${gain} XP` : `+${gain} XP${mult > 1 ? ' (×2)' : ''}`, edge ? 'success' : 'accent');
    } else {
      setCombo(0);
    }
    upd(ei, si, 'done', !s.done);
  };

  const finish = () => {
    const edges = exs.reduce(
      (n, e) => n + e.sets.filter((s, i) => s.done && e.ghostSets[i] && vol(s) > vol(e.ghostSets[i])).length,
      0
    );
    const victory = yourVol > ghostVolTotal;
    onFinish(
      {
        yourVol,
        ghostVol: ghostVolTotal,
        xp: xp + (victory ? 50 : 0),
        victory,
        edges,
        sets: doneCount,
        combo: maxCombo,
      },
      exs
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative' }}>
      {/* XP toast */}
      {toast && (
        <div key={toast.id} style={{ position: 'absolute', top: -6, right: 0, zIndex: 30, pointerEvents: 'none', animation: 'duel-toast 1.4s var(--ease-spring) forwards' }}>
          <Badge tone={toast.tone} style={{ fontSize: 12, padding: '4px 10px', boxShadow: 'var(--shadow-md)' }}>{toast.label}</Badge>
        </div>
      )}

      {/* Duel banner */}
      <Card style={{ borderColor: 'var(--border-accent)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Swords size={14} /> GHOST DUEL · vs {ghost.label}
          </span>
          <Badge tone={combo >= 2 ? 'warning' : 'neutral'}>
            <Zap size={11} /> Combo ×{combo >= 2 ? 2 : 1}{combo > 0 ? ` · ${combo}` : ''}
          </Badge>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600 }}>
            <span style={{ color: 'var(--accent)' }}>YOU</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{yourVol.toLocaleString()} kg</span>
          </div>
          <ProgressBar value={yourVol} max={ghostVolTotal * 1.1} tone="accent" height={8} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600 }}>
            <span style={{ color: 'var(--text-muted)', display: 'inline-flex', gap: 4, alignItems: 'center' }}><Ghost size={12} /> GHOST</span>
            <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{ghostVolPaced.toLocaleString()} kg</span>
          </div>
          <ProgressBar value={ghostVolPaced} max={ghostVolTotal * 1.1} tone="muted" height={8} />
        </div>

        <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: lead >= 0 ? 'var(--success)' : 'var(--error)' }}>
          {doneCount === 0 ? 'Complete a set to enter the race' : lead >= 0 ? `You lead by ${lead.toLocaleString()} kg` : `Ghost leads by ${Math.abs(lead).toLocaleString()} kg`}
        </div>
      </Card>

      {/* Exercise duel cards */}
      {exs.map((ex, ei) => (
        <div key={ex.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderLeft: `4px solid ${ex.type === 'isolation' ? 'var(--warning)' : 'var(--accent)'}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{ex.name}</h3>
            <Badge tone="neutral">{ex.muscleGroup}</Badge>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '86px 1fr 1fr 38px', gap: 6, fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'center', paddingBottom: 4, borderBottom: '1px solid var(--border-color)' }}>
            <span style={{ textAlign: 'left' }}>GHOST DID</span><span>WEIGHT</span><span>REPS</span><span>LOG</span>
          </div>

          {ex.sets.map((s, si) => {
            const g = ex.ghostSets[si];
            const edge = s.done && g && vol(s) > vol(g);
            return (
              <div key={si} style={{ display: 'grid', gridTemplateColumns: '86px 1fr 1fr 38px', gap: 6, alignItems: 'center', opacity: s.done ? 0.75 : 1 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontVariantNumeric: 'tabular-nums', color: edge ? 'var(--success)' : 'var(--text-muted)', fontWeight: 600 }}>
                  <Ghost size={12} /> {g ? `${g.w} × ${g.r}` : '—'}
                  {edge && <TrendingUp size={12} />}
                </span>
                <Stepper value={s.w} onChange={(v) => upd(ei, si, 'w', v)} step={ex.weightStep || 2} />
                <Stepper value={s.r} onChange={(v) => upd(ei, si, 'r', v)} step={1} />
                <button
                  type="button"
                  onClick={() => toggle(ei, si)}
                  style={{ height: 38, borderRadius: 6, border: '1px solid', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderColor: s.done ? 'var(--success)' : 'var(--border-color)', background: s.done ? 'var(--success-glow)' : 'transparent', color: s.done ? 'var(--success)' : 'var(--text-secondary)' }}
                >
                  <Check size={16} strokeWidth={3} />
                </button>
              </div>
            );
          })}
        </div>
      ))}

      <Button variant="success" onClick={finish} disabled={doneCount === 0}>
        <Flag size={16} /> Finish Duel ({doneCount}/{totalCount} sets)
      </Button>
    </div>
  );
}
