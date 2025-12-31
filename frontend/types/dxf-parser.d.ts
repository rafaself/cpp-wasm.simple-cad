declare module 'dxf-parser/dist/dxf-parser.js' {
  export default class DxfParser {
    constructor(...args: unknown[]);
    parseSync(input: string | Buffer): unknown;
  }
}
