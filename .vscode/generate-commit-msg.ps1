$diff = git diff --staged
if (-not $diff) {
    Write-Host "Nenhuma alteracao em stage. Use git add antes."
    exit 1
}
$message = $diff | claude -p 'Write a conventional commit message (feat/fix/chore/refactor/test/docs) in English for this diff. Output only the commit message, no explanation, no markdown fences.'
$message | clip
Write-Host "Mensagem copiada: $message"
