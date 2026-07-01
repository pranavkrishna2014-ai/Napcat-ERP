import { BadRequestException, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';

export type ExcelRow = Record<string, unknown>;

export interface ColumnSpec {
  /** Target field name in the output object. */
  field: string;
  /** Accepted header aliases in the sheet (case/space-insensitive). */
  aliases: string[];
  required?: boolean;
  /** Coerce the raw cell value. */
  type?: 'string' | 'number' | 'boolean';
}

/**
 * Parses uploaded spreadsheets for bulk master-data import. Keeps the ERP's
 * "import, don't type" principle: operators upload a sheet, the system maps and
 * validates columns automatically.
 */
@Injectable()
export class ExcelService {
  /** Parse the first sheet of a workbook buffer into raw row objects. */
  parseBuffer(buffer: Buffer): ExcelRow[] {
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      throw new BadRequestException('Could not read the uploaded file');
    }
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new BadRequestException('Workbook has no sheets');
    return XLSX.utils.sheet_to_json<ExcelRow>(wb.Sheets[sheetName], {
      defval: null,
      raw: true,
    });
  }

  /**
   * Map raw rows to typed records against a column spec, validating required
   * fields. Returns the mapped rows; throws with row-precise messages on error.
   */
  mapRows<T = ExcelRow>(rows: ExcelRow[], columns: ColumnSpec[]): T[] {
    if (rows.length === 0) {
      throw new BadRequestException('The sheet contains no data rows');
    }

    // Build a normalized header -> field lookup from the first row's keys.
    const headerKeys = Object.keys(rows[0]);
    const aliasToField = new Map<string, ColumnSpec>();
    for (const col of columns) {
      for (const alias of col.aliases) {
        aliasToField.set(normalize(alias), col);
      }
    }
    const keyToCol = new Map<string, ColumnSpec>();
    for (const key of headerKeys) {
      const col = aliasToField.get(normalize(key));
      if (col) keyToCol.set(key, col);
    }

    // Ensure all required columns are present.
    const mappedFields = new Set([...keyToCol.values()].map((c) => c.field));
    for (const col of columns) {
      if (col.required && !mappedFields.has(col.field)) {
        throw new BadRequestException(
          `Missing required column for "${col.field}" (accepted: ${col.aliases.join(', ')})`,
        );
      }
    }

    return rows.map((row, i) => {
      const out: Record<string, unknown> = {};
      for (const [key, col] of keyToCol) {
        out[col.field] = coerce(row[key], col, i + 2); // +2: header + 1-indexed
      }
      for (const col of columns) {
        if (col.required && (out[col.field] == null || out[col.field] === '')) {
          throw new BadRequestException(
            `Row ${i + 2}: "${col.field}" is required`,
          );
        }
      }
      return out as T;
    });
  }
}

function normalize(s: string): string {
  return s.toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

function coerce(value: unknown, col: ColumnSpec, rowNo: number): unknown {
  if (value == null || value === '') return null;
  switch (col.type) {
    case 'number': {
      const n = typeof value === 'number' ? value : Number(String(value).trim());
      if (Number.isNaN(n)) {
        throw new BadRequestException(
          `Row ${rowNo}: "${col.field}" must be a number, got "${value}"`,
        );
      }
      return n;
    }
    case 'boolean': {
      const s = String(value).trim().toLowerCase();
      return ['1', 'true', 'yes', 'y'].includes(s);
    }
    default:
      return String(value).trim();
  }
}
