import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const sourceScriptPath = path.join(process.cwd(), 'cloudmail-open-receiver.sh');

function makeTempDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeExecutable(filePath: string, content: string) {
  fs.writeFileSync(filePath, content, { mode: 0o755 });
}

function createStubBin(binDir: string) {
  writeExecutable(
    path.join(binDir, 'node'),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "-p" ]]; then
  echo 22
  exit 0
fi
if [[ "\${1:-}" == "-v" ]]; then
  echo v22.0.0
  exit 0
fi
exit 0
`
  );

  writeExecutable(
    path.join(binDir, 'npm'),
    `#!/usr/bin/env bash
set -euo pipefail
echo "npm $*" >> "\${STUB_LOG:?}"
exit 0
`
  );

  writeExecutable(
    path.join(binDir, 'pm2'),
    `#!/usr/bin/env bash
set -euo pipefail
echo "pm2 $*" >> "\${STUB_LOG:?}"
exit 0
`
  );
}

function createProjectFixture(options?: { envContent?: string }) {
  const tempRoot = makeTempDir('cloudmail-open-receiver-');
  const projectDir = path.join(tempRoot, 'project');
  const runDir = path.join(tempRoot, 'outside');
  const binDir = path.join(tempRoot, 'bin');
  const logPath = path.join(tempRoot, 'stub.log');

  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(logPath, '');

  fs.copyFileSync(sourceScriptPath, path.join(projectDir, 'cloudmail-open-receiver.sh'));
  fs.writeFileSync(
    path.join(projectDir, 'package.json'),
    JSON.stringify({ name: 'fixture', private: true, scripts: { build: 'echo build', start: 'echo start' } })
  );

  if (options?.envContent) {
    fs.writeFileSync(path.join(projectDir, '.env.production.local'), options.envContent);
  }

  createStubBin(binDir);

  return { tempRoot, projectDir, runDir, binDir, logPath };
}

function runScript(scriptPath: string, cwd: string, binDir: string, logPath: string) {
  return spawnSync('bash', [scriptPath, '--dry-run'], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      STUB_LOG: logPath,
    },
  });
}

test('cloudmail-open-receiver 会以脚本所在目录作为项目根目录', () => {
  const fixture = createProjectFixture({
    envContent: 'PORT=3118\nHOSTNAME=0.0.0.0\n',
  });
  const scriptPath = path.join(fixture.projectDir, 'cloudmail-open-receiver.sh');

  const result = runScript(scriptPath, fixture.runDir, fixture.binDir, fixture.logPath);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /3118/);
});

test('cloudmail-open-receiver 在缺少环境文件时会给出明确错误', () => {
  const fixture = createProjectFixture();
  const scriptPath = path.join(fixture.projectDir, 'cloudmail-open-receiver.sh');

  const result = runScript(scriptPath, fixture.projectDir, fixture.binDir, fixture.logPath);

  assert.notEqual(result.status, 0, '缺少环境文件时应失败');
  assert.match(result.stderr + result.stdout, /\.env\.production\.local|\.env/);
});

test('cloudmail-open-receiver 会优先提示环境文件中声明的端口', () => {
  const fixture = createProjectFixture({
    envContent: 'PORT=3118\nHOSTNAME=0.0.0.0\n',
  });
  const scriptPath = path.join(fixture.projectDir, 'cloudmail-open-receiver.sh');

  const result = runScript(scriptPath, fixture.projectDir, fixture.binDir, fixture.logPath);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /3118/);
  assert.doesNotMatch(result.stdout, /默认 3000/);
});
