#!/usr/bin/env node

const fs = require('fs');
const babel = require('@babel/core');

const inputFile = process.argv[2];
if (!inputFile || !inputFile.endsWith('.ohn')) {
  console.error('Usage: ohnc <file.ohn>');
  process.exit(1);
}

const outputFile = inputFile.replace(/\.ohn$/, '.js');
const code = fs.readFileSync(inputFile, 'utf8');

// The transpiler prioritizes zero-cost abstractions and memory safety.
// We use Babel as our foundation and apply our presets/plugins.
babel.transformAsync(code, {
  filename: inputFile,
  presets: ['@babel/preset-env'],
  plugins: [
    ['@babel/plugin-syntax-decorators', { legacy: true }],
    require('../src/plugins/babel-plugin-binary-layout')
  ]
}).then(result => {
  fs.writeFileSync(outputFile, result.code);
  console.log(`Successfully compiled ${inputFile} -> ${outputFile}`);
}).catch(err => {
  console.error('Compilation failed:', err);
  process.exit(1);
});
