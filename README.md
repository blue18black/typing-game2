# typing-game2

ハロー！プロジェクトのメンバー名タイピングゲーム。

## メンバー情報の自動更新

グループ構成・メンバー構成・名前・ローマ字・アー写・グループ名・グループ写真は、
[ハロー！プロジェクト公式サイト](https://helloproject.com/) から自動で取得している。手作業での更新は不要。

- `.github/workflows/update-members.yml` が毎日 6:00（日本時間）に実行される
- `scripts/update-members.mjs` が公式サイトを読み取り、`data.js` と `images/auto/` を更新する
- 変更があったときだけ自動でコミットされ、GitHub Pages に反映される

すぐに更新したいときは、GitHub の **Actions** タブ →「メンバー情報を自動更新」→ **Run workflow** から手動で実行できる。

手元で実行する場合（Node.js 20 以上）:

```sh
node scripts/update-members.mjs
```

### ローマ字

- 公式サイトのメンバーページにある「よみがな」（例: ノナカ ミキ）から自動で作る
- `si`/`shi`、`tu`/`tsu`、`ja`/`zya` などはどちらで打っても正解になる（`script.js` の `SYMMETRIC_ROMAJI_GROUPS`）
- 自動で作られたローマ字を変えたいときは、`scripts/update-members.mjs` の `ROMAJI_OVERRIDES` に書く
- よみがなが取れなかった場合は、前回のローマ字か URL（例: `miki_nonaka`）から作ったローマ字を使い、Actions のログに ⚠ を出す

### 安全装置

- 公式サイトの構造が変わって読み取れなかった場合や、メンバー数が急に大きく減った場合は、更新せずにエラーで止まる（ゲームは前回のデータのまま動く）
- エラーになると GitHub から通知メールが届くので、その場合は `scripts/update-members.mjs` の読み取り部分を修正する

### 補足

- `data.js` は自動生成ファイルなので、手で編集しても次回の更新で上書きされる
- グループは公式サイトのナビゲーション（Artist）から自動で検出する。新グループは自動で追加される
- ラベルの色は既存グループは `scripts/update-members.mjs` の `KNOWN_GROUPS` で決めていて、新グループは公式サイトのグループカラーを使う
- ハロプロ研修生（北海道を含む）と OG は対象外。対象外の条件は `scripts/update-members.mjs` の `EXCLUDE` で変更できる
- `archive/old-images/` は自動化する前に手動で使っていた画像（保管用。サイトからは使っていない）
