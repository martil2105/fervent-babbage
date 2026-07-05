/**
 * PushQuest — the game-layer container.
 *
 * Wraps the three surfaces (Quest / Ghost Duel / League) + the celebration
 * overlay in a `.push-quest` themed scope, drives the internal 3-tab sub-nav,
 * and holds the live session counters. All real data + persistence comes from
 * usePushQuest; nothing here leaks into the base tracker's OLED theme.
 */
import { useState } from 'react';
import { Map as MapIcon, Swords, Shield, Flame, Dumbbell } from 'lucide-react';
import './pushquest.css';
import { usePushQuest } from './usePushQuest';
import { SubNav } from './ui';
import QuestScreen from './QuestScreen';
import DuelScreen from './DuelScreen';
import LeagueScreen from './LeagueScreen';
import CelebrationOverlay from './CelebrationOverlay';

const SET_GOAL = 10;

// A modest seed ghost so a brand-new user (no history yet) can still run their
// first session as a duel; it simply becomes the baseline to beat next time.
const buildSeedGhost = (exercises) => ({
  label: 'First session',
  timestamp: null,
  totalVolume: 0,
  exercises: exercises.map((e) => ({
    id: e.id,
    name: e.name,
    muscleGroup: e.muscleGroup || 'Other',
    type: e.exerciseType || 'compound',
    minReps: e.minReps ?? 8,
    maxReps: e.maxReps ?? 12,
    rest: e.restDuration || 120,
    weightStep: e.weightStep || (e.exerciseType === 'isolation' ? 1 : 2),
    ghostSets: Array.from({ length: e.targetSets || 3 }, () => ({ w: 20, r: e.minReps || 10 })),
  })),
});

export default function PushQuest({ history = [], exercises = [] }) {
  const data = usePushQuest(history, exercises);
  const [tab, setTab] = useState('quest');
  const [ghostSource, setGhostSource] = useState('last'); // 'last' | 'pb'
  const [liveXp, setLiveXp] = useState(0);
  const [liveSets, setLiveSets] = useState(0);
  const [ghostBeaten, setGhostBeaten] = useState(false);
  const [results, setResults] = useState(null);

  const realGhost = ghostSource === 'pb' ? data.pbGhost : data.ghost;
  const seed = buildSeedGhost(exercises);
  const activeGhost = realGhost || (seed.exercises.length > 0 ? seed : null);

  const player = { ...data.player, xp: data.player.xp + liveXp };
  const questProgress = { sets: data.setsToday + liveSets, setGoal: SET_GOAL, ghostBeaten };

  const startDuel = () => {
    setLiveXp(0);
    setLiveSets(0);
    setTab('duel');
  };

  const handleAward = (gain) => {
    setLiveXp((x) => x + gain);
    setLiveSets((s) => s + 1);
  };

  const handleFinish = async (res, duelExercises) => {
    setResults(res); // show celebration immediately (uses res.xp for the count-up)
    if (res.victory) setGhostBeaten(true);
    await data.finishDuel(res, duelExercises);
    // History + gameState now include this session, so drop the live deltas to
    // avoid double-counting against the freshly-recomputed totals.
    setLiveXp(0);
    setLiveSets(0);
  };

  const items = [
    { id: 'quest', label: 'Quest', icon: <MapIcon size={18} /> },
    { id: 'duel', label: 'Duel', icon: <Swords size={18} />, dot: liveSets > 0 && !results },
    { id: 'league', label: 'League', icon: <Shield size={18} /> },
  ];

  return (
    <div className="push-quest">
      {/* Game header strip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--gradient-title)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          <Dumbbell size={20} style={{ transform: 'rotate(-45deg)', color: '#58cc02', WebkitTextFillColor: 'initial' }} /> PUSH QUEST
        </h2>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: 'var(--warning-glow)', color: 'var(--warning)', border: '1px solid rgba(255,200,0,.35)', fontVariantNumeric: 'tabular-nums' }}>
          <Flame size={13} /> {player.streak}
        </span>
      </div>

      {/* Ghost difficulty toggle (Last session vs All-time PB) */}
      {data.pbGhost && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, color: 'var(--text-secondary)' }}>
          <span style={{ fontWeight: 600 }}>Ghost:</span>
          {[{ id: 'last', label: 'Last session' }, { id: 'pb', label: 'All-time PB' }].map((o) => {
            const on = ghostSource === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setGhostSource(o.id)}
                style={{ cursor: 'pointer', border: `1px solid ${on ? 'var(--border-accent)' : 'var(--border-color)'}`, background: on ? 'var(--accent-glow)' : 'transparent', color: on ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: 600, fontSize: 11, padding: '3px 10px', borderRadius: 20 }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}

      <SubNav items={items} active={tab} onChange={setTab} />

      <div key={tab} style={{ animation: 'push-slide-up .3s var(--ease-spring)' }}>
        {tab === 'quest' && (
          <QuestScreen player={player} questProgress={questProgress} path={data.path} ghost={data.ghost} onStartDuel={startDuel} />
        )}
        {tab === 'duel' && (
          activeGhost ? (
            <DuelScreen key={ghostSource + (activeGhost.label || '')} ghost={activeGhost} onFinish={handleFinish} onAward={handleAward} />
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px 20px', fontSize: 14 }}>
              Add an exercise in Settings to start a Ghost Duel.
            </div>
          )
        )}
        {tab === 'league' && (
          <LeagueScreen leagueRows={data.leagueRows} achievements={data.achievements} />
        )}
      </div>

      {results && (
        <CelebrationOverlay
          results={results}
          streak={player.streak}
          celebration="full"
          onContinue={() => { setResults(null); setTab('league'); }}
        />
      )}
    </div>
  );
}
