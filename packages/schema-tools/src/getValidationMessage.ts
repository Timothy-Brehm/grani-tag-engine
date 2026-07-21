import type { ErrorObject } from 'ajv';

export const getValidationMessage = (
  errors: ErrorObject[] | null | undefined,
): string => {
  if (!errors) return '<p>Unknown validation error</p>';

  const errorMessages = errors.map((error) => {
    let errorMessage = '';
    if (error.keyword === 'required') {
      const missing = (error.params as { missingProperty?: string }).missingProperty;
      errorMessage = `<p>Missing required property <strong>'${missing}'</strong></p>`;
    } else {
      errorMessage = `<p>Validation failed for property <strong>'${error.instancePath}'</strong>: ${error.message}</p>`;
    }
    return errorMessage;
  });

  return errorMessages.join('');
};
