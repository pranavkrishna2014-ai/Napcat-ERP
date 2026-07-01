import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { ColumnSpec, ExcelService } from './excel.service';

function makeWorkbook(rows: Record<string, unknown>[]): Buffer {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('ExcelService', () => {
  const service = new ExcelService();

  const columns: ColumnSpec[] = [
    { field: 'code', aliases: ['Code'], required: true },
    { field: 'name', aliases: ['Name', 'Material Name'], required: true },
    { field: 'density', aliases: ['Density'], type: 'number' },
    { field: 'active', aliases: ['Active'], type: 'boolean' },
  ];

  it('parses and maps rows with alias + type coercion', () => {
    const buf = makeWorkbook([
      { Code: 'FOAM-1', 'Material Name': '32D SS', Density: '32', Active: 'yes' },
      { Code: 'FOAM-2', 'Material Name': 'HR Foam', Density: 28, Active: 'no' },
    ]);
    const rows = service.mapRows(service.parseBuffer(buf), columns);
    expect(rows).toEqual([
      { code: 'FOAM-1', name: '32D SS', density: 32, active: true },
      { code: 'FOAM-2', name: 'HR Foam', density: 28, active: false },
    ]);
  });

  it('normalizes header case/spacing when matching aliases', () => {
    const buf = makeWorkbook([{ ' CODE ': 'X', name: 'Y' }]);
    const rows = service.mapRows(service.parseBuffer(buf), columns);
    expect(rows[0].code).toBe('X');
  });

  it('throws when a required column is absent', () => {
    const buf = makeWorkbook([{ Name: 'no code here' }]);
    expect(() => service.mapRows(service.parseBuffer(buf), columns)).toThrow(
      /Missing required column for "code"/,
    );
  });

  it('throws with a row number when a required cell is empty', () => {
    const buf = makeWorkbook([{ Code: '', Name: 'Blank code' }]);
    expect(() => service.mapRows(service.parseBuffer(buf), columns)).toThrow(
      /Row 2: "code" is required/,
    );
  });

  it('throws on a non-numeric number cell', () => {
    const buf = makeWorkbook([{ Code: 'A', Name: 'B', Density: 'abc' }]);
    expect(() => service.mapRows(service.parseBuffer(buf), columns)).toThrow(
      BadRequestException,
    );
  });
});
