export type PipelineErrorType = 'extraction' | 'parse' | 'validation';

export class PipelineError extends Error {
  constructor(
    message: string,
    public readonly errorType: PipelineErrorType,
    public readonly rawContent: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'PipelineError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class JsonExtractionError extends PipelineError {
  constructor(rawContent: string) {
    const preview = rawContent.slice(0, 200);
    super(
      `No JSON found in response. Preview: ${preview}${rawContent.length > 200 ? '...' : ''}`,
      'extraction',
      rawContent,
      true
    );
    this.name = 'JsonExtractionError';
  }
}

export class JsonParseError extends PipelineError {
  constructor(
    rawContent: string,
    public readonly extractedJson: string,
    parseError: string
  ) {
    const preview = extractedJson.slice(0, 200);
    super(
      `JSON parse failed: ${parseError}. Extracted: ${preview}${extractedJson.length > 200 ? '...' : ''}`,
      'parse',
      rawContent,
      true
    );
    this.name = 'JsonParseError';
  }
}

export class SchemaValidationError extends PipelineError {
  constructor(
    rawContent: string,
    public readonly parsedObject: unknown,
    public readonly validationErrors: string
  ) {
    super(
      `Schema validation failed: ${validationErrors}`,
      'validation',
      rawContent,
      true
    );
    this.name = 'SchemaValidationError';
  }
}
