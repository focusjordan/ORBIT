const fs = require('fs');
const path = require('path');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '../../', relPath), 'utf8');
}

function assertIncludes(content, needle, context) {
  if (!content.includes(needle)) {
    throw new Error(`Missing "${needle}" in ${context}`);
  }
}

function run() {
  const cfg = read('src/config/index.js');
  const registerHandler = read('src/api/handlers/register.js');
  const analyzeRoute = read('src/api/v2/routes.js');
  const cliDetect = read('cli/lib/commands/detect.js');

  const expectedFlags = [
    'ORBIT_AI_V2_ENABLED',
    'ORBIT_AI_SHADOW_MODE',
    'ORBIT_AI_REGISTER_ANALYSIS_ENABLED',
    'ORBIT_AI_KNN_ENABLED',
    'ORBIT_AI_PROMPTS_V2_ENABLED',
    'ORBIT_AI_METADATA_V2_ENABLED',
    'ORBIT_AI_CROSSSIGNAL_V2_ENABLED',
  ];

  expectedFlags.forEach((flag) => assertIncludes(cfg, flag, 'src/config/index.js'));

  assertIncludes(registerHandler, 'config.ai.registerAnalysisEnabled', 'src/api/handlers/register.js');
  assertIncludes(registerHandler, 'analysisResult: aiAnalysisResult', 'src/api/handlers/register.js');

  assertIncludes(analyzeRoute, 'telemetry: aiDetectionResult.telemetry', 'src/api/v2/routes.js');
  assertIncludes(analyzeRoute, 'active_flags: aiDetectionResult.active_flags', 'src/api/v2/routes.js');

  assertIncludes(cliDetect, "'ai_detection'", 'cli/lib/commands/detect.js');

  console.log('✅ AI rollout wiring checks passed');
}

run();
