import { buildSerial, buildSerialRun } from './serial';
import { buildMrpLabel } from './mrp-label';

describe('buildSerial', () => {
  const date = new Date(Date.UTC(2026, 6, 3)); // 2026-07-03

  it('formats BRAND-MODEL-YYMMDD-NNNN', () => {
    expect(
      buildSerial({ brandCode: 'NAP', modelCode: 'ORTHO-LUX', date, sequence: 1 }),
    ).toBe('NAP-ORTHOLUX-260703-0001');
  });

  it('sanitizes and upper-cases tokens', () => {
    expect(
      buildSerial({ brandCode: 'nap cat', modelCode: 'eco+plus', date, sequence: 42 }),
    ).toBe('NAPCAT-ECOPLUS-260703-0042');
  });

  it('rejects a non-positive sequence', () => {
    expect(() =>
      buildSerial({ brandCode: 'N', modelCode: 'M', date, sequence: 0 }),
    ).toThrow(/positive integer/);
  });

  it('builds a contiguous run of unique serials', () => {
    const run = buildSerialRun('NAP', 'TOSS', date, 5, 3);
    expect(run).toEqual([
      'NAP-TOSS-260703-0005',
      'NAP-TOSS-260703-0006',
      'NAP-TOSS-260703-0007',
    ]);
    expect(new Set(run).size).toBe(3);
  });
});

describe('buildMrpLabel', () => {
  it('assembles the label with size, warranty and a scannable payload', () => {
    const label = buildMrpLabel({
      serial: 'NAP-ORTHOLUX-260703-0001',
      brandName: 'Napcat',
      modelName: 'Ortho Lux',
      variantName: 'Queen',
      length: 75,
      width: 60,
      height: 6,
      manufacturedOn: new Date(Date.UTC(2026, 6, 3)),
      mrp: 24999,
      warrantyMonths: 120,
    });
    expect(label.size).toBe('75 x 60 x 6 in');
    expect(label.manufacturedOn).toBe('2026-07-03');
    expect(label.warranty).toMatch(/120 months/);
    expect(label.scanPayload).toBe('SN:NAP-ORTHOLUX-260703-0001');
  });

  it('handles missing MRP / warranty gracefully', () => {
    const label = buildMrpLabel({
      serial: 'X',
      brandName: 'B',
      modelName: 'M',
      length: 72.5,
      width: 36,
      height: 8,
      manufacturedOn: new Date(Date.UTC(2026, 0, 1)),
    });
    expect(label.mrp).toBeNull();
    expect(label.warranty).toBeNull();
    expect(label.size).toBe('72.5 x 36 x 8 in');
  });
});
