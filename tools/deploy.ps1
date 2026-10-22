# Публикация приложения на GitHub Pages.
# Использование: .\tools\deploy.ps1
# Собирает dist/ и зеркалирует его в ветку gh-pages, затем пушит обе ветки.

$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\.."

Write-Host "1/4 Сборка..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "Сборка не удалась" }

Write-Host "2/4 Подготовка ветки gh-pages..." -ForegroundColor Cyan
if (Test-Path .deploy-worktree) { git worktree remove --force .deploy-worktree 2>$null }
git worktree add .deploy-worktree gh-pages

Write-Host "3/4 Копирование dist -> gh-pages..." -ForegroundColor Cyan
robocopy dist .deploy-worktree /MIR /XD .git | Out-Null
git -C .deploy-worktree add -A
$dirty = git -C .deploy-worktree status -s
if ($dirty) {
  git -C .deploy-worktree commit -m "deploy: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
} else {
  Write-Host "Изменений нет — коммит не нужен"
}

Write-Host "4/4 Отправка..." -ForegroundColor Cyan
git push origin main
git push origin gh-pages

git worktree remove .deploy-worktree
Write-Host "Готово. Через 1-2 минуты обновится https://<логин>.github.io/<репозиторий>/" -ForegroundColor Green
