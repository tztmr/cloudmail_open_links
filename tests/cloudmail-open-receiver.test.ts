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
    path.join(binDir, 'git'),
    `#!/usr/bin/env bash
set -euo pipefail
echo "git $*" >> "\${STUB_LOG:?}"
if [[ "\${1:-}" == "clone" ]]; then
  target="\${@: -1}"
  mkdir -p "$target"
  cat > "$target/docker-compose.yml" <<'EOF'
services:
  app:
    build: .
    ports:
      - "4138:3000"
  mongo:
    image: mongo:7
EOF
  cat > "$target/.env.production.local" <<'EOF'
\${GIT_CLONE_ENV_CONTENT:-PORT=3118
HOSTNAME=0.0.0.0}
EOF
fi
exit 0
`
  );

  writeExecutable(
    path.join(binDir, 'docker'),
    `#!/usr/bin/env bash
set -euo pipefail
echo "docker $*" >> "\${STUB_LOG:?}"
if [[ "\${1:-}" == "compose" && "\${2:-}" == "version" ]]; then
  exit 0
fi
exit 0
`
  );

  writeExecutable(
    path.join(binDir, 'ufw'),
    `#!/usr/bin/env bash
set -euo pipefail
echo "ufw $*" >> "\${STUB_LOG:?}"
if [[ "\${1:-}" == "status" ]]; then
  echo "Status: active"
fi
exit 0
`
  );

  writeExecutable(
    path.join(binDir, 'firewall-cmd'),
    `#!/usr/bin/env bash
set -euo pipefail
echo "firewall-cmd $*" >> "\${STUB_LOG:?}"
if [[ "\${1:-}" == "--state" ]]; then
  exit 0
fi
exit 0
`
  );

  writeExecutable(
    path.join(binDir, 'nginx'),
    `#!/usr/bin/env bash
set -euo pipefail
echo "nginx $*" >> "\${STUB_LOG:?}"
exit 0
`
  );

  writeExecutable(
    path.join(binDir, 'certbot'),
    `#!/usr/bin/env bash
set -euo pipefail
echo "certbot $*" >> "\${STUB_LOG:?}"
exit 0
`
  );

  writeExecutable(
    path.join(binDir, 'sudo'),
    `#!/usr/bin/env bash
set -euo pipefail
echo "sudo $*" >> "\${STUB_LOG:?}"
if [[ "\${1:-}" == "bash" && "\${2:-}" == "-lc" ]]; then
  shift 2
  bash -lc "$1"
else
  "$@"
fi
`
  );
}

function createProjectFixture(options?: { envContent?: string; composeContent?: string }) {
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
  fs.writeFileSync(
    path.join(projectDir, 'docker-compose.yml'),
    options?.composeContent ??
      [
        'services:',
        '  app:',
        '    build: .',
        '    ports:',
        '      - "4138:3000"',
        '  mongo:',
        '    image: mongo:7',
        '',
      ].join('\n')
  );

  if (options?.envContent) {
    fs.writeFileSync(path.join(projectDir, '.env'), options.envContent);
  }

  createStubBin(binDir);

  return { tempRoot, projectDir, runDir, binDir, logPath };
}

function writeStateFile(homeDir: string, content: string) {
  const stateDir = path.join(homeDir, '.cloudmail-open-links');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'state.env'), content);
}

function runScript(
  scriptPath: string,
  cwd: string,
  binDir: string,
  logPath: string,
  args: string[] = ['--dry-run'],
  extraEnv: Record<string, string> = {},
  input = ''
) {
  return spawnSync('bash', [scriptPath, ...args], {
    cwd,
    encoding: 'utf8',
    input,
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      STUB_LOG: logPath,
      ...extraEnv,
    },
  });
}

test('cloudmail-open-receiver 会以脚本所在目录作为项目根目录', () => {
  const fixture = createProjectFixture({
    envContent: 'PUBLIC_BASE_URL=http://localhost:4138\n',
  });
  const scriptPath = path.join(fixture.projectDir, 'cloudmail-open-receiver.sh');

  const result = runScript(scriptPath, fixture.runDir, fixture.binDir, fixture.logPath);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /docker compose up -d --build/);
});

