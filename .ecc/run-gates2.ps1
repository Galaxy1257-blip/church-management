# Final gate sweep (Session M close-out). Each step writes its own log + .exit file.
$ErrorActionPreference = 'Continue'
Set-Location 'C:\Users\HP\Desktop\church'

function Step($name, $cmd) {
  Write-Host "=== $name"
  cmd /c "$cmd > .ecc\$name.log 2>&1"
  $code = $LASTEXITCODE
  Set-Content ".ecc\$name.exit" $code
  Write-Host "=== $name exit=$code"
}

Step 'shared-build' 'npm run build -w @chms/shared'
Step 'g-shared-test' 'npm run test -w @chms/shared'
Step 'g-api-test' 'npm run test -w @chms/api'
Step 'g-typecheck' 'npm run typecheck'
Step 'g-lint' 'npx eslint .'
Step 'g-secrets' 'node scripts/check-secrets.mjs'
Step 'g-smoke' 'npx tsx .ecc/access-smoke.mts'
Write-Host 'ALL GATE STEPS DONE'
