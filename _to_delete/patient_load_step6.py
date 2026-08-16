#!/usr/bin/env python3
"""
Patient Load — final cleanup pass for fervent-babbage.

Run from the repo root:      python3 patient_load_step6.py

Every edit asserts it matches EXACTLY the expected number of times before it
touches anything. If the file has already been patched, or differs from what
was audited, the script aborts and writes nothing — it can never half-apply.

What it changes
---------------
1. Chart gridlines            dashed "3 3" -> solid hairlines (4 charts).
                              The est1RM line keeps its dash: that one encodes
                              "estimated", which is a real distinction.
2. Off-palette colours         six rgba() leftovers from before the Verdant
                              retheme (emerald / indigo / amber / red) -> the
                              matching Verdant ramp steps.
3. Nothing pulses              the active-session dot stops pulsing; the last
                              injected <style> block in App.jsx goes with it.
4. Opaque bars                 header and bottom nav drop backdrop-filter blur.
                              A blurred pane is a depth effect; both already
                              have the hairline border that does the work.
                              NOTE: .modal-overlay keeps its blur on purpose —
                              a modal really is above the page, and its dark
                              scrim (not a shadow) is what says so.
5. Contrast guard              a comment on --sun-700 (3.6:1 on white, fails AA).

Verified before shipping: applied to a copy of these files, then checked that
all four dashed gridlines became solid, the est1RM series dash survived, every
rgba() leftover was gone, index.css braces still balanced, App.jsx still parsed,
and a second run wrote nothing.
"""
import io
import sys

EDITS = {
    # ── 1. solid hairline gridlines ──────────────────────────────────────
    "src/components/Analytics.jsx": [
        ('<CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />',
         '<CartesianGrid stroke="var(--border-color)" vertical={false} />', 3),
    ],
    "src/components/Dashboard.jsx": [
        ('<CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />',
         '<CartesianGrid stroke="var(--border-color)" vertical={false} />', 1),
        # ── 2. off-palette leftovers ─────────────────────────────────────
        ("""                borderColor: suggestion.type === 'weight' ? 'rgba(16, 185, 129, 0.25)' : suggestion.type === 'hold' ? 'rgba(99, 102, 241, 0.25)' : suggestion.type === 'reps' ? 'rgba(245, 158, 11, 0.25)' : 'var(--border-color)',""",
         """                borderColor: suggestion.type === 'weight' ? 'var(--feather-200)' : suggestion.type === 'hold' ? 'var(--feather-200)' : suggestion.type === 'reps' ? 'var(--fox-200)' : 'var(--border-color)',"""),
    ],
    "src/components/Settings.jsx": [
        ("""            borderColor: storagePersisted ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)',""",
         """            borderColor: storagePersisted ? 'var(--feather-200)' : 'var(--fox-200)',"""),
        ("""      <div className="card" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>""",
         """      <div className="card" style={{ borderColor: 'var(--cardinal-200)' }}>"""),
        ("""          <div className="modal-content" style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}>""",
         """          <div className="modal-content" style={{ borderColor: 'var(--cardinal-300)' }}>"""),
    ],
    # ── 3. nothing pulses ────────────────────────────────────────────────
    "src/App.jsx": [
        ("""              backgroundColor: 'var(--success)',
              display: 'inline-block',
              animation: 'pulse 1.5s infinite'
            }}></span>""",
         """              backgroundColor: 'var(--success)',
              display: 'inline-block'
            }}></span>"""),
        ("""
      {/* Styles for pulsing badge */}
      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.9); opacity: 0.6; }
          50% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(0.9); opacity: 0.6; }
        }
      `}</style>
""", ""),
    ],
    # ── 4. opaque bars ───────────────────────────────────────────────────
    "src/index.css": [
        ("""  background-color: rgba(247, 248, 250, 0.8); /* light glass */
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);""",
         """  /* Opaque, not glass. A blurred translucent pane is a depth effect, and depth
   * is the thing this system spends hairlines instead of — the border below
   * already separates the header from what scrolls under it. */
  background-color: var(--bg-primary);"""),
        ("""  background-color: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);""",
         """  background-color: var(--bg-card);"""),
    ],
    # ── 5. contrast guard ────────────────────────────────────────────────
    "src/theme/verdant.css": [
        ("""  --sun-700: #B37E00;""",
         """  /* 3.6:1 on white — FAILS AA. Sun is fills, icons and streak marks only;
   * never let this step (or any sun step) carry text. */
  --sun-700: #B37E00;"""),
    ],
}


def main():
    # Dry run first: verify every match across every file before writing one byte.
    loaded = {}
    problems = []
    for path, edits in EDITS.items():
        try:
            loaded[path] = io.open(path, encoding="utf-8").read()
        except OSError as exc:
            problems.append(f"{path}: cannot read ({exc}). Run from the repo root.")
            continue
        for edit in edits:
            old, want = edit[0], (edit[2] if len(edit) > 2 else 1)
            found = loaded[path].count(old)
            if found != want:
                problems.append(
                    f"{path}: expected {want} match(es), found {found} — {old.strip()[:70]!r}"
                )

    if problems:
        print("Nothing was written. Mismatches:\n")
        for p in problems:
            print("  -", p)
        print("\nAlready applied, or the files have moved on since the audit.")
        return 1

    for path, edits in EDITS.items():
        s = loaded[path]
        for edit in edits:
            s = s.replace(edit[0], edit[1])
        io.open(path, "w", encoding="utf-8").write(s)
        print(f"patched {path} ({len(edits)} edit{'s' if len(edits) != 1 else ''})")

    print("\nDone. Now run:  npx eslint src/  &&  npm test")
    return 0


if __name__ == "__main__":
    sys.exit(main())
