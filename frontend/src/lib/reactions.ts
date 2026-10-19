export interface ReactionState {
  counts: Record<string, number>;
  user: string[];
}

// Use the server's active state, rather than assuming each response flips local state.
export function applyReaction(previous: ReactionState, emoji: string, active: boolean): ReactionState {
  const delta = Number(active) - Number(previous.user.includes(emoji));
  const counts = { ...previous.counts };
  const count = Math.max(0, (counts[emoji] || 0) + delta);
  if (count > 0) counts[emoji] = count;
  else delete counts[emoji];
  return { counts, user: active ? [...new Set([...previous.user, emoji])] : previous.user.filter(value => value !== emoji) };
}
