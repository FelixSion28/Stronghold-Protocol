#!/usr/bin/env node
// Inspect compact frames without the server: JSONL in/out, explicitly UTF-8. No token or state is uploaded.
import { createInterface } from 'node:readline';
import { encodeWire, decodeWire, wireCatalog } from '../shared/wireCodec.js';

const mode = process.argv[2];
if (mode === 'schema') process.stdout.write(`${JSON.stringify(wireCatalog(), null, 2)}\n`);
else if (mode === 'encode' || mode === 'decode') {
  process.stdin.setEncoding('utf8');
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber++;
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line);
      const converted = mode === 'encode' ? encodeWire(value) : decodeWire(value);
      process.stdout.write(`${JSON.stringify(converted)}\n`);
    } catch (error) {
      process.stderr.write(`第 ${lineNumber} 行转换失败 / line ${lineNumber}: ${error.message}\n`);
      process.exitCode = 1;
      break;
    }
  }
} else {
  process.stderr.write('用法 / usage: node tools/wire.mjs encode|decode|schema\n');
  process.exitCode = 1;
}