test('cloudmail-open-receiver 在缺少环境文件时会给出明确错误', () => {
  const fixture = createProjectFixture();
  const scriptPath = path.join(fixture.projectDir, 'cloudmail-open-receiver.sh');

  const result = runScript(scriptPath, fixture.projectDir, fixture.binDir, fixture.logPath);

  assert.notEqual(result.status, 0, '缺少环境文件时应失败');
  assert.match(result.stderr + result.stdout, /\.env/);
});

test('cloudmail-open-receiver 会优先提示 docker-compose 中声明的对外端口', () => {
  const fixture = createProjectFixture({
    envContent: 'PUBLIC_BASE_URL=http://localhost:4138\n',
    composeContent: [
      'services:',
      '  app:',
      '    build: .',
      '    ports:',
      '      - "4555:3000"',
      '  mongo:',
      '    image: mongo:7',
      '',
    ].join('\n'),
  });
  const scriptPath = path.join(fixture.projectDir, 'cloudmail-open-receiver.sh');

  const result = runScript(scriptPath, fixture.projectDir, fixture.binDir, fixture.logPath);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /4555/);
});

test('cloudmail-open-receiver 在缺少 .env 时会从 .env.example 自动生成', () => {
  const fixture = createProjectFixture();
  const scriptPath = path.join(fixture.projectDir, 'cloudmail-open-receiver.sh');
  fs.writeFileSync(
    path.join(fixture.projectDir, '.env.example'),
    'PUBLIC_BASE_URL=http://localhost:4138\nADMIN_PASSWORD=admin123\n'
  );

  const result = runScript(scriptPath, fixture.projectDir, fixture.binDir, fixture.logPath, []);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /已根据 .env.example 自动生成/);
  assert.equal(fs.existsSync(path.join(fixture.projectDir, '.env')), true);
});

test('cloudmail-open-receiver 支持通过已保存状态执行 update', () => {
  const fixture = createProjectFixture({
    envContent: 'PUBLIC_BASE_URL=http://localhost:4138\n',
  });
  const scriptPath = path.join(fixture.projectDir, 'cloudmail-open-receiver.sh');

  writeStateFile(
    fixture.tempRoot,
    [
      `PROJECT_ROOT='${fixture.projectDir}'`,
      `ENV_FILE='${path.join(fixture.projectDir, '.env')}'`,
      `APP_NAME='saved-cloudmail'`,
      `APP_PORT='4138'`,
      `APP_HOSTNAME='0.0.0.0'`,
    ].join('\n')
  );

  const result = runScript(
    scriptPath,
    fixture.runDir,
    fixture.binDir,
    fixture.logPath,
    ['--dry-run', 'update'],
    { HOME: fixture.tempRoot }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /docker compose up -d --build/);
});

test('cloudmail-open-receiver 支持通过已保存状态查看 status', () => {
  const fixture = createProjectFixture({
    envContent: 'PUBLIC_BASE_URL=http://localhost:4138\n',
  });
  const scriptPath = path.join(fixture.projectDir, 'cloudmail-open-receiver.sh');

  writeStateFile(
    fixture.tempRoot,
    [
      `PROJECT_ROOT='${fixture.projectDir}'`,
      `ENV_FILE='${path.join(fixture.projectDir, '.env')}'`,
      `APP_NAME='status-cloudmail'`,
      `APP_PORT='4138'`,
      `APP_HOSTNAME='0.0.0.0'`,
    ].join('\n')
  );

  const result = runScript(
    scriptPath,
    fixture.runDir,
    fixture.binDir,
    fixture.logPath,
    ['--dry-run', 'status'],
    { HOME: fixture.tempRoot }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /docker compose ps/);
});

