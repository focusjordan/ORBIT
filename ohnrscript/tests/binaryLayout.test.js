const babel = require('@babel/core');
const binaryLayoutPlugin = require('../src/plugins/babel-plugin-binary-layout');

function transpile(code) {
  const result = babel.transformSync(code, {
    parserOpts: {
      plugins: [
        ['decorators', { decoratorsBeforeExport: true }]
      ]
    },
    plugins: [binaryLayoutPlugin]
  });
  return result.code;
}

describe('@binaryLayout AST transformer', () => {

  it('Test 1: Compiles mock @binaryLayout class and matches expected DataView getter structure', () => {
    const input = `
      @binaryLayout
      class MockAudioPacket {
        @type('float32')
        @size(128)
        samples;
      }
    `;
    const output = transpile(input);
    
    // Verify decorators are stripped
    expect(output).not.toMatch(/@binaryLayout/);
    expect(output).not.toMatch(/@type/);
    expect(output).not.toMatch(/@size/);
    
    // Verify the generated getters and slice logic
    expect(output).toMatch(/get samples\(\)/);
    expect(output).toMatch(/this\._buffer\.slice/);
    expect(output).toMatch(/new Float32Array/);
    
    // Verify the injected static factory
    expect(output).toMatch(/static fromBuffer\(buffer\)/);
  });

  it('Test 2: Executes transpiled code, ensuring .slice() is used and original buffer can be garbage collected', () => {
    const input = `
      @binaryLayout
      class MemorySafePacket {
        @type('float32')
        @size(128)
        chunk;
      }
      module.exports = MemorySafePacket;
    `;
    const output = transpile(input);
    
    // Evaluate the transpiled class
    const MemorySafePacket = eval(`
      (function() {
        var module = { exports: {} };
        ${output}
        return module.exports;
      })();
    `);

    // Create a massive ArrayBuffer (e.g. 10MB)
    const massiveBuffer = new ArrayBuffer(10 * 1024 * 1024); 
    // Fill the first chunk of memory (128 * 4 = 512 bytes) with some data
    const view = new DataView(massiveBuffer);
    view.setFloat32(0, 42.5, true); 
    view.setFloat32(4, 13.37, true);

    const packet = MemorySafePacket.fromBuffer(massiveBuffer);
    const chunk = packet.chunk;

    // Verify it read the right data
    expect(chunk.length).toBe(128);
    expect(chunk[0]).toBeCloseTo(42.5);
    expect(chunk[1]).toBeCloseTo(13.37);

    // CRITICAL: Prove memory safety. 
    // The chunk's underlying buffer should NOT be the massiveBuffer.
    // .subarray() would return the exact same underlying buffer. .slice() returns a new one.
    expect(chunk.buffer).not.toBe(massiveBuffer);
    expect(chunk.buffer.byteLength).toBe(128 * 4); // The new buffer is exactly the size of the chunk
  });

  it('Test 3: Handles primitive types alongside arrays accurately (offset calculation)', () => {
    const input = `
      @binaryLayout
      class MixedPacket {
        @type('uint8')
        @size(1)
        version;

        @type('uint32')
        @size(1)
        flags;

        @type('int16')
        @size(10)
        data;
      }
      module.exports = MixedPacket;
    `;
    const output = transpile(input);
    
    const MixedPacket = eval(`
      (function() {
        var module = { exports: {} };
        ${output}
        return module.exports;
      })();
    `);

    // Calculate total size: uint8(1) + uint32(4) + int16*10(20) = 25 bytes
    const buffer = new ArrayBuffer(25);
    const view = new DataView(buffer);
    
    view.setUint8(0, 5); // Version
    view.setUint32(1, 1024, true); // Flags (starts at offset 1)
    view.setInt16(5, -42, true); // Data[0] (starts at offset 5)
    view.setInt16(7, 99, true); // Data[1]

    const packet = MixedPacket.fromBuffer(buffer);

    expect(packet.version).toBe(5);
    expect(packet.flags).toBe(1024);
    
    const dataChunk = packet.data;
    expect(dataChunk.length).toBe(10);
    expect(dataChunk[0]).toBe(-42);
    expect(dataChunk[1]).toBe(99);
    
    // Memory safety check on the array chunk
    expect(dataChunk.buffer).not.toBe(buffer);
  });

});
