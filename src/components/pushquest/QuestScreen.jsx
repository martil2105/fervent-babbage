/**
 * QuestScreen — Duolingo-style training path: stats bar, coach bubble, daily
 * quests, and the snaking week path. All copy/geometry mirror the handoff; the
 * numbers come from the real player + weekly path derived in usePushQuest.
 */
import { Flame, Zap, Shield, Swords, Ghost, Map as MapIcon, Play, Check, Lock, Gift, Moon, Crown } from 'lucide-react';
import { Card, Button, ProgressBar } from './ui';

const LOGO = `${import.meta.env.BASE_URL}icon-192.png`;

// --- Path geometry (identical to the prototype) ---------------------------
const NODE_GAP = 96;
const TOP_PAD = 46;
const W = 344;
const offset = (i) => Math.round(Math.sin((i * Math.PI) / 3) * 86);
const pt = (i) => ({ x: W / 2 + offset(i), y: TOP_PAD + i * NODE_GAP });

function pathD(from, to) {
  let d = '';
  for (let i = from; i <= to; i++) {
    const p = pt(i);
    if (i === from) {
      d += `M${p.x},${p.y}`;
      continue;
    }
    const prev = pt(i - 1);
    const ym = (prev.y + p.y) / 2;
    d += ` C${prev.x},${ym} ${p.x},${ym} ${p.x},${p.y}`;
  }
  return d;
}

