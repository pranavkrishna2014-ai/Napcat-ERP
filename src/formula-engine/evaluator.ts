import { FormulaError, FormulaScope } from './types';

/**
 * A small, safe arithmetic expression evaluator.
 *
 * It intentionally does NOT use `eval` / `Function`. Only the operators needed
 * to reproduce the factory's spreadsheet math are supported:
 *   +  -  *  /  ^   ( )   unary minus
 * plus numeric literals and named variables (case-insensitive, upper-cased).
 *
 * Implemented as a hand-written tokenizer + recursive-descent parser producing
 * a value directly. This keeps formulas fully data-driven and admin-editable
 * without any source changes, while remaining injection-safe.
 */

type TokenType = 'number' | 'ident' | 'op' | 'lparen' | 'rparen';

interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

const OPERATORS = new Set(['+', '-', '*', '/', '^']);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen', value: ch, pos: i });
      i++;
      continue;
    }

    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ch, pos: i });
      i++;
      continue;
    }

    if (OPERATORS.has(ch)) {
      tokens.push({ type: 'op', value: ch, pos: i });
      i++;
      continue;
    }

    // Number literal (supports decimals like 1728 or 0.05).
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let num = '';
      let seenDot = false;
      while (i < input.length) {
        const c = input[i];
        if (c >= '0' && c <= '9') {
          num += c;
          i++;
        } else if (c === '.' && !seenDot) {
          seenDot = true;
          num += c;
          i++;
        } else {
          break;
        }
      }
      tokens.push({ type: 'number', value: num, pos: i });
      continue;
    }

    // Identifier: letters, digits, underscore. Must start with a letter/_.
    if (isIdentStart(ch)) {
      let ident = '';
      while (i < input.length && isIdentPart(input[i])) {
        ident += input[i];
        i++;
      }
      tokens.push({ type: 'ident', value: ident.toUpperCase(), pos: i });
      continue;
    }

    throw new FormulaError(
      `Unexpected character '${ch}' at position ${i}`,
      input,
    );
  }

  return tokens;
}

function isIdentStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}

function isIdentPart(ch: string): boolean {
  return isIdentStart(ch) || (ch >= '0' && ch <= '9');
}

/**
 * Recursive-descent parser/evaluator.
 *
 * Grammar (lowest to highest precedence):
 *   expr    := term   (('+' | '-') term)*
 *   term    := factor (('*' | '/') factor)*
 *   factor  := unary  ('^' factor)?          // right-associative power
 *   unary   := ('-' | '+') unary | primary
 *   primary := number | ident | '(' expr ')'
 */
class Parser {
  private pos = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly scope: FormulaScope,
    private readonly source: string,
  ) {}

  evaluate(): number {
    const value = this.parseExpr();
    if (this.pos < this.tokens.length) {
      throw new FormulaError(
        `Unexpected token '${this.tokens[this.pos].value}'`,
        this.source,
      );
    }
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token {
    const t = this.tokens[this.pos];
    if (!t) {
      throw new FormulaError('Unexpected end of formula', this.source);
    }
    this.pos++;
    return t;
  }

  private parseExpr(): number {
    let value = this.parseTerm();
    while (this.isOp('+') || this.isOp('-')) {
      const op = this.next().value;
      const rhs = this.parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }

  private parseTerm(): number {
    let value = this.parseFactor();
    while (this.isOp('*') || this.isOp('/')) {
      const op = this.next().value;
      const rhs = this.parseFactor();
      if (op === '/') {
        if (rhs === 0) {
          throw new FormulaError('Division by zero', this.source);
        }
        value = value / rhs;
      } else {
        value = value * rhs;
      }
    }
    return value;
  }

  private parseFactor(): number {
    const base = this.parseUnary();
    if (this.isOp('^')) {
      this.next();
      const exponent = this.parseFactor(); // right-associative
      return Math.pow(base, exponent);
    }
    return base;
  }

  private parseUnary(): number {
    if (this.isOp('-')) {
      this.next();
      return -this.parseUnary();
    }
    if (this.isOp('+')) {
      this.next();
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const token = this.next();

    if (token.type === 'number') {
      return parseFloat(token.value);
    }

    if (token.type === 'ident') {
      if (!(token.value in this.scope)) {
        throw new FormulaError(
          `Unknown variable '${token.value}'`,
          this.source,
        );
      }
      const val = this.scope[token.value];
      if (typeof val !== 'number' || Number.isNaN(val)) {
        throw new FormulaError(
          `Variable '${token.value}' has no numeric value`,
          this.source,
        );
      }
      return val;
    }

    if (token.type === 'lparen') {
      const value = this.parseExpr();
      const close = this.next();
      if (close.type !== 'rparen') {
        throw new FormulaError('Expected closing parenthesis', this.source);
      }
      return value;
    }

    throw new FormulaError(
      `Unexpected token '${token.value}'`,
      this.source,
    );
  }

  private isOp(op: string): boolean {
    const t = this.peek();
    return !!t && t.type === 'op' && t.value === op;
  }
}

/**
 * Evaluate a formula string against a scope of numeric variables.
 * Variable lookups are case-insensitive (scope keys are upper-cased).
 */
export function evaluateFormula(formula: string, scope: FormulaScope): number {
  if (formula == null || formula.trim() === '') {
    throw new FormulaError('Empty formula');
  }

  const normalizedScope: FormulaScope = {};
  for (const [key, value] of Object.entries(scope)) {
    normalizedScope[key.toUpperCase()] = value;
  }

  const tokens = tokenize(formula);
  if (tokens.length === 0) {
    throw new FormulaError('Formula produced no tokens', formula);
  }

  const result = new Parser(tokens, normalizedScope, formula).evaluate();

  if (!Number.isFinite(result)) {
    throw new FormulaError('Formula did not produce a finite number', formula);
  }
  return result;
}

/** Return the set of variable names referenced by a formula (upper-cased). */
export function extractVariables(formula: string): string[] {
  const tokens = tokenize(formula);
  const vars = new Set<string>();
  for (const t of tokens) {
    if (t.type === 'ident') {
      vars.add(t.value);
    }
  }
  return [...vars];
}
