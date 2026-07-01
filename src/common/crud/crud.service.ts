import { NotFoundException } from '@nestjs/common';

/**
 * Minimal structural shape of a Prisma model delegate. Every generated delegate
 * (prisma.brand, prisma.material, ...) satisfies this, so the generic CRUD
 * service can wrap any of them without depending on generated types.
 */
export interface PrismaDelegate {
  findMany(args?: unknown): Promise<unknown[]>;
  count(args?: unknown): Promise<number>;
  findUnique(args: unknown): Promise<unknown | null>;
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
  delete(args: unknown): Promise<unknown>;
}

export interface CrudOptions {
  /** Fields searched (case-insensitive contains) by the `search` query param. */
  searchFields?: string[];
  /** Default ordering, e.g. { name: 'asc' }. */
  defaultOrderBy?: Record<string, 'asc' | 'desc'>;
  /** Relations to include on reads. */
  include?: Record<string, unknown>;
  /**
   * When true, delete() sets isActive=false instead of removing the row
   * (nothing operational is hard-deleted). Requires an isActive column.
   */
  softDelete?: boolean;
  /** Human label used in not-found errors. */
  label?: string;
}

export interface ListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Reusable CRUD + list/search/paginate + bulk-create for master data.
 * Concrete services extend this and pass their Prisma delegate.
 */
export abstract class CrudService<T = unknown> {
  protected constructor(
    protected readonly model: PrismaDelegate,
    protected readonly options: CrudOptions = {},
  ) {}

  async list(query: ListQuery = {}): Promise<Paginated<T>> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 25));

    const where = this.buildWhere(query.search);
    const [data, total] = await Promise.all([
      this.model.findMany({
        where,
        include: this.options.include,
        orderBy: this.options.defaultOrderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.model.count({ where }),
    ]);

    return { data: data as T[], total, page, pageSize };
  }

  async get(id: string): Promise<T> {
    const found = await this.model.findUnique({
      where: { id },
      include: this.options.include,
    });
    if (!found) {
      throw new NotFoundException(`${this.options.label ?? 'Record'} not found`);
    }
    return found as T;
  }

  async create(data: Record<string, unknown>): Promise<T> {
    return (await this.model.create({ data })) as T;
  }

  async update(id: string, data: Record<string, unknown>): Promise<T> {
    await this.get(id); // 404 if missing
    return (await this.model.update({ where: { id }, data })) as T;
  }

  async remove(id: string): Promise<T> {
    await this.get(id);
    if (this.options.softDelete) {
      return (await this.model.update({
        where: { id },
        data: { isActive: false },
      })) as T;
    }
    return (await this.model.delete({ where: { id } })) as T;
  }

  /** Bulk-create rows (e.g. from an Excel import). Returns the created count. */
  async bulkCreate(rows: Record<string, unknown>[]): Promise<{ created: number }> {
    let created = 0;
    for (const row of rows) {
      await this.model.create({ data: row });
      created++;
    }
    return { created };
  }

  private buildWhere(search?: string): Record<string, unknown> | undefined {
    if (!search || !this.options.searchFields?.length) return undefined;
    return {
      OR: this.options.searchFields.map((field) => ({
        [field]: { contains: search, mode: 'insensitive' },
      })),
    };
  }
}
