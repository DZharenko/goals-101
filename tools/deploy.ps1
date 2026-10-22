# Deploy to GitHub Pages. Usage: .\tools\deploy.ps1
# Builds dist/ and mirrors it to the gh-pages branch, then pushes both branches.
# Note: worktree-free (git worktrees break on non-ASCII repo paths).

$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\.."

# gh-pages: ensure local excludes so git add -A never picks junk
# (root .gitignore is absent on gh-pages branch)
$excl = ".git\info\exclude"
$needed = @("node_modules/", "dist/", "data-*.json", "migration-report.txt", "*.tsbuildinfo", ".deploy-worktree/")
$content = if (Test-Path $excl) { Get-Content $excl } else { @() }
foreach ($n in $needed) { if ($content -notcontains $n) { $content += $n } }
Set-Content -Path $excl -Value $content -Encoding ascii

Write-Host "1/4 Build..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "build failed" }

Write-Host "2/4 Switch to gh-pages..." -ForegroundColor Cyan
git checkout -f gh-pages

Write-Host "3/4 Mirror dist -> gh-pages..." -ForegroundColor Cyan
# remove all files tracked in gh-pages (site files at root)
git ls-tree -r --name-only HEAD | ForEach-Object { Remove-Item -Force $_ -ErrorAction SilentlyContinue }
Get-ChildItem -Directory | Where-Object { $_.Name -notin @(".git", "node_modules", "dist") } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item dist\* -Destination . -Recurse -Force
git add -A
$dirty = git status -s
if ($dirty) {
  git commit -m ("deploy: " + (Get-Date -Format 'yyyy-MM-dd HH:mm'))
} else {
  Write-Host "no changes, skip commit"
}

Write-Host "4/4 Push + back to main..." -ForegroundColor Cyan
git push origin gh-pages
git push origin main
git checkout -f main

Write-Host "Done. Site updates in 1-2 minutes." -ForegroundColor Green
