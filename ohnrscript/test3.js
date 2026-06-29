"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function _classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function _defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, _toPropertyKey(o.key), o); } }
function _createClass(e, r, t) { return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
var ServerStatus = /*#__PURE__*/function () {
  function ServerStatus() {
    _classCallCheck(this, ServerStatus);
  }
  return _createClass(ServerStatus, [{
    key: "toCBOR",
    value: function toCBOR() {
      var buf = new Uint8Array(53);
      buf[0] = 163;
      buf[1] = 104;
      buf[2] = 105;
      buf[3] = 115;
      buf[4] = 79;
      buf[5] = 110;
      buf[6] = 108;
      buf[7] = 105;
      buf[8] = 110;
      buf[9] = 101;
      buf[10] = this.isOnline ? 0xf5 : 0xf4;
      buf[11] = 113;
      buf[12] = 97;
      buf[13] = 99;
      buf[14] = 116;
      buf[15] = 105;
      buf[16] = 118;
      buf[17] = 101;
      buf[18] = 67;
      buf[19] = 111;
      buf[20] = 110;
      buf[21] = 110;
      buf[22] = 101;
      buf[23] = 99;
      buf[24] = 116;
      buf[25] = 105;
      buf[26] = 111;
      buf[27] = 110;
      buf[28] = 115;
      if (this.activeConnections >= 0) {
        buf[29] = 0x1a;
        buf[30] = this.activeConnections >>> 24 & 0xff;
        buf[31] = this.activeConnections >>> 16 & 0xff;
        buf[32] = this.activeConnections >>> 8 & 0xff;
        buf[33] = this.activeConnections & 0xff;
      } else {
        buf[29] = 0x3a;
        var val_activeConnections = -this.activeConnections - 1;
        buf[30] = val_activeConnections >>> 24 & 0xff;
        buf[31] = val_activeConnections >>> 16 & 0xff;
        buf[32] = val_activeConnections >>> 8 & 0xff;
        buf[33] = val_activeConnections & 0xff;
      }
      buf[34] = 109;
      buf[35] = 117;
      buf[36] = 112;
      buf[37] = 116;
      buf[38] = 105;
      buf[39] = 109;
      buf[40] = 101;
      buf[41] = 83;
      buf[42] = 101;
      buf[43] = 99;
      buf[44] = 111;
      buf[45] = 110;
      buf[46] = 100;
      buf[47] = 115;
      if (this.uptimeSeconds >= 0) {
        buf[48] = 0x1a;
        buf[49] = this.uptimeSeconds >>> 24 & 0xff;
        buf[50] = this.uptimeSeconds >>> 16 & 0xff;
        buf[51] = this.uptimeSeconds >>> 8 & 0xff;
        buf[52] = this.uptimeSeconds & 0xff;
      } else {
        buf[48] = 0x3a;
        var val_uptimeSeconds = -this.uptimeSeconds - 1;
        buf[49] = val_uptimeSeconds >>> 24 & 0xff;
        buf[50] = val_uptimeSeconds >>> 16 & 0xff;
        buf[51] = val_uptimeSeconds >>> 8 & 0xff;
        buf[52] = val_uptimeSeconds & 0xff;
      }
      return buf;
    }
  }]);
}();