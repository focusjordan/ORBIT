"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function _classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function _defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, _toPropertyKey(o.key), o); } }
function _createClass(e, r, t) { return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
// Ohnrscript Audio ML Packet Definition
// This file demonstrates the @binaryLayout language feature
// which transpiles into a zero-allocation, memory-safe data wrapper
// for massive ArrayBuffers.
var AudioMLBatch = /*#__PURE__*/function () {
  function AudioMLBatch(buffer) {
    _classCallCheck(this, AudioMLBatch);
    this._buffer = buffer;
    this._view = new DataView(buffer);
  }
  return _createClass(AudioMLBatch, [{
    key: "version",
    get: function get() {
      return this._view.getUint8(0, true);
    }
  }, {
    key: "flags",
    get: function get() {
      return this._view.getUint8(1, true);
    }
  }, {
    key: "batchId",
    get: function get() {
      return this._view.getUint16(2, true);
    }
  }, {
    key: "timestamp",
    get: function get() {
      return this._view.getUint32(4, true);
    }
  }, {
    key: "embedding",
    get: function get() {
      return new Float32Array(this._buffer.slice(8, 2056));
    }
  }, {
    key: "pcmData",
    get: function get() {
      return new Float32Array(this._buffer.slice(2056, 6152));
    }
  }], [{
    key: "fromBuffer",
    value: function fromBuffer(buffer) {
      return new this(buffer);
    }
  }]);
}(); // In standard usage:
// const packet = AudioMLBatch.fromBuffer(massiveNetworkBuffer);
// processEmbedding(packet.embedding);
// 
// Because \`packet.embedding\` uses .slice(), it copies the 512 floats into a new ArrayBuffer.
// Once \`massiveNetworkBuffer\` falls out of scope, V8 can garbage collect it completely,
// saving hundreds of megabytes in a high-throughput streaming application!