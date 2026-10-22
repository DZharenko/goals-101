# Deploy to GitHub Pages. Usage: .\tools\deploy.ps1
# Builds dist/ and mirrors it to the gh-pages branch, then pushes both branches.

$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\.."

Write-Host "1/4 Build..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "build failed" }

Write-Host "2/4 Prepare gh-pages worktree..." -ForegroundColor Cyan
if (Test-Path .deploy-worktree) { git worktree remove --force .deploy-worktree 2>$null }
git worktree add .deploy-worktree gh-pages

Write-Host "3/4 Mirror dist -> gh-pages..." -ForegroundColor Cyan
robocopy dist .deploy-worktree /MIR /XD .git | Out-Null
git -C .deploy-worktree add -A
$dirty = git -C .deploy-worktree status -s
if ($dirty) {
  git -C .deploy-worktree commit -m ("deploy: " + (Get-Date -Format 'yyyy-MM-dd HH:mm'))
} else {
  Write-Host "no changes, skip commit"
}

Write-Host "4/4 Push..." -ForegroundColor Cyan
git push origin main
git push origin gh-pages

git worktree remove .deploy-worktree
Write-Host "Done. Site updates in 1-2 minutes." -ForegroundColor Green