test('cloudmail-open-receiver 部署时会尝试放行应用端口', () => {
  const fixture = createProjectFixture({
    envContent: 'PUBLIC_BASE_URL=http://localhost:4138\n',
  });
  const scriptPath = path.join(fixture.projectDir, 'cloudmail-open-receiver.sh');

  const result = runScript(scriptPath, fixture.projectDir, fixture.binDir, fixture.logPath);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ufw allow 4138\/tcp/);
});

test('cloudmail-open-receiver 在脚本目录无项目代码时会自动 clone GitHub 仓库后部署', () => {
  const tempRoot = makeTempDir('cloudmail-open-receiver-standalone-');
  const scriptDir = path.join(tempRoot, 'standalone');
  const runDir = path.join(tempRoot, 'outside');
  const binDir = path.join(tempRoot, 'bin');
  const logPath = path.join(tempRoot, 'stub.log');
  fs.mkdirSync(scriptDir, { recursive: true });
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(logPath, '');
  fs.copyFileSync(sourceScriptPath, path.join(scriptDir, 'cloudmail-open-receiver.sh'));
  createStubBin(binDir);

  const scriptPath = path.join(scriptDir, 'cloudmail-open-receiver.sh');
  const result = runScript(
    scriptPath,
    runDir,
    binDir,
    logPath,
    [],
    {
      HOME: tempRoot,
      GIT_CLONE_ENV_CONTENT: 'PORT=4555\nHOSTNAME=0.0.0.0\n',
    }
  );

  const stubLog = fs.readFileSync(logPath, 'utf8');
  assert.equal(result.status, 0, result.stderr);
  assert.match(stubLog, /git clone .*tztmr\/cloudmail_open_links\.git/);
  assert.match(stubLog, /docker compose up -d --build/);
});

test('cloudmail-open-receiver 的 update 会先拉取 GitHub 最新代码再构建', () => {
  const fixture = createProjectFixture({
    envContent: 'PUBLIC_BASE_URL=http://localhost:4138\n',
  });
  const scriptPath = path.join(fixture.projectDir, 'cloudmail-open-receiver.sh');

  writeStateFile(
    fixture.tempRoot,
    [
      `PROJECT_ROOT='${fixture.projectDir}'`,
      `ENV_FILE='${path.join(fixture.projectDir, '.env')}'`,
      `APP_NAME='saved-cloudmail'`,
      `APP_PORT='4138'`,
      `APP_HOSTNAME='0.0.0.0'`,
      `PROJECT_SOURCE='git'`,
      `GIT_REPO_URL='https://github.com/tztmr/cloudmail_open_links.git'`,
    ].join('\n')
  );

  const result = runScript(
    scriptPath,
    fixture.runDir,
    fixture.binDir,
    fixture.logPath,
    ['update'],
    { HOME: fixture.tempRoot }
  );

  const stubLog = fs.readFileSync(fixture.logPath, 'utf8');
  assert.equal(result.status, 0, result.stderr);
  assert.match(stubLog, /git pull --ff-only/);
  assert.match(stubLog, /docker compose up -d --build/);
});

test('cloudmail-open-receiver 支持启用 nginx + certbot HTTPS', () => {
  const fixture = createProjectFixture({
    envContent: 'PUBLIC_BASE_URL=http://localhost:4138\n',
  });
  const scriptPath = path.join(fixture.projectDir, 'cloudmail-open-receiver.sh');
  const nginxConfDir = path.join(fixture.tempRoot, 'nginx-conf');
  fs.mkdirSync(nginxConfDir, { recursive: true });

  writeStateFile(
    fixture.tempRoot,
    [
      `PROJECT_ROOT='${fixture.projectDir}'`,
      `ENV_FILE='${path.join(fixture.projectDir, '.env')}'`,
      `APP_NAME='ssl-cloudmail'`,
      `APP_PORT='4138'`,
      `APP_HOSTNAME='0.0.0.0'`,
    ].join('\n')
  );

  const result = runScript(
    scriptPath,
    fixture.projectDir,
    fixture.binDir,
    fixture.logPath,
    ['--dry-run', 'enable-ssl'],
    {
      HOME: fixture.tempRoot,
      NGINX_CONF_DIR: nginxConfDir,
    },
    'mail.example.com\nadmin@mail.example.com\n'
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /certbot --nginx -d mail\.example\.com/);
  assert.match(result.stdout, /HTTPS 地址: https:\/\/mail\.example\.com/);
});

