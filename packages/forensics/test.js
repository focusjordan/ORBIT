const assert = require('assert');
const forensics = require('./src/index.js');

console.log('Testing @ohnrshyp/forensics...');

// Assert exports exist and are of expected type
assert.ok(forensics.analyze, 'analyze function should be exported');
assert.ok(forensics.checkPythonEnvironment, 'checkPythonEnvironment function should be exported');
assert.ok(forensics.calculateAiProbability, 'calculateAiProbability function should be exported');
assert.ok(forensics.checkOpenAIProvenance, 'checkOpenAIProvenance function should be exported');
assert.ok(forensics.config, 'config object should be exported');

// Test calculateAiProbability sanity check
const testResult = forensics.calculateAiProbability({
  spectral_cutoff: { has_16k_cutoff: true },
  checkerboard: { has_artifacts: false }
});
assert.strictEqual(typeof testResult, 'number');
assert.ok(testResult >= 0 && testResult <= 1);

// Test checkOpenAIProvenance unconfigured sanity check
(async () => {
  const provenanceCheck = await forensics.checkOpenAIProvenance(Buffer.from('RIFF....'), { apiKey: null });
  assert.strictEqual(provenanceCheck.checked, false);
  assert.strictEqual(provenanceCheck.status, 'unconfigured');
  console.log('All @ohnrshyp/forensics sanity checks passed!');
})();
