import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises'
import path from 'node:path'

const [state, reportDirectory] = process.argv.slice(2)
if (!['pending', 'complete', 'failed'].includes(state) || !reportDirectory) {
  throw new Error('使い方: node scripts/coverage-report.mjs <pending|complete|failed> <出力先>')
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character])
const commit = process.env.GITHUB_SHA ?? 'ローカル実行'
const generatedAt = new Date().toISOString()
const runUrl = process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
  ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : undefined
const metrics = ['statements', 'branches', 'functions', 'lines']
const labels = ['C0: Statements', 'C1: Branches', 'Functions', 'Lines']
const formatMetric = ({ covered, total }) => total === 0
  ? '— (0/0)'
  : `${(covered / total * 100).toFixed(2)}% (${covered}/${total})`
let tables = ''

if (state === 'complete') {
  const summary = JSON.parse(await readFile(path.join(reportDirectory, 'coverage-summary.json'), 'utf8'))
  const files = Object.entries(summary).filter(([name]) => name !== 'total')
    .map(([name, value]) => [path.relative(process.cwd(), name).split(path.sep).join('/'), value])
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
  const directories = new Map()
  for (const [name, value] of files) {
    // 割合の平均ではなく、親ディレクトリごとに分子・分母を合計する。
    for (let directory = path.posix.dirname(name); directory !== '.'; directory = path.posix.dirname(directory)) {
      if (!directories.has(directory)) {
        directories.set(directory, Object.fromEntries(metrics.map((metric) => [metric, { covered: 0, total: 0 }])))
      }
      for (const metric of metrics) {
        directories.get(directory)[metric].covered += value[metric].covered
        directories.get(directory)[metric].total += value[metric].total
      }
    }
  }
  const table = (title, rows) => `<h2>${title}</h2><div class="scroll"><table>
    <thead><tr><th>対象</th>${labels.map((label) => `<th>${label}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([name, value]) => `<tr><th>${escapeHtml(name)}</th>${metrics.map((metric) => `<td>${formatMetric(value[metric])}</td>`).join('')}</tr>`).join('\n')}</tbody>
    </table></div>`
  tables = `<p><a href="html/index.html">未カバー箇所を詳細レポートで確認する</a></p>`
    + table('全体', [['全体', summary.total]])
    + table('ディレクトリ別', [...directories].sort(([left], [right]) => left.localeCompare(right, 'en')))
    + table('ファイル別', files)

  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY,
      `## テストカバレッジ\n\n対象コミット: \`${commit}\`\n\n`
      + labels.map((label, index) => `- ${label}: ${formatMetric(summary.total[metrics[index]])}`).join('\n')
      + '\n\nレポートの公開結果は後続のデプロイstepで確認してください。\n')
  }
}

const message = {
  pending: 'このバージョンのカバレッジは計測待ち、または計測中です。完了後にこのページを再読み込みしてください。失敗・中断の状況は実行ログで確認できます。',
  complete: 'デプロイしたコミットのUnit Testを計測した結果です。公開中のアプリを操作した記録ではありません。',
  failed: 'このバージョンのカバレッジ計測、またはレポート生成に失敗しました。アプリのデプロイは完了しています。詳細は実行ログで確認してください。',
}[state]
await mkdir(reportDirectory, { recursive: true })
await writeFile(path.join(reportDirectory, 'index.html'), `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>組子グリッド テストカバレッジ</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:1200px;margin:32px auto;padding:0 20px;color:#202b36}h1{font-size:1.6rem}h2{margin-top:32px;font-size:1.2rem}a{color:#075bab}code{overflow-wrap:anywhere}.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:.9rem}th,td{border:1px solid #ccd3db;padding:8px 12px;text-align:left}thead{background:#edf2f7}td{white-space:nowrap}tbody th{font-weight:400;overflow-wrap:anywhere}p{max-width:900px}</style>
</head><body><h1>組子グリッド テストカバレッジ</h1>
<p>${message}</p><p>対象コミット: <code>${escapeHtml(commit)}</code><br>ページ生成日時（UTC）: ${generatedAt}</p>
${runUrl ? `<p><a href="${escapeHtml(runUrl)}">GitHub Actionsの実行ログ</a></p>` : ''}
<p>C0は文網羅率、C1は分岐網羅率です。括弧内は実行数 / 総数。実行対象がない場合は「—」で表示します。数値はテストの見落としを探す補助指標です。</p>
${tables}</body></html>\n`)
