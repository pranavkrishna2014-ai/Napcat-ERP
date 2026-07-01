import {
  BadRequestException,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles, AppRole } from '../../auth/decorators/roles.decorator';
import { ListQueryDto } from '../dto/list-query.dto';
import { ColumnSpec, ExcelService } from '../excel/excel.service';
import { CrudService } from './crud.service';

/**
 * Base controller providing the read, delete and bulk Excel-import routes that
 * are identical for every master-data resource. Concrete controllers extend
 * this, add `@Controller(path)`, and declare their own create/update routes
 * with typed DTOs (so validation applies). Deletes are ADMIN-only; imports are
 * ADMIN/PLANNER.
 */
export abstract class BaseCrudController {
  protected constructor(
    protected readonly service: CrudService,
    protected readonly excel: ExcelService,
    protected readonly importColumns: ColumnSpec[],
  ) {}

  @Get()
  list(@Query() query: ListQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Delete(':id')
  @Roles(AppRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post('import')
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  @UseInterceptors(FileInterceptor('file'))
  import(@UploadedFile() file?: { buffer: Buffer }) {
    if (!file?.buffer) {
      throw new BadRequestException('An Excel file ("file" field) is required');
    }
    const rows = this.excel.mapRows(
      this.excel.parseBuffer(file.buffer),
      this.importColumns,
    );
    return this.service.bulkCreate(rows);
  }
}
