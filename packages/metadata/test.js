const assert = require('assert');
const metadata = require('./src/index.js');

console.log('Testing @ohnrshyp/metadata...');

// Assert exports exist
assert.ok(metadata.extractMetadata, 'extractMetadata function should be exported');
assert.ok(metadata.extractClapOnly, 'extractClapOnly function should be exported');
assert.ok(metadata.extractAudioAnalysisOnly, 'extractAudioAnalysisOnly function should be exported');
assert.ok(metadata.checkEnvironment, 'checkEnvironment function should be exported');
assert.ok(metadata.formatForDatabase, 'formatForDatabase function should be exported');
assert.ok(metadata.formatEmbeddingForDatabase, 'formatEmbeddingForDatabase function should be exported');
assert.ok(metadata.config, 'config object should be exported');
assert.ok(metadata.components, 'components object should be exported');

// Assert components are present
assert.ok(metadata.components.clap, 'clap component should be exported');
assert.ok(metadata.components.panns, 'panns component should be exported');
assert.ok(metadata.components.genreClassifier, 'genreClassifier component should be exported');
assert.ok(metadata.components.audioAnalysis, 'audioAnalysis component should be exported');

// Test formatEmbeddingForDatabase sanity check using exact powers of 2 representation
const embedding = new Float32Array([0.5, -0.25, 0.125]);
const formatted = metadata.formatEmbeddingForDatabase(embedding);
assert.strictEqual(formatted, '[0.50000000,-0.25000000,0.12500000]');

console.log('All @ohnrshyp/metadata sanity checks passed!');
