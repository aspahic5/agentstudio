import Handlebars from 'handlebars';

Handlebars.registerHelper('json', function (context: unknown): Handlebars.SafeString {
  if (context === undefined || context === null) {
    return new Handlebars.SafeString('');
  }
  return new Handlebars.SafeString(JSON.stringify(context, null, 2));
});

Handlebars.registerHelper('queryArray', function (paramName: string, arr: unknown): Handlebars.SafeString {
  if (!Array.isArray(arr) || arr.length === 0) {
    return new Handlebars.SafeString('');
  }
  const params = arr
    .map((item) => `${encodeURIComponent(String(paramName))}=${encodeURIComponent(String(item))}`)
    .join('&');
  return new Handlebars.SafeString(params);
});

Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);

Handlebars.registerHelper('now', function (): Handlebars.SafeString {
  return new Handlebars.SafeString(new Date().toISOString());
});

Handlebars.registerHelper('nonce', function (): Handlebars.SafeString {
  return new Handlebars.SafeString(
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
});

const MAX_TEMPLATE_CACHE_SIZE = 500;
const templateCache = new Map<string, Handlebars.TemplateDelegate>();

export function interpolate(
  template: string,
  context: Record<string, unknown>
): string {
  let compiled = templateCache.get(template);
  if (compiled) {
    templateCache.delete(template);
    templateCache.set(template, compiled);
  } else {
    compiled = Handlebars.compile(template, { noEscape: true });
    if (templateCache.size >= MAX_TEMPLATE_CACHE_SIZE) {
      const lruKey = templateCache.keys().next().value;
      if (lruKey !== undefined) templateCache.delete(lruKey);
    }
    templateCache.set(template, compiled);
  }
  return compiled(context);
}
