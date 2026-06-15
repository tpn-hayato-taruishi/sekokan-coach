#!/usr/bin/env bash
# ============================================================
# 施工管理クイズ デプロイスクリプト
# 使い方: ./deploy.sh [init|plan|apply|push|deploy|destroy]
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TF_DIR="$SCRIPT_DIR/terraform"
AWS_REGION="${AWS_REGION:-ap-northeast-1}"

# --- Helpers ---
info()  { echo -e "\033[1;34m[INFO]\033[0m $*"; }
error() { echo -e "\033[1;31m[ERROR]\033[0m $*" >&2; exit 1; }

get_ecr_url() {
  terraform -chdir="$TF_DIR" output -raw ecr_repository_url 2>/dev/null
}

get_service_arn() {
  terraform -chdir="$TF_DIR" output -raw service_arn 2>/dev/null
}

# --- Commands ---
cmd_init() {
  info "Terraform init..."
  terraform -chdir="$TF_DIR" init
}

cmd_plan() {
  info "Terraform plan..."
  terraform -chdir="$TF_DIR" plan
}

cmd_apply() {
  info "Terraform apply..."
  terraform -chdir="$TF_DIR" apply
}

cmd_prebuild() {
  # 親リポジトリ pptx/ から build context にアセットコピー
  # (Docker build は SCRIPT_DIR を context にするため、親 pptx は見えない)
  local PPTX_SRC="$SCRIPT_DIR/../pptx"
  local PPTX_DST="$SCRIPT_DIR/pptx-assets"
  if [[ ! -d "$PPTX_SRC" ]]; then
    error "親 pptx/ が見つかりません: $PPTX_SRC"
  fi
  info "pptx/ → pptx-assets/ にアセットコピー (HTML + PNG)..."
  rm -rf "$PPTX_DST"
  mkdir -p "$PPTX_DST"
  # HTMLレポート (個別ファイル + 徹底分析ディレクトリ) + 挿絵PNGディレクトリ
  cp "$PPTX_SRC"/*.html "$PPTX_DST"/ 2>/dev/null || true
  cp -r "$PPTX_SRC"/*_出題傾向_徹底分析 "$PPTX_DST"/ 2>/dev/null || true
  cp -r "$PPTX_SRC"/施工管理_figures "$PPTX_DST"/ 2>/dev/null || true
  local SIZE
  SIZE=$(du -sh "$PPTX_DST" 2>/dev/null | cut -f1)
  info "pptx-assets/ コピー完了 (size: $SIZE)"
}

cmd_push() {
  local ECR_URL
  ECR_URL=$(get_ecr_url) || error "Run 'deploy.sh apply' first"
  local ACCOUNT_ID
  ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

  cmd_prebuild

  info "ECR login..."
  aws ecr get-login-password --region "$AWS_REGION" \
    | docker login --username AWS --password-stdin \
      "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

  info "Docker build..."
  docker build -t "${ECR_URL}:latest" "$SCRIPT_DIR"

  info "Docker push..."
  docker push "${ECR_URL}:latest"

  info "Image pushed: ${ECR_URL}:latest"
}

cmd_deploy() {
  cmd_push

  local SERVICE_ARN
  SERVICE_ARN=$(get_service_arn) || error "Run 'deploy.sh apply' first"

  info "Triggering App Runner deployment..."
  aws apprunner start-deployment --service-arn "$SERVICE_ARN" --region "$AWS_REGION"

  local APP_URL
  APP_URL=$(terraform -chdir="$TF_DIR" output -raw app_url 2>/dev/null)
  info "Deployment started! URL: $APP_URL"
}

cmd_destroy() {
  info "Terraform destroy..."
  terraform -chdir="$TF_DIR" destroy
}

cmd_up() {
  info "=== 一括デプロイ開始 ==="
  cmd_init
  cmd_apply
  cmd_push

  local SERVICE_ARN
  SERVICE_ARN=$(get_service_arn) || error "apply failed"

  info "Triggering App Runner deployment..."
  aws apprunner start-deployment --service-arn "$SERVICE_ARN" --region "$AWS_REGION"

  local APP_URL
  APP_URL=$(terraform -chdir="$TF_DIR" output -raw app_url 2>/dev/null)
  info "=== デプロイ完了 ==="
  info "URL: $APP_URL"
}

cmd_down() {
  info "=== 全リソース削除開始 ==="

  # ECRイメージを先に削除（force_delete=trueだが念のため）
  local ECR_URL
  ECR_URL=$(get_ecr_url 2>/dev/null) || true
  if [ -n "$ECR_URL" ]; then
    local REPO_NAME
    REPO_NAME=$(echo "$ECR_URL" | sed 's|.*/||')
    info "ECR イメージ削除中: $REPO_NAME"
    aws ecr batch-delete-image \
      --repository-name "$REPO_NAME" \
      --image-ids "$(aws ecr list-images --repository-name "$REPO_NAME" --query 'imageIds[*]' --output json 2>/dev/null)" \
      --region "$AWS_REGION" 2>/dev/null || true
  fi

  cmd_destroy
  info "=== 全リソース削除完了 ==="
}

# --- Main ---
case "${1:-help}" in
  init)     cmd_init ;;
  plan)     cmd_plan ;;
  apply)    cmd_apply ;;
  prebuild) cmd_prebuild ;;
  push)     cmd_push ;;
  deploy)  cmd_deploy ;;
  destroy) cmd_destroy ;;
  up)      cmd_up ;;
  down)    cmd_down ;;
  *)
    echo "Usage: $0 {init|plan|apply|push|deploy|destroy|up|down}"
    echo ""
    echo "  init    - terraform init"
    echo "  plan    - terraform plan (差分確認)"
    echo "  apply   - terraform apply (インフラ構築)"
    echo "  push    - Docker build & ECR push"
    echo "  deploy  - push + App Runner デプロイ更新"
    echo "  destroy - terraform destroy (全削除)"
    echo ""
    echo "  up      - 一括: init → apply → build → push → deploy"
    echo "  down    - 一括: ECRイメージ削除 → terraform destroy"
    ;;
esac
