// The reactions a league may use.
//
// A fixed set rather than a free emoji field: five targets stay tappable on a
// phone, and an open text field is an open text field.
export const REACTIONS = ['🔥', '💀', '😂', '🫡', '🤬'] as const;

export type Reaction = (typeof REACTIONS)[number];

export function isReaction(value: unknown): value is Reaction {
  return typeof value === 'string' && (REACTIONS as readonly string[]).includes(value);
}
