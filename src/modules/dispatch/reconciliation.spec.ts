import { reconcileDispatch } from './reconciliation';

describe('reconcileDispatch', () => {
  it('matches when dispatched and invoiced serials align', () => {
    const r = reconcileDispatch(['A', 'B'], ['B', 'A']);
    expect(r.ok).toBe(true);
    expect(r.matched).toEqual(['A', 'B']);
    expect(r.dispatchedNotInvoiced).toEqual([]);
    expect(r.invoicedNotDispatched).toEqual([]);
  });

  it('flags serials dispatched but not invoiced', () => {
    const r = reconcileDispatch(['A', 'B', 'C'], ['A']);
    expect(r.ok).toBe(false);
    expect(r.dispatchedNotInvoiced).toEqual(['B', 'C']);
  });

  it('flags serials invoiced but not dispatched', () => {
    const r = reconcileDispatch(['A'], ['A', 'X']);
    expect(r.ok).toBe(false);
    expect(r.invoicedNotDispatched).toEqual(['X']);
  });

  it('trims whitespace before comparing', () => {
    const r = reconcileDispatch([' A '], ['A']);
    expect(r.ok).toBe(true);
    expect(r.matched).toEqual(['A']);
  });
});
