const assert = require('assert');
const dsp = require('./src/index.js');

console.log('Testing @ohnrshyp/dsp...');

// Assert exports exist and are of expected type
assert.ok(dsp.analyze, 'analyze function should be exported');
assert.ok(dsp.checkPythonEnvironment, 'checkPythonEnvironment function should be exported');
assert.ok(dsp.calculateDanceability, 'calculateDanceability function should be exported');
assert.ok(dsp.config, 'config object should be exported');

// Test calculateDanceability sanity check
const testResult = dsp.calculateDanceability({ bpm: { value: 120, confidence: 0.9 }, energy: 0.8 });
assert.strictEqual(typeof testResult, 'number');
assert.ok(testResult >= 0 && testResult <= 1);

console.log('All @ohnrshyp/dsp sanity checks passed!');
