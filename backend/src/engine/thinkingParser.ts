const MARKER_END = 'thinking_end';

export function isValidTitle(title: string): boolean {
  if (title.length < 3 || title.length > 150) return false;
  if (title.includes('"') || title.includes("'") || title.includes('<text>')) return false;
  if (/^\d+[.)]\s*$/.test(title)) return false;
  return true;
}

function stripMarkers(text: string): string {
  return text.replace(/thinking_start/g, '').replace(/thinking_end/g, '');
}

export function cleanDescription(raw: string): string {
  const stripped = stripMarkers(raw).replace(/\n{3,}/g, '\n\n');
  const lines = stripped.split('\n');
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    if (
      last === '' ||
      last === '{' ||
      last === '}' ||
      last === '[' ||
      last === ']' ||
      last.startsWith('"') ||
      last.startsWith('//') ||
      last.startsWith('/*')
    ) {
      lines.pop();
    } else {
      break;
    }
  }
  return lines.join('\n').trim();
}

function extractTitleFromEnd(text: string): { descPart: string; title: string } {
  const lines = text.split('\n');
  let titleIdx = lines.length - 1;
  while (titleIdx >= 0 && lines[titleIdx].trim() === '') {
    titleIdx--;
  }
  if (titleIdx < 0) return { descPart: '', title: '' };
  const title = lines[titleIdx].trim();
  const descPart = lines.slice(0, titleIdx).join('\n');
  return { descPart, title };
}

export class ThinkingParser {
  private buffer = '';
  private pendingTitle: string | null = null;

  constructor(
    private readonly onThoughtStart: (title: string) => Promise<void>,
    private readonly onThoughtDone: (description: string) => Promise<void>,
  ) {}

  async feed(delta: string): Promise<void> {
    this.buffer += delta;
    await this.process();
  }

  async finish(): Promise<void> {
    if (this.pendingTitle !== null) {
      const desc = cleanDescription(this.buffer);
      await this.onThoughtDone(desc);
      this.pendingTitle = null;
    }
  }

  private async process(): Promise<void> {
    while (true) {
      const idx = this.buffer.indexOf(MARKER_END);
      if (idx === -1) break;

      const before = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + MARKER_END.length);

      const { descPart, title } = extractTitleFromEnd(before);

      if (this.pendingTitle !== null) {
        const desc = cleanDescription(descPart);
        await this.onThoughtDone(desc);
      }

      if (isValidTitle(title)) {
        this.pendingTitle = title;
        await this.onThoughtStart(title);
      } else {
        this.pendingTitle = null;
      }
    }
  }
}
