// =============================================
// FuelUp - Application errors (user-safe messages)
// Never leak Prisma/DB internals to the client.
// =============================================

export class AppError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

export const Errors = {
  unauthorized: () => new AppError('UNAUTHORIZED', 'Please sign in to continue.', 401),
  badRequest: (message = 'That request was invalid. Please check your input.') =>
    new AppError('BAD_REQUEST', message, 400),
  notFound: (message = 'We could not find what you asked for.') =>
    new AppError('NOT_FOUND', message, 404),
  saveFailed: (what: string) =>
    new AppError('SAVE_FAILED', `Unable to save your ${what}. Your data has not been lost.`, 500),
  loadFailed: (what: string) =>
    new AppError('LOAD_FAILED', `Unable to load your ${what}. Please try again.`, 500),
  deleteFailed: (what: string) =>
    new AppError('DELETE_FAILED', `Unable to delete that ${what}. Please try again.`, 500),
} as const;

export function toErrorResponse(error: unknown, fallbackWhat = 'request'): { body: { error: string; code: string }; status: number } {
  if (error instanceof AppError) {
    return { body: { error: error.message, code: error.code }, status: error.status };
  }
  return { body: { error: `Unable to complete your ${fallbackWhat}. Please try again.`, code: 'INTERNAL' }, status: 500 };
}
