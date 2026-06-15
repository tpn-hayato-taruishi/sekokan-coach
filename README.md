# 電気工事施工管理技士 過去問演習 (AI解説対応版)

1級・2級 第1次検定の過去問演習ツール。問題3,780問、正答付き2,697問、kakomonn解説1,156問のデータベースに AWS Bedrock Claude による AI チャット解説を組み合わせた学習プラットフォーム。

## 機能

- **ランダム過去問演習**: 級・科目・テーマでフィルタしてランダム出題
- **即時自動採点**: 公式解答PDF由来の正答データで○×即判定
- **公式解説表示**: kakomonn.com から取得した選択肢別評価を埋め込み表示
- **AI チャット解説**: Bedrock Claude が問題コンテキストを理解して自由質問に回答
  - 「正解の理由」「他の選択肢の誤り」「覚え方」「似た問題の傾向」など対話的に深掘り
- **学習カテゴリ表示**: 🔴丸暗記 / 📝問答暗記 / ⚡秒殺テク / 🔵理解必須 を自動分類
- **PDF直接参照**: 問題PDF・解答PDF・kakomonn解説サイトへのワンクリックリンク
- **コスト追跡**: Bedrock 利用料を月額上限管理

## ローカル開発

```bash
# 1. 環境変数を設定
cp .env.local.example .env.local
# .env.local を編集して AWS_ACCESS_KEY_ID と AWS_SECRET_ACCESS_KEY を記入

# 2. 依存インストール
npm install

# 3. データJSONを更新 (元の演習データから)
# ../scripts/parse_sekokan_questions.py を実行後、pptx/施工管理_演習データ.json を
# public/data/quiz.json にコピー

# 4. 開発サーバ起動
npm run dev
# → http://localhost:4000
```

## デプロイ (AWS App Runner)

`terraform/` 配下に Terraform 構成済み (Hackathon repo 由来):
- ECR リポジトリ
- App Runner サービス
- DynamoDB (チャット履歴/コスト追跡)
- IAM ロール (Bedrock InvokeModel権限)
- Budget アラート

```bash
./deploy.sh init    # 初回のみ
./deploy.sh plan
./deploy.sh apply   # AWS リソース作成
./deploy.sh push    # Docker イメージビルド+ECRプッシュ
./deploy.sh deploy  # App Runner 更新
```

## アーキテクチャ

```
ブラウザ (Next.js page)
   ↓ ① /api/chat?messages=...&quizContext={...}
Next.js API Route (app/api/chat/route.ts)
   ↓ ② ConverseStream
Amazon Bedrock (Claude 3 Haiku/Sonnet)
   ↓ ③ stream response
ブラウザ (リアルタイム表示)

データソース:
- public/data/quiz.json — 問題本体 (3,780問)
- public/data/施工管理_figures/ — 問題ページ画像 (1,449枚)
- DynamoDB — チャット履歴 + コスト履歴 (デプロイ時)
```

## ファイル構成

```
sekokan_quiz_app/
├── app/
│   ├── page.tsx              ← メイン演習ページ
│   ├── layout.tsx            ← レイアウト
│   └── api/
│       ├── chat/route.ts     ← Bedrock チャット API
│       └── health/route.ts   ← ヘルスチェック
├── components/
│   └── ChatUI.tsx            ← AI チャット UI
├── lib/
│   ├── activity-logger.ts    ← DynamoDB 履歴記録
│   ├── cost-tracker.ts       ← Bedrock 利用料追跡
│   ├── event-emitter.ts      ← 管理画面用イベント
│   └── api.ts                ← API ヘルパー
├── public/data/
│   └── quiz.json             ← 問題データ (parse_sekokan_questions.py 出力)
├── terraform/                ← AWS デプロイ構成
└── Dockerfile                ← App Runner 用イメージ
```

## 親リポジトリ

このアプリは `../scripts/` の Python データパイプラインに依存:
- `parse_sekokan_questions.py` → quiz.json 生成
- `scrape_kakomon_explanations.py` → 解説リンク
- `parse_sekokan_answers.py` → 正答リンク (dobokujira 解答PDF)
- `render_sekokan_pages.py` → ページ画像
