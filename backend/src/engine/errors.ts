export class ApplicationError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, unknown>;
  public readonly statusCode?: number;
  public readonly causedBy?: Error;

  constructor(
    message: string,
    options?: {
      code?: string;
      context?: Record<string, unknown>;
      statusCode?: number;
      cause?: Error;
    },
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = options?.code || 'UNKNOWN_ERROR';
    this.context = options?.context;
    this.statusCode = options?.statusCode;
    this.causedBy = options?.cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      statusCode: this.statusCode,
      stack: this.stack,
      causedBy:
        this.causedBy instanceof Error
          ? { name: this.causedBy.name, message: this.causedBy.message, stack: this.causedBy.stack }
          : this.causedBy,
    };
  }
}

export class TimeoutError extends ApplicationError {
  constructor(
    message: string,
    options?: {
      code?: string;
      context?: Record<string, unknown>;
      statusCode?: number;
      cause?: Error;
    },
  ) {
    super(message, {
      code: options?.code || 'TIMEOUT',
      context: options?.context,
      statusCode: options?.statusCode || 408,
      cause: options?.cause,
    });
  }
}

export function isApplicationError(error: unknown): error is ApplicationError {
  return error instanceof ApplicationError;
}

export function toApplicationError(
  error: unknown,
  defaultMessage = 'An unexpected error occurred',
  options?: {
    code?: string;
    context?: Record<string, unknown>;
    statusCode?: number;
  },
): ApplicationError {
  if (isApplicationError(error)) return error;
  if (error instanceof Error) {
    return new ApplicationError(error.message, { ...options, cause: error });
  }
  return new ApplicationError(typeof error === 'string' ? error : defaultMessage, options);
}
