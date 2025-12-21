export type XmlNode = {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
};

const isWhitespace = (c: string): boolean => c === ' ' || c === '\n' || c === '\r' || c === '\t';

const findTagEnd = (input: string, start: number): number => {
  let i = start;
  let quote: '"' | "'" | null = null;
  while (i < input.length) {
    const ch = input[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === '>') return i;
    i += 1;
  }
  return -1;
};

const parseAttrs = (raw: string): Record<string, string> => {
  const attrs: Record<string, string> = {};
  let i = 0;

  const skipWs = () => {
    while (i < raw.length && isWhitespace(raw[i]!)) i += 1;
  };

  while (i < raw.length) {
    skipWs();
    if (i >= raw.length) break;
    if (raw[i] === '/' || raw[i] === '>') break;

    // name
    let name = '';
    while (i < raw.length) {
      const ch = raw[i]!;
      if (isWhitespace(ch) || ch === '=' || ch === '/' || ch === '>') break;
      name += ch;
      i += 1;
    }
    name = name.trim();
    skipWs();
    if (!name) break;

    let value = '';
    if (raw[i] === '=') {
      i += 1;
      skipWs();
      const q = raw[i];
      if (q === '"' || q === "'") {
        i += 1;
        const start = i;
        while (i < raw.length && raw[i] !== q) i += 1;
        value = raw.slice(start, i);
        if (raw[i] === q) i += 1;
      } else {
        const start = i;
        while (i < raw.length && !isWhitespace(raw[i]!) && raw[i] !== '/' && raw[i] !== '>') i += 1;
        value = raw.slice(start, i);
      }
    }

    attrs[name] = value;
  }

  return attrs;
};

export const parseXml = (input: string): XmlNode | null => {
  // Minimal, non-validating XML parser tailored for SVG import.
  // Ignores text nodes, comments, and processing instructions.
  const root: XmlNode = { tag: '#document', attrs: {}, children: [] };
  const stack: XmlNode[] = [root];

  let i = 0;
  while (i < input.length) {
    const lt = input.indexOf('<', i);
    if (lt === -1) break;
    const gt = findTagEnd(input, lt + 1);
    if (gt === -1) break;

    const inside = input.slice(lt + 1, gt).trim();
    i = gt + 1;

    if (!inside) continue;
    if (inside.startsWith('!--')) continue; // comment
    if (inside.startsWith('?')) continue; // XML PI
    if (inside.startsWith('!')) continue; // doctype/other

    const isClosing = inside[0] === '/';
    const tagBody = isClosing ? inside.slice(1).trim() : inside;
    if (!tagBody) continue;

    // tag name
    let j = 0;
    while (j < tagBody.length && !isWhitespace(tagBody[j]!) && tagBody[j] !== '/') j += 1;
    const tag = tagBody.slice(0, j);
    if (!tag) continue;

    if (isClosing) {
      // Pop until matching tag is found.
      for (let k = stack.length - 1; k >= 1; k -= 1) {
        if (stack[k]!.tag === tag) {
          stack.length = k;
          break;
        }
      }
      continue;
    }

    const selfClosing = tagBody.endsWith('/');
    const rawAttrs = tagBody.slice(j, selfClosing ? -1 : undefined);
    const node: XmlNode = { tag, attrs: parseAttrs(rawAttrs), children: [] };
    stack[stack.length - 1]!.children.push(node);
    if (!selfClosing) stack.push(node);
  }

  return root.children[0] ?? null;
};

