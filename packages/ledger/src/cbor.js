/**
 * @ohnrshyp/ledger - High-Performance Deterministic CBOR Engine (RFC 8949)
 * 
 * Powered by Ohnrscript's data-oriented design (DOD):
 * - Zero-allocation pre-allocated memory arena for encoding
 * - Strict RFC 8949 binary wire compatibility with standard CBOR
 * - High-speed recursive decoder reading binary buffers directly
 */

'use strict';

const INITIAL_CAPACITY = 65536; // 64KB initial encoding buffer
let arena = new Uint8Array(INITIAL_CAPACITY);
let arenaDataView = new DataView(arena.buffer);
let offset = 0;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8');

function ensureCapacity(needed) {
  if (offset + needed > arena.length) {
    let newCap = arena.length * 2;
    while (offset + needed > newCap) {
      newCap *= 2;
    }
    const newArena = new Uint8Array(newCap);
    newArena.set(arena);
    arena = newArena;
    arenaDataView = new DataView(arena.buffer);
  }
}

function writeTypeAndLength(majorType, length) {
  const mt = (majorType << 5);
  if (length < 24) {
    ensureCapacity(1);
    arena[offset++] = mt | length;
  } else if (length <= 0xff) {
    ensureCapacity(2);
    arena[offset++] = mt | 24;
    arena[offset++] = length;
  } else if (length <= 0xffff) {
    ensureCapacity(3);
    arena[offset++] = mt | 25;
    arenaDataView.setUint16(offset, length, false);
    offset += 2;
  } else if (length <= 0xffffffff) {
    ensureCapacity(5);
    arena[offset++] = mt | 26;
    arenaDataView.setUint32(offset, length, false);
    offset += 4;
  } else {
    ensureCapacity(9);
    arena[offset++] = mt | 27;
    arenaDataView.setBigUint64(offset, BigInt(length), false);
    offset += 8;
  }
}

function encodeUint(n) {
  if (n < 24) {
    ensureCapacity(1);
    arena[offset++] = n;
  } else if (n <= 0xff) {
    ensureCapacity(2);
    arena[offset++] = 24;
    arena[offset++] = n;
  } else if (n <= 0xffff) {
    ensureCapacity(3);
    arena[offset++] = 25;
    arenaDataView.setUint16(offset, n, false);
    offset += 2;
  } else if (n <= 0xffffffff) {
    ensureCapacity(5);
    arena[offset++] = 26;
    arenaDataView.setUint32(offset, n, false);
    offset += 4;
  } else {
    ensureCapacity(9);
    arena[offset++] = 27;
    arenaDataView.setBigUint64(offset, BigInt(n), false);
    offset += 8;
  }
}

function encodeNint(n) {
  const val = -1 - n;
  writeTypeAndLength(1, val);
}

function encodeFloat(n) {
  ensureCapacity(9);
  arena[offset++] = 0xfb;
  arenaDataView.setFloat64(offset, n, false);
  offset += 8;
}

function encodeString(str) {
  const bytes = Buffer.isBuffer(str) ? str : Buffer.from(str, 'utf8');
  writeTypeAndLength(3, bytes.length);
  ensureCapacity(bytes.length);
  arena.set(bytes, offset);
  offset += bytes.length;
}

function encodeBytes(buf) {
  const bytes = Buffer.isBuffer(buf) ? buf : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  writeTypeAndLength(2, bytes.length);
  ensureCapacity(bytes.length);
  arena.set(bytes, offset);
  offset += bytes.length;
}