test('cloudmail-open-receiver 生成的 nginx 配置会保留 nginx 变量', () => {
  const fixture = createProjectFixture({
    envContent: 'PUBLIC_BASE_URL=http://localhost:4138\n',
  });
  const scriptPath = path.join(fixture.projectDir, 'cloudmail-open-receiver.sh');
  const nginxConfDir = path.join(fixture.tempRoot, 'nginx-conf');
  fs.mkdirSync(nginxConfDir, { recursive: true });

  writeStateFile(
    fixture.tempRoot,
    [
      `PROJECT_ROOT='${fixture.projectDir}'`,
      `ENV_FILE='${path.join(fixture.projectDir, '.env')}'`,
      `APP_NAME='ssl-cloudmail'`,
      `APP_PORT='4138'`,
      `APP_HOSTNAME='0.0.0.0'`,
    ].join('\n')
  );

  const result = runScript(
    scriptPath,
    fixture.projectDir,
    fixture.binDir,
    fixture.logPath,
    ['enable-ssl'],
    {
      HOME: fixture.tempRoot,
      NGINX_CONF_DIR: nginxConfDir,
    },
    'mail.example.com\nadmin@mail.example.com\n'
  );

  const confPath = path.join(nginxConfDir, 'mail.example.com.conf');
  const conf = fs.readFileSync(confPath, 'utf8');
  assert.equal(result.status, 0, result.stderr);
  assert.match(conf, /proxy_set_header Host \$host;/);
  assert.match(conf, /proxy_set_header X-Real-IP \$remote_addr;/);
  assert.match(conf, /proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;/);
  assert.match(conf, /proxy_set_header X-Forwarded-Proto \$scheme;/);
});

test('cloudmail-open-receiver 启用 HTTPS 时会优先使用 docker-compose 当前端口而不是旧状态端口', () => {
  const fixture = createProjectFixture({
    envContent: 'PUBLIC_BASE_URL=http://localhost:4138\n',
    composeContent: [
      'services:',
      '  app:',
      '    build: .',
      '    ports:',
      '      - "4138:3000"',
      '  mongo:',
      '    image: mongo:7',
      '',
    ].join('\n'),
  });
  const scriptPath = path.join(fixture.projectDir, 'cloudmail-open-receiver.sh');
  const nginxConfDir = path.join(fixture.tempRoot, 'nginx-conf');
  fs.mkdirSync(nginxConfDir, { recursive: true });

  writeStateFile(
    fixture.tempRoot,
    [
      `PROJECT_ROOT='${fixture.projectDir}'`,
      `ENV_FILE='${path.join(fixture.projectDir, '.env')}'`,
      `APP_NAME='ssl-cloudmail'`,
      `APP_PORT='3118'`,
      `APP_HOSTNAME='0.0.0.0'`,
    ].join('\n')
  );

  const result = runScript(
    scriptPath,
    fixture.projectDir,
    fixture.binDir,
    fixture.logPath,
    ['enable-ssl'],
    {
      HOME: fixture.tempRoot,
      NGINX_CONF_DIR: nginxConfDir,
    },
    'mail.example.com\nadmin@mail.example.com\n'
  );

  const confPath = path.join(nginxConfDir, 'mail.example.com.conf');
  const conf = fs.readFileSync(confPath, 'utf8');
  assert.equal(result.status, 0, result.stderr);
  assert.match(conf, /proxy_pass http:\/\/127\.0\.0\.1:4138;/);
  assert.doesNotMatch(conf, /proxy_pass http:\/\/127\.0\.0\.1:3118;/);
});
