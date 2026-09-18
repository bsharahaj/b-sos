import { z } from 'zod';
import { HttpError } from '../utils/httpError.js';

// validate({ body, query, params }) — each is an optional Zod schema.
// Parsed values replace req.body and are all available on req.validated.
export function validate(schemas) {
  return (req, res, next) => {
    req.validated = {};

    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;

      const result = schemas[part].safeParse(req[part] ?? {});
      if (!result.success) {
        // Object-level problems (unknown keys, .refine on the whole object) land in formErrors, reported as `_form`.
        const { formErrors, fieldErrors } = z.flattenError(result.error);
        const details = formErrors.length ? { ...fieldErrors, _form: formErrors } : fieldErrors;
        throw new HttpError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', details);
      }
      req.validated[part] = result.data;
    }

    if (req.validated.body) req.body = req.validated.body;
    next();
  };
}
