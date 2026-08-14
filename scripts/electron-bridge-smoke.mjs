import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import electron from 'electron'

const directory = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-bridge-smoke-'))
const resultPath = path.join(directory, 'result.json')
const packagedExecutable = process.argv[2] ? path.resolve(process.argv[2]) : null
const executable = packagedExecutable ?? electron
const args = packagedExecutable ? [] : ['.']
args.push('--hexbridge-smoke-test', `--user-data-dir=${path.join(directory, 'user-data')}`)

let child = null
let fakeLeagueClient = null
let timeout = null
let stdout = ''
let stderr = ''

function waitForProcess(processHandle, milliseconds) {
  if (!processHandle || processHandle.exitCode !== null || processHandle.signalCode !== null) return Promise.resolve(true)
  return new Promise((resolve) => {
    let timer = null
    const finish = (exited) => {
      if (timer) clearTimeout(timer)
      processHandle.removeListener('exit', onExit)
      processHandle.removeListener('error', onError)
      resolve(exited)
    }
    const onExit = () => finish(true)
    const onError = () => finish(true)
    processHandle.once('exit', onExit)
    processHandle.once('error', onError)
    timer = setTimeout(() => finish(false), milliseconds)
  })
}

async function terminate(processHandle) {
  if (!processHandle || processHandle.exitCode !== null || processHandle.signalCode !== null) return
  if (process.platform === 'win32' && processHandle.pid) {
    const killer = spawn('taskkill.exe', ['/pid', String(processHandle.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    if (!(await waitForProcess(killer, 4_000))) killer.kill()
  }
  if (processHandle.exitCode === null && processHandle.signalCode === null) processHandle.kill('SIGKILL')
  await waitForProcess(processHandle, 2_000)
}

async function runCommand(executablePath, commandArgs, maximumMs) {
  const processHandle = spawn(executablePath, commandArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let output = ''
  processHandle.stdout.on('data', (chunk) => { output = `${output}${chunk}`.slice(-8_000) })
  processHandle.stderr.on('data', (chunk) => { output = `${output}${chunk}`.slice(-8_000) })
  let commandTimeout = null
  const exitCode = await Promise.race([
    new Promise((resolve, reject) => {
      processHandle.once('error', reject)
      processHandle.once('exit', resolve)
    }),
    new Promise((_, reject) => {
      commandTimeout = setTimeout(
        () => reject(new Error(`Command timed out: ${path.basename(executablePath)}`)),
        maximumMs,
      )
    }),
  ]).finally(async () => {
    if (commandTimeout) clearTimeout(commandTimeout)
    await terminate(processHandle)
  })
  if (exitCode !== 0) throw new Error(`Command failed (${exitCode}): ${output}`)
}

async function launchFakeLeagueClient() {
  if (process.platform !== 'win32') return null
  const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows'
  const compilerCandidates = [
    path.join(systemRoot, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(systemRoot, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ]
  let compiler = null
  for (const candidate of compilerCandidates) {
    try {
      if ((await stat(candidate)).isFile()) {
        compiler = candidate
        break
      }
    } catch {
      // Try the next standard .NET Framework compiler location.
    }
  }
  if (!compiler) throw new Error('Windows C# compiler is unavailable for the League window smoke')

  const sourcePath = path.join(directory, 'FakeLeagueClient.cs')
  const executablePath = path.join(directory, 'LeagueClientUx.exe')
  const readyPath = path.join(directory, 'fake-league-ready.txt')
  await writeFile(sourcePath, String.raw`
using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

internal static class FakeLeagueClient {
  [STAThread]
  private static void Main(string[] args) {
    Application.EnableVisualStyles();
    Application.SetCompatibleTextRenderingDefault(false);
    var form = new Form {
      Text = "HexBridge LeagueClientUx smoke",
      StartPosition = FormStartPosition.Manual,
      Bounds = new Rectangle(60, 100, 480, 360)
    };
    var alternate = false;
    var timer = new Timer { Interval = 900 };
    timer.Tick += (_, __) => {
      alternate = !alternate;
      form.Location = alternate ? new Point(260, 180) : new Point(60, 100);
    };
    form.Shown += (_, __) => {
      if (args.Length > 0) File.WriteAllText(args[0], form.Handle.ToInt64().ToString());
      timer.Start();
    };
    Application.Run(form);
  }
}
`, 'utf8')
  await runCommand(compiler, [
    '/nologo',
    '/target:winexe',
    `/out:${executablePath}`,
    '/reference:System.Windows.Forms.dll',
    '/reference:System.Drawing.dll',
    sourcePath,
  ], 20_000)
  const processHandle = spawn(executablePath, [readyPath], {
    stdio: 'ignore',
    windowsHide: false,
  })
  let launchError = null
  processHandle.once('error', (error) => { launchError = error })
  const deadlineAt = Date.now() + 8_000
  while (Date.now() < deadlineAt) {
    if (launchError) throw new Error(`Fake LeagueClientUx failed to launch: ${launchError.message}`)
    if (processHandle.exitCode !== null || processHandle.signalCode !== null) {
      throw new Error('Fake LeagueClientUx exited before creating its window')
    }
    try {
      if ((await readFile(readyPath, 'utf8')).trim()) return processHandle
    } catch {
      // The helper writes the readiness signal after its HWND exists.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  await terminate(processHandle)
  throw new Error('Fake LeagueClientUx window did not become ready')
}

try {
  fakeLeagueClient = await launchFakeLeagueClient()
  child = spawn(executable, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HEXBRIDGE_SMOKE_RESULT: resultPath,
      HEXBRIDGE_SMOKE_FAKE_LEAGUE: fakeLeagueClient ? '1' : '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  child.stdout.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-12_000) })
  child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-12_000) })

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => resolve(code))
    timeout = setTimeout(() => {
      child?.kill('SIGKILL')
      reject(new Error('Electron bridge smoke test timed out'))
    }, 30_000)
  })
  const result = JSON.parse(await readFile(resultPath, 'utf8'))
  if (
    exitCode !== 0 ||
    result.ok !== true ||
    result.bridge !== true ||
    result.ipc !== true ||
    result.lcuDiscovery !== true ||
    result.shutdownLifecycle !== true
  ) {
    throw new Error(`Electron bridge smoke test failed: ${JSON.stringify({ exitCode, result, stdout, stderr })}`)
  }
  if (process.platform === 'win32' && (
    result.windowsDisplayCapture !== true ||
    result.windowObserverScript !== true ||
    result.windowObserverFollow !== true
  )) {
    throw new Error(`Electron Windows bridge smoke test failed: ${JSON.stringify(result)}`)
  }
  if (packagedExecutable && process.platform === 'win32') {
    const packagedResources = path.join(path.dirname(packagedExecutable), 'resources')
    const iconSizes = await Promise.all(['icon.ico', 'icon.png'].map(async (name) => (
      await stat(path.join(packagedResources, name))
    ).size))
    if (iconSizes.some((size) => size < 1_000)) {
      throw new Error(`Packaged application icon resources are missing or empty: ${JSON.stringify(iconSizes)}`)
    }
  }
  const security = result.security ?? {}
  if (
    security.sandbox !== true ||
    security.contextIsolation !== true ||
    security.nodeIntegration !== false ||
    security.webSecurity !== true
  ) {
    throw new Error(`Electron security preferences regressed: ${JSON.stringify(security)}`)
  }
  console.log(`Electron bridge smoke test passed (${packagedExecutable ? 'packaged' : 'built'} app)`)
} finally {
  if (timeout) clearTimeout(timeout)
  await terminate(child)
  await terminate(fakeLeagueClient)
  await rm(directory, { recursive: true, force: true })
}
