import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const packageJson = JSON.parse(await read('package.json'))
const mobilePackageJson = JSON.parse(await read('mobile/package.json'))
const modelManifest = await read('mobile/src/data/modelManifest.ts')
const gradle = await read('mobile/android/app/build.gradle')
const backendFactory = await read('backend/app/factory.py')

const expected = packageJson.version
const checks = [
  ['mobile/package.json', mobilePackageJson.version],
  ['mobile/src/data/modelManifest.ts', modelManifest.match(/APP_VERSION\s*=\s*['"]([^'"]+)/u)?.[1]],
  ['mobile/android/app/build.gradle', gradle.match(/versionName\s+["']([^"']+)/u)?.[1]],
  ['backend/app/factory.py', backendFactory.match(/FastAPI\([^\n]*version=["']([^"']+)/u)?.[1]],
]

const failed = checks.filter(([, value]) => value !== expected)
if (failed.length) {
  console.error(`Version mismatch. Expected ${expected}.`)
  for (const [source, value] of failed) console.error(`- ${source}: ${value ?? 'not found'}`)
  process.exit(1)
}

console.log(`VoiceShield version ${expected} is consistent across web, mobile, Android, and backend.`)