const statChip = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: 14,
  padding: '10px 6px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 2,
  fontSize: 15,
  fontWeight: 700,
};
const chipCap = { fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' };

function Node({ node, index, onStart }) {
  const p = pt(index);
  const isRest = node.status === 'rest';
  const size = isRest ? 40 : 64;
  const base = {
    position: 'absolute',
    left: p.x - size / 2,
    top: p.y - size / 2,
    width: size,
    height: size,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--border-color)',
    boxSizing: 'border-box',
  };
  const styles = {
    done: { background: 'var(--accent)', border: 'none', boxShadow: '0 5px 0 var(--accent-hover), var(--shadow-accent)' },
    current: { background: 'var(--bg-card)', border: '2px solid var(--accent)', cursor: 'pointer', animation: 'quest-ring 1.6s var(--ease-standard) infinite' },
    locked: { background: 'var(--bg-card)', opacity: 0.55 },
    bonus: { background: 'var(--warning-glow)', border: '1px solid rgba(255,200,0,.4)' },
    rest: { background: 'var(--bg-secondary)', opacity: 0.7 },
  };
  const icons = {
    done: <Check size={26} strokeWidth={3.5} style={{ color: '#fff' }} />,
    current: <Play size={24} fill="currentColor" style={{ color: 'var(--accent)', marginLeft: 3 }} />,
    locked: <Lock size={20} style={{ color: 'var(--text-muted)' }} />,
    bonus: <Gift size={22} style={{ color: 'var(--warning)' }} />,
    rest: <Moon size={16} style={{ color: 'var(--text-muted)' }} />,
  };
  return (
    <div onClick={node.status === 'current' ? onStart : undefined} style={{ ...base, ...styles[node.status] }}>
      {icons[node.status]}
      {node.crown ? (
        <span style={{ position: 'absolute', top: -7, right: -9, background: 'var(--bg-primary)', border: '1px solid rgba(255,200,0,.5)', borderRadius: 20, padding: '1px 6px', display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, fontWeight: 700, color: 'var(--warning)' }}>
          <Crown size={10} /> {node.crown}
        </span>
      ) : null}
      {node.status === 'current' && (
        <span style={{ position: 'absolute', top: -34, left: '50%', transform: 'translateX(-50%)', background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', padding: '4px 10px', borderRadius: 10, whiteSpace: 'nowrap', animation: 'quest-bob 1.2s ease-in-out infinite alternate' }}>
          START
          <span style={{ position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%) rotate(45deg)', width: 8, height: 8, background: 'var(--accent)' }} />
        </span>
      )}
      <span style={{ position: 'absolute', top: '100%', marginTop: 6, left: '50%', transform: 'translateX(-50%)', fontSize: 10, fontWeight: 600, color: node.status === 'current' ? 'var(--text-primary)' : 'var(--text-muted)', whiteSpace: 'nowrap', textAlign: 'center' }}>
        {node.day} · {node.label}
      </span>
    </div>
  );
}

export default function QuestScreen({ player, questProgress, path = [], ghost, onStartDuel }) {
  let progressIdx = -1;
  path.forEach((n, i) => { if (n.status === 'done' || n.status === 'current') progressIdx = i; });
  const H = TOP_PAD + (Math.max(path.length, 1) - 1) * NODE_GAP + 60;
  const doneCount = path.filter((n) => n.status === 'done').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <div style={statChip}><Flame size={18} style={{ color: 'var(--warning)' }} /><b style={{ color: 'var(--warning)' }}>{player.streak}</b><span style={chipCap}>day streak</span></div>
        <div style={statChip}><Zap size={18} style={{ color: 'var(--accent)' }} /><b style={{ color: 'var(--accent)' }}>{player.xp.toLocaleString()}</b><span style={chipCap}>XP</span></div>
        <div style={statChip}><Shield size={18} style={{ color: 'var(--text-secondary)' }} /><b>{player.league}</b><span style={chipCap}>league</span></div>
      </div>

      {/* Coach bubble */}
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }} bodyStyle={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <img src={LOGO} alt="Coach" style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: 'var(--text-secondary)' }}>
            {ghost ? (
              <>Your last ghost lifted <b style={{ color: 'var(--text-primary)' }}>{ghost.totalVolume.toLocaleString()} kg</b>. Beat it today and your streak hits <b style={{ color: 'var(--warning)' }}>{player.streak + 1}</b>.</>
            ) : (
              <>No ghost yet — log a push session and your past self becomes the rival to chase.</>
            )}
          </p>
          <Button variant="primary" size="sm" onClick={onStartDuel} style={{ alignSelf: 'flex-start' }}>
            <Swords size={14} /> {ghost ? 'Start Ghost Duel' : 'Start First Session'}
          </Button>
        </div>
      </Card>

      {/* Daily quests */}
      <Card title="Daily Quests">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontWeight: 600 }}><Zap size={14} style={{ color: 'var(--warning)' }} /> Log {questProgress.setGoal} working sets</span>
              <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{Math.min(questProgress.sets, questProgress.setGoal)} / {questProgress.setGoal}</span>
            </div>
            <ProgressBar value={questProgress.sets} max={questProgress.setGoal} tone="warning" height={6} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontWeight: 600 }}><Ghost size={14} style={{ color: 'var(--accent)' }} /> Defeat your ghost</span>
              <span style={{ color: 'var(--text-muted)' }}>{questProgress.ghostBeaten ? '1 / 1' : '0 / 1'}</span>
            </div>
            <ProgressBar value={questProgress.ghostBeaten ? 1 : 0} max={1} tone="accent" height={6} />
          </div>
        </div>
      </Card>

      {/* Week banner + path */}
      <Card style={{ padding: 0, overflow: 'hidden' }} bodyStyle={{ gap: 0 }}>
        <div style={{ background: 'var(--accent-glow)', borderBottom: '1px solid var(--border-accent)', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--accent)' }}>PUSH BLOCK · THIS WEEK</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
              {doneCount} {doneCount === 1 ? 'session' : 'sessions'} done — finish the week to defend {player.league}
            </div>
          </div>
          <MapIcon size={20} style={{ color: 'var(--accent)' }} />
        </div>
        <div style={{ position: 'relative', width: W, height: H, margin: '0 auto', maxWidth: '100%' }}>
          <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
            <path d={pathD(0, path.length - 1)} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="10" strokeLinecap="round" strokeDasharray="0.1 18" />
            {progressIdx > 0 && (
              <path d={pathD(0, progressIdx)} fill="none" stroke="var(--accent)" strokeWidth="10" strokeLinecap="round" strokeDasharray="0.1 18" opacity="0.85" />
            )}
          </svg>
          {path.map((n, i) => (
            <Node key={n.id} node={n} index={i} onStart={onStartDuel} />
          ))}
        </div>
      </Card>
    </div>
  );
}
