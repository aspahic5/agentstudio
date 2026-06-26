export type JsonSchema = Record<string, unknown>;

export interface SchemaInjectionOptions {
  placeholder?: string;
  format?: 'json' | 'compact' | 'instructional';
  wrapInInstructions?: boolean;
  customWrapper?: string;
}

const DEFAULT_WRAPPER = `Return your response as JSON matching this schema:

\`\`\`json
{{schema}}
\`\`\`

Ensure your response is valid JSON that can be parsed.`;

export function injectSchema(
  template: string,
  schema: JsonSchema,
  options: SchemaInjectionOptions = {}
): string {
  const {
    placeholder = '{{outputSchema}}',
    format = 'json',
    wrapInInstructions = true,
    customWrapper,
  } = options;

  let formattedSchema: string;
  switch (format) {
    case 'compact':
      formattedSchema = JSON.stringify(schema);
      break;
    case 'instructional':
      formattedSchema = formatInstructional(schema);
      break;
    case 'json':
    default:
      formattedSchema = JSON.stringify(schema, null, 2);
      break;
  }

  let injection: string;
  if (wrapInInstructions) {
    const wrapper = customWrapper || DEFAULT_WRAPPER;
    injection = wrapper.replace('{{schema}}', formattedSchema);
  } else {
    injection = formattedSchema;
  }

  return template.replace(placeholder, injection);
}

function formatInstructional(schema: JsonSchema): string {
  const lines: string[] = [];

  if (schema.type === 'object' && schema.properties) {
    lines.push('Required fields:');
    const required = (schema.required as string[]) || [];
    const props = schema.properties as Record<string, Record<string, unknown>>;

    for (const [key, prop] of Object.entries(props)) {
      const isRequired = required.includes(key);
      const type = formatPropertyType(prop);
      const description = prop.description ? ` - ${prop.description}` : '';
      const requiredMarker = isRequired ? ' (required)' : ' (optional)';
      lines.push(`  - ${key}: ${type}${requiredMarker}${description}`);

      if (prop.enum && Array.isArray(prop.enum)) {
        lines.push(
          `    Allowed values: ${(prop.enum as string[]).map((v) => `"${v}"`).join(', ')}`
        );
      }
    }
  }

  if (lines.length === 0) {
    return JSON.stringify(schema, null, 2);
  }

  lines.push('');
  lines.push('Full JSON Schema:');
  lines.push(JSON.stringify(schema, null, 2));

  return lines.join('\n');
}

function formatPropertyType(prop: Record<string, unknown>): string {
  if (prop.type === 'array' && prop.items) {
    const items = prop.items as Record<string, unknown>;
    return `array of ${formatPropertyType(items)}`;
  }
  if (prop.type === 'object') return 'object';
  if (prop.enum) return 'enum';
  if (prop.oneOf || prop.anyOf) return 'union';
  return String(prop.type || 'any');
}

export function hasSchemaPlaceholder(
  template: string,
  placeholder: string = '{{outputSchema}}'
): boolean {
  return template.includes(placeholder);
}

export function extractPlaceholders(template: string): string[] {
  const matches = template.matchAll(/\{\{(\w+)\}\}/g);
  return [...matches].map((m) => m[0]);
}
