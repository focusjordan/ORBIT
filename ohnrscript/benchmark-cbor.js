const { performance } = require('perf_hooks');
const cbor = require('cbor');
const babel = require('@babel/core');
const cborPlugin = require('./src/plugins/babel-plugin-cbor-aot');

function transpile(code) {
  const result = babel.transformSync(code, {
    parserOpts: {
      plugins: [
        'typescript',
        ['decorators', { decoratorsBeforeExport: true }]
      ]
    },
    plugins: [cborPlugin]
  });
  return result.code;
}

const input = `
  @cbor
  class MessagePayload {
    title: string;
    tags: Array<number>;
    constructor(title, tags) {
        this.title = title;
        this.tags = tags;
    }
  }
  module.exports = MessagePayload;
`;

const output = transpile(input);
const MessagePayload = eval(`
  (function() {
    var module = { exports: {} };
    ${output}
    return module.exports;
  })();
`);

const ITERATIONS = 100000;
const payload = { title: "benchmark test payload", tags: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] };
const ohnrPayload = new MessagePayload(payload.title, payload.tags);

console.log("Warming up...");
for (let i = 0; i < 1000; i++) {
  cbor.encode(payload);
  ohnrPayload.toCBOR();
}

console.log(`Running benchmarks for ${ITERATIONS} iterations...`);

const startCbor = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  cbor.encode(payload);
}
const endCbor = performance.now();
const timeCbor = endCbor - startCbor;
console.log(`Standard cbor library: ${timeCbor.toFixed(2)} ms`);

const startOhnr = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  ohnrPayload.toCBOR();
}
const endOhnr = performance.now();
const timeOhnr = endOhnr - startOhnr;
console.log(`Ohnrscript AOT CBOR: ${timeOhnr.toFixed(2)} ms`);

const speedup = timeCbor / timeOhnr;
console.log(`Speedup: ${speedup.toFixed(2)}x faster!`);
