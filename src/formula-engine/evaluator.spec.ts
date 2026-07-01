import { evaluateFormula, extractVariables } from './evaluator';
import { FormulaError } from './types';

describe('evaluateFormula', () => {
  it('evaluates basic arithmetic with precedence', () => {
    expect(evaluateFormula('2 + 3 * 4', {})).toBe(14);
    expect(evaluateFormula('(2 + 3) * 4', {})).toBe(20);
    expect(evaluateFormula('10 - 2 - 3', {})).toBe(5); // left-associative
  });

  it('handles division and the /1728 cubic-inch-to-cubic-foot divisor', () => {
    // 72 x 36 x 6 inches -> cubic feet
    expect(evaluateFormula('72 * 36 * 6 / 1728', {})).toBeCloseTo(9, 6);
  });

  it('resolves variables case-insensitively', () => {
    const scope = { LENGTH: 72, width: 36, Thickness: 6 };
    expect(evaluateFormula('length * WIDTH * thickness / 1728', scope)).toBeCloseTo(
      9,
      6,
    );
  });

  it('supports unary minus and height-remainder style formulas', () => {
    const scope = {
      LENGTH: 72,
      WIDTH: 36,
      OVERALL_HEIGHT: 8,
      LAYER1_THICKNESS: 2,
      LAYER2_THICKNESS: 1,
    };
    // remaining height = 8 - 2 - 1 = 5
    expect(
      evaluateFormula(
        'LENGTH * WIDTH * (OVERALL_HEIGHT - LAYER1_THICKNESS - LAYER2_THICKNESS) / 1728',
        scope,
      ),
    ).toBeCloseTo((72 * 36 * 5) / 1728, 6);
  });

  it('supports the power operator (right-associative)', () => {
    expect(evaluateFormula('2 ^ 3', {})).toBe(8);
    expect(evaluateFormula('2 ^ 3 ^ 2', {})).toBe(512); // 2^(3^2)
  });

  it('throws on division by zero', () => {
    expect(() => evaluateFormula('5 / 0', {})).toThrow(FormulaError);
  });

  it('throws on unknown variables', () => {
    expect(() => evaluateFormula('LENGTH * 2', {})).toThrow(/Unknown variable/);
  });

  it('throws on malformed expressions', () => {
    expect(() => evaluateFormula('2 +', {})).toThrow(FormulaError);
    expect(() => evaluateFormula('(2 + 3', {})).toThrow(FormulaError);
    expect(() => evaluateFormula('2 @ 3', {})).toThrow(/Unexpected character/);
  });

  it('is injection-safe (no code execution)', () => {
    expect(() =>
      evaluateFormula('process.exit(1)', { process: 0 } as never),
    ).toThrow(FormulaError);
  });
});

describe('extractVariables', () => {
  it('returns referenced variable names, upper-cased and de-duplicated', () => {
    expect(
      extractVariables('Length * width * (overall_height - length) / 1728').sort(),
    ).toEqual(['LENGTH', 'OVERALL_HEIGHT', 'WIDTH']);
  });
});
