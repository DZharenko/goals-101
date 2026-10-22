# Deploy to GitHub Pages. Usage: .\tools\deploy.ps1
# Builds dist/ to a temp folder, switches to gh-pages, mirrors the build there, pushes.

$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\.."

# gh-pages branch has no .gitignore: set local excludes so git add -A never picks junk
$excl = ".git\info\exclude"
$needed = @("node_modules/", "dist/", "data-*.json", "migration-report.txt", "*.tsbuildinfo", ".deploy-worktree/")
$content = if (Test-Path $excl) { @(Get-Content $excl) } else { @() }
foreach ($n in $needed) { if ($content -notcontains $n) { $content += $n } }
Set-Content -Path $excl -Value $content -Encoding ascii

Write-Host "1/5 Build..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "build failed" }

# snapshot the build OUTSIDE the repo before switching branches
$tmp = Join-Path $env:TEMP "goals-101-deploy"
if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
Copy-Item dist $tmp -Recurse

Write-Host "2/5 Switch to gh-pages..." -ForegroundColor Cyan
git checkout -f gh-pages

Write-Host "3/5 Clean and mirror..." -ForegroundColor Cyan
# remove all files tracked in gh-pages (previous site build)
git ls-tree -r --name-only HEAD | ForEach-Object { Remove-Item -Force $_ -ErrorAction SilentlyContinue }
# remove leftover dirs except .git, node_modules and untracked personal files
Get-ChildItem -Directory | Where-Object { $_.Name -notin @(".git", "node_modules") } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
# place fresh build at root
Copy-Item (Join-Path $tmp "*") -Destination . -Recurse -Force
git add -A

Write-Host "4/5 Commit..." -ForegroundColor Cyan
$dirty = git status -s
if ($dirty) {
  git commit -m ("deploy: " + (Get-Date -Format 'yyyy-MM-dd HH:mm'))
} else {
  Write-Host "no changes, skip commit"
}

Write-Host "5/5 Push + back to main..." -ForegroundColor Cyan
git push origin gh-pages
git push origin main
git checkout -f main
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue

Write-Host "Done. Site updates in 1-2 minutes." -ForegroundColor Green
