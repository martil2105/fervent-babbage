import { useState } from 'react';
import { formatWeight, parseWeightText } from '../utils/workoutHelpers';

/**
 * A weight field that can actually take "27.5" on a phone.
 *
 * `type="number"` couldn't: iOS opens a keypad with no decimal key for
 * inputMode="numeric", and with a European region the decimal keypad types a
 * comma, which a number input silently turns into an empty value. This is a
 * text field with the decimal keypad instead, accepting "," or "." and
 * snapping to the half-kilo grid.
 *
 * While typing it keeps showing exactly what was typed ("27," on the way to
 * "27,5") — unless the value was changed from outside meanwhile, e.g. by the
 * +/- buttons, in which case the new value wins.
 */
export default function WeightInput({ value, onChange, ...rest }) {
  const [draft, setDraft] = useState(null); // { text, committed } while typing

  const formatted = value === '' || value === null || value === undefined ? '' : formatWeight(value);
  const shown = draft && draft.committed === value ? draft.text : formatted;

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      enterKeyHint="done"
      value={shown}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const parsed = parseWeightText(e.target.value);
        if (!parsed.valid) return; // ignore letters and a second decimal mark
        setDraft({ text: e.target.value, committed: parsed.value });
        onChange(parsed.value);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}
