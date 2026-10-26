Set-Location 'C:\Users\HP\Desktop\church'
npx eslint . > .ecc\lint-final.log 2>&1
$LASTEXITCODE | Set-Content .ecc\lint-final.exit
npm run typecheck -w @chms/web > .ecc\web-tc.log 2>&1
$LASTEXITCODE | Set-Content .ecc\web-tc.exit
