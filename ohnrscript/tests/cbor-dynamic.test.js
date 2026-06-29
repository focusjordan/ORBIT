const babel = require('@babel/core');
const cborPlugin = require('../src/plugins/babel-plugin-cbor-aot');

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

describe('@cbor AST transformer phase 2', () => {
  it('Compiles mock @cbor class with Strings and Arrays and matches expected buffer writes', () => {
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

    const record = new MessagePayload("hello", [1, 2]);
    const buf = record.toCBOR();
    
    // Map(2) -> 0xa2
    // "title" -> 0x65, 't','i','t','l','e'
    // "hello" -> 0x65, 'h','e','l','l','o'
    // "tags" -> 0x64, 't','a','g','s'
    // Array(2) -> 0x82
    // 1 -> 0x1a, 0, 0, 0, 1
    // 2 -> 0x1a, 0, 0, 0, 2
    const expected = new Uint8Array([
        0xa2, 
        0x65, 116, 105, 116, 108, 101, 
        0x65, 104, 101, 108, 108, 111,
        0x64, 116, 97, 103, 115,
        0x82,
        0x1a, 0, 0, 0, 1,
        0x1a, 0, 0, 0, 2
    ]);

    expect(buf.length).toBe(expected.length);
    for (let i = 0; i < buf.length; i++) {
        expect(buf[i]).toBe(expected[i]);
    }
  });
});
