import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true });

export class JsonSchemaValidator<T> {
  private readonly validate: ReturnType<typeof ajv.compile>;
  private readonly label: string | null;

  constructor(jsonSchema: Record<string, unknown>, label?: string) {
    this.validate = ajv.compile(jsonSchema);
    this.label = label ?? null;
  }

  parse(data: unknown): T {
    const valid = this.validate(data);
    if (valid) return data as T;

    const errors = this.validate.errors ?? [];
    const messages = errors.map((err) => {
      const path = err.instancePath || '/';
      const params = err.params ? JSON.stringify(err.params) : '';
      return `${path}: ${err.message} (${params})`;
    });

    const prefix = this.label
      ? `[${this.label}] Output schema validation failed`
      : 'JSON Schema validation failed';
    throw new Error(`${prefix}:\n${messages.join('\n')}`);
  }
}
