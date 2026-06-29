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

describe('@cbor AST transformer phase 1', () => {

  it('Test 1: Compiles mock @cbor class and matches expected buffer writes', () => {
    const input = `
      @cbor
      class MockRecord {
        isActive: boolean;
        score: number;
      }
    `;
    const output = transpile(input);
    
    // Verify decorators are stripped
    expect(output).not.toMatch(/@cbor/);
    
    // Verify properties are stripped
    expect(output).not.toMatch(/isActive;/);
    expect(output).not.toMatch(/score;/);
    
    // Verify the injected toCBOR method
    expect(output).toMatch(/toCBOR\(\) \{/);
    expect(output).toMatch(/new Uint8Array\(/);
    
    // Check for inline writes
    expect(output).toMatch(/buf\[0\] = 162;/); // 0xa0 + 2 properties = 162
    // Check for boolean serialization (0xf5 = 245, 0xf4 = 244)
    expect(output).toMatch(/\? 0xf5 : 0xf4/);
    
    // Check for integer serialization (0x1a = 26, 0x3a = 58)
    expect(output).toMatch(/buf\[\d+\] = 0x1a;/);
  });

  it('Test 2: Executes transpiled code, ensuring byte-for-byte match with valid CBOR payload', () => {
    const input = `
      @cbor
      class UserRecord {
        isActive: boolean;
        score: number;
        constructor(isActive, score) {
            this.isActive = isActive;
            this.score = score;
        }
      }
      module.exports = UserRecord;
    `;
    const output = transpile(input);
    
    const UserRecord = eval(`
      (function() {
        var module = { exports: {} };
        ${output}
        return module.exports;
      })();
    `);

    const record = new UserRecord(true, 42);
    const buf = record.toCBOR();
    
    // Manually construct the expected CBOR buffer
    // Map(2) -> 0xa2 (162)
    // "isActive" -> 0x68 (104), 'i','s','A','c','t','i','v','e' -> 105, 115, 65, 99, 116, 105, 118, 101
    // true -> 0xf5 (245)
    // "score" -> 0x65 (101), 's','c','o','r','e' -> 115, 99, 111, 114, 101
    // 42 (as 32-bit int) -> 0x1a (26), 0, 0, 0, 42
    
    const expected = new Uint8Array([
        162, 
        104, 105, 115, 65, 99, 116, 105, 118, 101, 
        245,
        101, 115, 99, 111, 114, 101,
        26, 0, 0, 0, 42
    ]);

    expect(buf.length).toBe(expected.length);
    for (let i = 0; i < buf.length; i++) {
        expect(buf[i]).toBe(expected[i]);
    }

    // Test a negative score
    const recordNeg = new UserRecord(false, -42);
    const bufNeg = recordNeg.toCBOR();
    
    const expectedNeg = new Uint8Array([
        162, 
        104, 105, 115, 65, 99, 116, 105, 118, 101, 
        244,
        101, 115, 99, 111, 114, 101,
        58, 0, 0, 0, 41 
    ]);
    
    expect(bufNeg.length).toBe(expectedNeg.length);
    for (let i = 0; i < bufNeg.length; i++) {
        expect(bufNeg[i]).toBe(expectedNeg[i]);
    }
  });

});
