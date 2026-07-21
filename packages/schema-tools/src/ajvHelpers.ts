import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import type { Schema } from './schema';

export type CompileSchemaResult = {
  validate: ValidateFunction;
  ajv: Ajv;
};

export function compileSchema(schema: Schema | object, ajv?: Ajv): CompileSchemaResult {
  const instance = ajv ?? new Ajv();
  const validate = instance.compile(schema);
  return { validate, ajv: instance };
}

export type ValidateDataResult = {
  valid: boolean;
  errors: ErrorObject[] | null | undefined;
};

export function validateData(
  data: unknown,
  schema: Schema | object,
  ajv?: Ajv,
): ValidateDataResult {
  const { validate } = compileSchema(schema, ajv);
  const valid = Boolean(validate(data));
  return { valid, errors: validate.errors };
}

export function validateWith(
  validate: ValidateFunction,
  data: unknown,
): ValidateDataResult {
  const valid = Boolean(validate(data));
  return { valid, errors: validate.errors };
}
