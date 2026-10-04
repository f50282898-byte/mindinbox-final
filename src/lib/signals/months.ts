/**
 * Month keys.
 *
 * Its own module because both the receiver and the retention policy need it, and
 * a route file may only export HTTP handlers — an earlier version of the receiver
 * exported `expiredMonths` and the build refused to compile.
 *
 * UTC on purpose. A month bucket is a storage partition, not something a reader
 * experiences, and partitioning on a local calendar would put the same reader's
 * events in two documents depending on where they were when the month turned.
 */

/** `yyyy-mm` for an instant. */
export function monthKeyOf(at: number): string {
  const d = new Date(at);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Month keys from `from` to `to`, inclusive, ascending. */
export function monthsBetween(from: number, to: number): string[] {
  const a = new Date(from);
  const b = new Date(to);
  const out: string[] = [];
  const cursor = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1));
  const end = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 1);
  while (cursor.getTime() <= end) {
    out.push(monthKeyOf(cursor.getTime()));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}
