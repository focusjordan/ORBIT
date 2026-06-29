'use strict';

// Mock os.homedir BEFORE requiring config/audit to ensure we do not touch the real homedir
const os = require('os');
const fs = require('fs');
const path = require('path');

const originalHomedir = os.homedir;
const tempHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-cli-test-home-'));
os.homedir = () => tempHomeDir;

const originalCwd = process.cwd();
const tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-cli-test-cwd-'));
process.chdir(tempCwd);

const { writeConfig, GLOBAL_CONFIG_PATH } = require('../../cli/lib/config');
const { auditLog, AUDIT_FILE } = require('../../cli/lib/audit');
const ingestCmd = require('../../cli/lib/commands/ingest');

function cleanUp() {
  process.chdir(originalCwd);
  os.homedir = originalHomedir;
  try {
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
    fs.rmSync(tempCwd, { recursive: true, force: true });
  } catch {
    void 0;
  }
}

async function runTests() {
  console.log('🧪 Running CLI Security Tests\n');

  try {
    // ---------------------------------------------------------
    // Test 1: Config Permissions (CWE-732)
    // ---------------------------------------------------------
    console.log('Test 1: Config Permissions (CWE-732)');
    
    // Write local configuration
    const localConfigPath = writeConfig('local', { privateKey: 'dGVzdC1wcml2YXRlLWtleQ==' });
    console.assert(fs.existsSync(localConfigPath), 'Local config should be written');
    
    // Write global configuration
    const globalConfigPath = writeConfig('global', { apiKey: 'test-api-key' });
    console.assert(fs.existsSync(globalConfigPath), 'Global config should be written');
    console.assert(globalConfigPath === GLOBAL_CONFIG_PATH, 'Global config path should match');

    // On Unix-like systems, check that mode is 0o600 (owner read/write only)
    if (process.platform !== 'win32') {
      const localStat = fs.statSync(localConfigPath);
      const globalStat = fs.statSync(globalConfigPath);
      
      const localMode = localStat.mode & 0o777;
      const globalMode = globalStat.mode & 0o777;
      
      console.assert(localMode === 0o600, `Local config mode should be 0o600, got 0o${localMode.toString(8)}`);
      console.assert(globalMode === 0o600, `Global config mode should be 0o600, got 0o${globalMode.toString(8)}`);
      console.log('   ✅ Config files written with owner-only (0o600) permissions');
    } else {
      console.log('   ✅ Config files written (permissions check skipped on Windows)');
    }
    console.log();

    // ---------------------------------------------------------
    // Test 2: Audit Directory & Log Permissions (CWE-732)
    // ---------------------------------------------------------
    console.log('Test 2: Audit Log Permissions (CWE-732)');
    
    // Write to audit log
    auditLog('test-command', 'test-action', { detail: 'info' });
    console.assert(fs.existsSync(AUDIT_FILE), 'Audit file should be created');

    if (process.platform !== 'win32') {
      const auditDir = path.dirname(AUDIT_FILE);
      const dirStat = fs.statSync(auditDir);
      const fileStat = fs.statSync(AUDIT_FILE);
      
      const dirMode = dirStat.mode & 0o777;
      const fileMode = fileStat.mode & 0o777;
      
      console.assert(dirMode === 0o700, `Audit directory mode should be 0o700, got 0o${dirMode.toString(8)}`);
      console.assert(fileMode === 0o600, `Audit file mode should be 0o600, got 0o${fileMode.toString(8)}`);
      console.log('   ✅ Audit directory (0o700) and file (0o600) secured');
    } else {
      console.log('   ✅ Audit log created (permissions check skipped on Windows)');
    }
    console.log();

    // ---------------------------------------------------------
    // Test 3: Path Traversal Block (CWE-22) in Ingest
    // ---------------------------------------------------------
    console.log('Test 3: DDEX Ingest Path Traversal Block (CWE-22)');
    
    const audioDir = path.join(tempCwd, 'audio');
    fs.mkdirSync(audioDir);

    // Create a dummy secret file outside the audio directory
    const secretFilePath = path.join(tempCwd, 'secret.txt');
    fs.writeFileSync(secretFilePath, 'sensitive content');

    // Create a valid audio file inside the audio directory
    const safeAudioPath = path.join(audioDir, 'track1.mp3');
    fs.writeFileSync(safeAudioPath, 'dummy audio');

    // Create target traversal path relative to audioDir
    // which resolves to the secret.txt outside audioDir
    const traversalFilename = '../secret.txt';

    // Verify resolving it goes to secretFilePath
    const resolvedTraversal = path.resolve(audioDir, traversalFilename);
    console.assert(resolvedTraversal === secretFilePath, 'Sanity check: resolve matches secret file');

    // Create XML string with both safe and traversal tracks
    const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<NewReleaseMessage xmlns="http://ddex.net/xml/ern/382">
  <ResourceList>
    <SoundRecording>
      <ReferenceTitle>
        <TitleText>Safe Track</TitleText>
      </ReferenceTitle>
      <DisplayArtistName>Artist</DisplayArtistName>
      <ResourceReference>A1</ResourceReference>
      <TechnicalSoundRecordingDetails>
        <File>
          <FileName>track1.mp3</FileName>
        </File>
      </TechnicalSoundRecordingDetails>
    </SoundRecording>
    <SoundRecording>
      <ReferenceTitle>
        <TitleText>Traversal Attempt Track</TitleText>
      </ReferenceTitle>
      <DisplayArtistName>Artist</DisplayArtistName>
      <ResourceReference>A2</ResourceReference>
      <TechnicalSoundRecordingDetails>
        <File>
          <FileName>${traversalFilename}</FileName>
        </File>
      </TechnicalSoundRecordingDetails>
    </SoundRecording>
  </ResourceList>
</NewReleaseMessage>`;

    const xmlPath = path.join(tempCwd, 'release.xml');
    fs.writeFileSync(xmlPath, xmlContent, 'utf8');

    // Mock process.stdout.write to capture the dry-run JSON output
    let stdoutBuffer = '';
    const originalStdoutWrite = process.stdout.write;
    process.stdout.write = (chunk, encoding, callback) => {
      stdoutBuffer += chunk.toString();
      if (callback) callback();
      return true;
    };

    try {
      // Create a mock parent program to register global option '--json'
      const { Command } = require('commander');
      const parentProgram = new Command();
      parentProgram.option('--json');
      parentProgram.addCommand(ingestCmd);

      // Execute the parent program in dry-run mode with --json
      await parentProgram.parseAsync([
        'node', 'orbit', 'ingest', xmlPath,
        '--owner-id', '00000000-0000-0000-0000-000000000001',
        '--audio-dir', audioDir,
        '--dry-run',
        '--yes',
        '--json'
      ]);
    } finally {
      // Restore stdout
      process.stdout.write = originalStdoutWrite;
    }

    // Parse captured JSON output
    const jsonStart = stdoutBuffer.indexOf('{');
    const jsonEnd = stdoutBuffer.lastIndexOf('}');
    console.assert(jsonStart !== -1 && jsonEnd !== -1, 'Stdout should contain JSON output');
    const jsonString = stdoutBuffer.slice(jsonStart, jsonEnd + 1);
    
    const dryRunResult = JSON.parse(jsonString);
    console.assert(dryRunResult.total === 2, 'Should parse 2 tracks');
    
    // Find track results
    const safeTrack = dryRunResult.tracks.find(t => t.title === 'Safe Track');
    const traversalTrack = dryRunResult.tracks.find(t => t.title === 'Traversal Attempt Track');

    console.assert(safeTrack !== undefined, 'Safe track should be parsed');
    console.assert(safeTrack.audio_found === true, 'Safe track audio should be resolved (found)');
    
    console.assert(traversalTrack !== undefined, 'Traversal track should be parsed');
    console.assert(traversalTrack.audio_found === false, 'Traversal track audio should be blocked (not found)');

    console.log('   ✅ Safe track resolved successfully');
    console.log('   ✅ Path traversal attempt blocked successfully');
    console.log();

    console.log('🧪 All CLI security tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    cleanUp();
    process.exit(1);
  }

  cleanUp();
}

runTests();
