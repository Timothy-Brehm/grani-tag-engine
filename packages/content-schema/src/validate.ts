import { validateData, type ValidateDataResult } from '@grani/schema-tools';
import type { EntityCatalog } from './types';
import entityCatalogSchemaJson from '../schemas/entity-catalog.schema.json';

export const entityCatalogSchema: object = entityCatalogSchemaJson;

export function validateEntityCatalog(
  data: unknown,
): ValidateDataResult & { catalog?: EntityCatalog } {
  const result = validateData(data, entityCatalogSchema);
  if (!result.valid) {
    return result;
  }
  return { ...result, catalog: data as EntityCatalog };
}
