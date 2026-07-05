/**
 * LeagueScreen — the Ghost League (this week vs your past weeks by volume) plus
 * the achievements grid. Standings and earned flags come from real history.
 */
import { Shield, Dumbbell, Ghost, Crown, Lock, Flame, Trophy, Zap } from 'lucide-react';
import { Card, ProgressBar } from './ui';

// Map achievement icon names → lucide components.
const ICONS = { Flame, Ghost, Trophy, Dumbbell, Zap, Crown };

export default function LeagueScreen({ leagueRows = [], achievements = [] }) {
  const rows = [...leagueRows].sort((a, b) => b.vol - a.vol);
  const nowIdx = rows.findIndex((r) => r.tier === 'now');
  const nextUp = nowIdx > 0 ? rows[nowIdx - 1] : null;
  const leader = rows[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* League header */}
      <Card style={{ alignItems: 'center', textAlign: 'center' }} bodyStyle={{ alignItems: 'center', gap: 6 }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--accent-glow)', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Shield size={30} style={{ color: 'var(--accent)' }} />
        </div>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Ghost League</h3>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Every rival is a past week of <b style={{ color: 'var(--text-primary)' }}>you</b>.{' '}
          {rows.length === 0
            ? 'Log a session to enter this week onto the table.'
            : nextUp
              ? <>Out-lift <b style={{ color: 'var(--accent)' }}>{nextUp.label}</b> ({nextUp.vol.toLocaleString()} kg) to climb.</>
              : 'You top the table — set a new all-time week.'}
        </p>
      </Card>

      {/* Standings */}
      {rows.length > 0 && (
        <Card title="This Week's Standings">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map((r, i) => {
              const now = r.tier === 'now';
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 14, border: `1px solid ${now ? 'var(--border-accent)' : 'var(--border-color)'}`, background: now ? 'var(--accent-glow)' : 'var(--bg-secondary)' }}>
                  <span style={{ width: 20, fontSize: 13, fontWeight: 700, color: i === 0 ? 'var(--warning)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
                  <span style={{ display: 'flex', width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-card)', border: '1px solid var(--border-color)', alignItems: 'center', justifyContent: 'center' }}>
                    {now ? <Dumbbell size={14} style={{ color: 'var(--accent)' }} /> : <Ghost size={14} style={{ color: 'var(--text-muted)' }} />}
                  </span>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: now ? 700 : 600 }}>
                      <span style={{ color: now ? 'var(--accent)' : 'var(--text-primary)' }}>{r.label}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.vol.toLocaleString()} kg</span>
                    </div>
                    <ProgressBar value={r.vol} max={leader.vol} tone={now ? 'accent' : 'muted'} height={4} />
                  </div>
                  {i === 0 && <Crown size={16} style={{ color: 'var(--warning)' }} />}
                </div>
              );
            })}
          </div>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>Week resets Monday · finish above a past week to bank its trophy</p>
        </Card>
      )}

      {/* Achievements */}
      <Card title="Achievements">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {achievements.map((a) => {
            const IconComp = a.earned ? (ICONS[a.icon] || Trophy) : Lock;
            const color = a.earned ? (a.tone === 'accent' ? 'var(--accent)' : `var(--${a.tone})`) : 'var(--text-muted)';
            return (
              <div key={a.id} title={a.desc} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 6px', borderRadius: 14, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', opacity: a.earned ? 1 : 0.45 }}>
                <span style={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: a.earned ? `var(--${a.tone}-glow)` : 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                  <IconComp size={18} style={{ color }} />
                </span>
                <span style={{ fontSize: 10, fontWeight: 600, textAlign: 'center', color: a.earned ? 'var(--text-primary)' : 'var(--text-muted)' }}>{a.name}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
