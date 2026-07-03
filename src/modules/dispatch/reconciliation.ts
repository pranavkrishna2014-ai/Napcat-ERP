/**
 * Dispatch ↔ invoice reconciliation — pure and unit-tested.
 *
 * Compares the serials the factory physically dispatched against the serials
 * Tally invoiced, surfacing either-side mismatches for the dispatch desk.
 */

export interface ReconResult {
  ok: boolean;
  matched: string[];
  /** Dispatched but not on any imported invoice. */
  dispatchedNotInvoiced: string[];
  /** Invoiced in Tally but never dispatched from the factory. */
  invoicedNotDispatched: string[];
}

export function reconcileDispatch(
  dispatched: string[],
  invoiced: string[],
): ReconResult {
  const d = new Set(dispatched.map((s) => s.trim()));
  const i = new Set(invoiced.map((s) => s.trim()));

  const matched: string[] = [];
  const dispatchedNotInvoiced: string[] = [];
  const invoicedNotDispatched: string[] = [];

  for (const s of d) {
    if (i.has(s)) matched.push(s);
    else dispatchedNotInvoiced.push(s);
  }
  for (const s of i) {
    if (!d.has(s)) invoicedNotDispatched.push(s);
  }

  return {
    ok: dispatchedNotInvoiced.length === 0 && invoicedNotDispatched.length === 0,
    matched: matched.sort(),
    dispatchedNotInvoiced: dispatchedNotInvoiced.sort(),
    invoicedNotDispatched: invoicedNotDispatched.sort(),
  };
}
