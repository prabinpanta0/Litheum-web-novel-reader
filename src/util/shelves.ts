/**
 * Library shelves (folders).
 *
 * A book belongs to exactly one shelf. The shelf is stored on the book's
 * `tags` array using a reserved `shelf:`-prefixed tag so it persists with
 * the rest of the library without introducing a new column. Books with no
 * shelf tag fall back to "Plan To Read" (the default when adding to the
 * library).
 */

export type ShelfKey = 'reading' | 'plan' | 'completed' | 'onhold';

export const SHELF_TAG: Record<ShelfKey, string> = {
  reading: 'shelf:reading',
  plan: 'shelf:plan',
  completed: 'shelf:completed',
  onhold: 'shelf:on-hold',
};

export const SHELVES: { key: ShelfKey; label: string }[] = [
  { key: 'plan', label: 'Plan To Read' },
  { key: 'reading', label: 'Reading' },
  { key: 'completed', label: 'Completed' },
  { key: 'onhold', label: 'On Hold' },
];

/** The shelf a book currently sits on (defaults to plan-to-read). */
export function shelfOf(tags: string[]): ShelfKey {
  for (const { key } of SHELVES) {
    if (tags.includes(SHELF_TAG[key])) return key;
  }
  return 'plan';
}

export function shelfLabel(key: ShelfKey): string {
  return SHELVES.find((s) => s.key === key)?.label ?? 'Plan To Read';
}

/** Return a new tags array with the shelf set to `key`. */
export function withShelf(tags: string[], key: ShelfKey): string[] {
  return [...tags.filter((t) => !t.startsWith('shelf:')), SHELF_TAG[key]];
}