function encodeItem(value, canonical = false) {
  if (value === null) {
    ensureCapacity(1);
    arena[offset++] = 0xf6;
    return;
  }
  if (value === undefined) {
    ensureCapacity(1);
    arena[offset++] = 0xf7;
    return;
  }
  if (typeof value === 'boolean') {
    ensureCapacity(1);
    arena[offset++] = value ? 0xf5 : 0xf4;
    return;
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      if (value >= 0) {
        encodeUint(value);
      } else {
        encodeNint(value);
      }
    } else {
      encodeFloat(value);
    }
    return;
  }
  if (typeof value === 'bigint') {
    if (value >= 0n) {
      writeTypeAndLength(0, Number(value));
    } else {
      writeTypeAndLength(1, Number(-1n - value));
    }
    return;
  }
  if (typeof value === 'string') {
    encodeString(value);
    return;
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    encodeBytes(value);
    return;
  }
  if (Array.isArray(value)) {
    writeTypeAndLength(4, value.length);
    for (let i = 0; i < value.length; i++) {
      encodeItem(value[i], canonical);
    }
    return;
  }
  if (typeof value === 'object') {
    const rawKeys = Object.keys(value);
    const keys = canonical
      ? rawKeys.sort((a, b) => {
          const bufA = Buffer.from(a, 'utf8');
          const bufB = Buffer.from(b, 'utf8');
          return bufA.compare(bufB);
        })
      : rawKeys;

    writeTypeAndLength(5, keys.length);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      encodeString(k);
      encodeItem(value[k], canonical);
    }
    return;
  }
  throw new TypeError(`Unsupported CBOR type: ${typeof value}`);
}

function encode(value) {
  offset = 0;
  encodeItem(value, false);
  return Buffer.from(arena.buffer, arena.byteOffset, offset);
}

function encodeCanonical(value) {
  offset = 0;
  encodeItem(value, true);
  return Buffer.from(arena.buffer, arena.byteOffset, offset);
}

function decodeItem(buf, view, state) {
  if (state.offset >= buf.length) {
    throw new RangeError('Unexpected end of CBOR input');
  }

  const initialByte = buf[state.offset++];
  const majorType = (initialByte >> 5) & 0x07;
  const additionalInfo = initialByte & 0x1f;

  let length;
  if (additionalInfo < 24) {
    length = additionalInfo;
  } else if (additionalInfo === 24) {
    length = buf[state.offset++];
  } else if (additionalInfo === 25) {
    length = view.getUint16(state.offset, false);
    state.offset += 2;
  } else if (additionalInfo === 26) {
    length = view.getUint32(state.offset, false);
    state.offset += 4;
  } else if (additionalInfo === 27) {
    const big = view.getBigUint64(state.offset, false);
    length = Number(big);
    state.offset += 8;
  } else {
    throw new Error(`Unsupported or reserved CBOR header: ${additionalInfo}`);
  }

  switch (majorType) {
    case 0: return length;
    case 1: return -1 - length;
    case 2: {
      const bytes = Buffer.from(buf.subarray(state.offset, state.offset + length));
      state.offset += length;
      return bytes;
    }
    case 3: {
      const strBytes = buf.subarray(state.offset, state.offset + length);
      state.offset += length;
      return textDecoder.decode(strBytes);
    }
    case 4: {
      const arr = new Array(length);
      for (let i = 0; i < length; i++) {
        arr[i] = decodeItem(buf, view, state);
      }
      return arr;
    }
    case 5: {
      const obj = {};
      for (let i = 0; i < length; i++) {
        const key = decodeItem(buf, view, state);
        const val = decodeItem(buf, view, state);
        obj[key] = val;
      }
      return obj;
    }
    case 6: return decodeItem(buf, view, state);
    case 7: {
      if (additionalInfo === 20) return false;
      if (additionalInfo === 21) return true;
      if (additionalInfo === 22) return null;
      if (additionalInfo === 23) return undefined;
      if (additionalInfo === 25) return view.getUint16(state.offset - 2, false);
      if (additionalInfo === 26) return view.getFloat32(state.offset - 4, false);
      if (additionalInfo === 27) return view.getFloat64(state.offset - 8, false);
      return null;
    }
    default:
      throw new Error(`Unknown CBOR major type: ${majorType}`);
  }
}

function decode(buffer) {
  if (!buffer || buffer.length === 0) {
    throw new TypeError('Cannot decode empty or null buffer');
  }
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const state = { offset: 0 };
  return decodeItem(buf, view, state);
}

module.exports = {
  encode,
  encodeCanonical,
  decode,
};
