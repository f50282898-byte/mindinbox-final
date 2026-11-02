type Turn = { role: string; content: string };

/** Preserve the question and spend the remaining wire budget on the newest context. */
export function recentWisdomTurns(turns: Turn[]): Turn[] {
  const encoder = new TextEncoder();
  const selected: Turn[] = [];
  let bytes = 0;
  for (let index = turns.length - 1; index >= 0 && selected.length < 40; index--) {
    const turn = { role: turns[index].role, content: turns[index].content.slice(0, 4000) };
    const size = encoder.encode(JSON.stringify(turn)).length + 1;
    // The route caps JSON at 64 KiB. Leave room for the envelope and persona.
    if (bytes + size > 60 * 1024) break;
    selected.push(turn);
    bytes += size;
  }
  return selected.reverse();
}
