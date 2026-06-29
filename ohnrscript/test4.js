"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function _classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function _defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, _toPropertyKey(o.key), o); } }
function _createClass(e, r, t) { return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
// Phase 2 CBOR Dynamic Length Feature Test
var DeviceTelemetry = /*#__PURE__*/function () {
  function DeviceTelemetry() {
    _classCallCheck(this, DeviceTelemetry);
  }
  return _createClass(DeviceTelemetry, [{
    key: "toCBOR",
    value: function toCBOR() {
      var _size = 0;
      _size += 1;
      _size += 9;
      var len_deviceId = this.deviceId.length;
      if (len_deviceId < 24) {
        _size += 1 + len_deviceId;
      } else if (len_deviceId <= 0xff) {
        _size += 2 + len_deviceId;
      } else if (len_deviceId <= 0xffff) {
        _size += 3 + len_deviceId;
      } else {
        _size += 5 + len_deviceId;
      }
      _size += 13;
      var arrLen_measurements = this.measurements.length;
      if (arrLen_measurements < 24) {
        _size += 1;
      } else if (arrLen_measurements <= 0xff) {
        _size += 2;
      } else if (arrLen_measurements <= 0xffff) {
        _size += 3;
      } else {
        _size += 5;
      }
      _size += arrLen_measurements * 5;
      _size += 16;
      var len_firmwareVersion = this.firmwareVersion.length;
      if (len_firmwareVersion < 24) {
        _size += 1 + len_firmwareVersion;
      } else if (len_firmwareVersion <= 0xff) {
        _size += 2 + len_firmwareVersion;
      } else if (len_firmwareVersion <= 0xffff) {
        _size += 3 + len_firmwareVersion;
      } else {
        _size += 5 + len_firmwareVersion;
      }
      _size += 9;
      _size += 1;
      var buf = new Uint8Array(_size);
      var _offset = 0;
      buf[_offset++] = 164;
      buf[_offset++] = 104;
      buf[_offset++] = 100;
      buf[_offset++] = 101;
      buf[_offset++] = 118;
      buf[_offset++] = 105;
      buf[_offset++] = 99;
      buf[_offset++] = 101;
      buf[_offset++] = 73;
      buf[_offset++] = 100;
      if (len_deviceId < 24) {
        buf[_offset++] = 0x60 + len_deviceId;
      } else if (len_deviceId <= 0xff) {
        buf[_offset++] = 0x78;
        buf[_offset++] = len_deviceId;
      } else if (len_deviceId <= 0xffff) {
        buf[_offset++] = 0x79;
        buf[_offset++] = len_deviceId >>> 8 & 0xff;
        buf[_offset++] = len_deviceId & 0xff;
      } else {
        buf[_offset++] = 0x7a;
        buf[_offset++] = len_deviceId >>> 24 & 0xff;
        buf[_offset++] = len_deviceId >>> 16 & 0xff;
        buf[_offset++] = len_deviceId >>> 8 & 0xff;
        buf[_offset++] = len_deviceId & 0xff;
      }
      for (var _i = 0; _i < len_deviceId; _i++) {
        buf[_offset++] = this.deviceId.charCodeAt(_i);
      }
      buf[_offset++] = 108;
      buf[_offset++] = 109;
      buf[_offset++] = 101;
      buf[_offset++] = 97;
      buf[_offset++] = 115;
      buf[_offset++] = 117;
      buf[_offset++] = 114;
      buf[_offset++] = 101;
      buf[_offset++] = 109;
      buf[_offset++] = 101;
      buf[_offset++] = 110;
      buf[_offset++] = 116;
      buf[_offset++] = 115;
      if (arrLen_measurements < 24) {
        buf[_offset++] = 0x80 + arrLen_measurements;
      } else if (arrLen_measurements <= 0xff) {
        buf[_offset++] = 0x98;
        buf[_offset++] = arrLen_measurements;
      } else if (arrLen_measurements <= 0xffff) {
        buf[_offset++] = 0x99;
        buf[_offset++] = arrLen_measurements >>> 8 & 0xff;
        buf[_offset++] = arrLen_measurements & 0xff;
      } else {
        buf[_offset++] = 0x9a;
        buf[_offset++] = arrLen_measurements >>> 24 & 0xff;
        buf[_offset++] = arrLen_measurements >>> 16 & 0xff;
        buf[_offset++] = arrLen_measurements >>> 8 & 0xff;
        buf[_offset++] = arrLen_measurements & 0xff;
      }
      for (var _i2 = 0; _i2 < arrLen_measurements; _i2++) {
        var elem = this.measurements[_i2];
        if (elem >= 0) {
          buf[_offset++] = 0x1a;
          buf[_offset++] = elem >>> 24 & 0xff;
          buf[_offset++] = elem >>> 16 & 0xff;
          buf[_offset++] = elem >>> 8 & 0xff;
          buf[_offset++] = elem & 0xff;
        } else {
          buf[_offset++] = 0x3a;
          var val_elem = -elem - 1;
          buf[_offset++] = val_elem >>> 24 & 0xff;
          buf[_offset++] = val_elem >>> 16 & 0xff;
          buf[_offset++] = val_elem >>> 8 & 0xff;
          buf[_offset++] = val_elem & 0xff;
        }
      }
      buf[_offset++] = 111;
      buf[_offset++] = 102;
      buf[_offset++] = 105;
      buf[_offset++] = 114;
      buf[_offset++] = 109;
      buf[_offset++] = 119;
      buf[_offset++] = 97;
      buf[_offset++] = 114;
      buf[_offset++] = 101;
      buf[_offset++] = 86;
      buf[_offset++] = 101;
      buf[_offset++] = 114;
      buf[_offset++] = 115;
      buf[_offset++] = 105;
      buf[_offset++] = 111;
      buf[_offset++] = 110;
      if (len_firmwareVersion < 24) {
        buf[_offset++] = 0x60 + len_firmwareVersion;
      } else if (len_firmwareVersion <= 0xff) {
        buf[_offset++] = 0x78;
        buf[_offset++] = len_firmwareVersion;
      } else if (len_firmwareVersion <= 0xffff) {
        buf[_offset++] = 0x79;
        buf[_offset++] = len_firmwareVersion >>> 8 & 0xff;
        buf[_offset++] = len_firmwareVersion & 0xff;
      } else {
        buf[_offset++] = 0x7a;
        buf[_offset++] = len_firmwareVersion >>> 24 & 0xff;
        buf[_offset++] = len_firmwareVersion >>> 16 & 0xff;
        buf[_offset++] = len_firmwareVersion >>> 8 & 0xff;
        buf[_offset++] = len_firmwareVersion & 0xff;
      }
      for (var _i3 = 0; _i3 < len_firmwareVersion; _i3++) {
        buf[_offset++] = this.firmwareVersion.charCodeAt(_i3);
      }
      buf[_offset++] = 104;
      buf[_offset++] = 105;
      buf[_offset++] = 115;
      buf[_offset++] = 79;
      buf[_offset++] = 110;
      buf[_offset++] = 108;
      buf[_offset++] = 105;
      buf[_offset++] = 110;
      buf[_offset++] = 101;
      buf[_offset++] = this.isOnline ? 0xf5 : 0xf4;
      return buf;
    }
  }]);
}();