#!/bin/bash

# 作成するファイルのパス
output_file=".env"

# ファイルを初期化
> $output_file

# 対話型で環境変数の値を入力

read -p "管理をするBlueskyのハンドルを入力してください: " FEEDGEN_PUBLISHER_IDENTIFIER
echo "FEEDGEN_PUBLISHER_IDENTIFIER='$FEEDGEN_PUBLISHER_IDENTIFIER'" >> $output_file

read -p "クリーンアップジョブを行う間隔(分)を入力してください。Jetstreamを使う場合は1が推奨されます: " FEEDGEN_CRON_INTERVAL
echo "FEEDGEN_CRON_INTERVAL='$FEEDGEN_CRON_INTERVAL'" >> $output_file

read -p "JETSTEAM_ENDPOINTを入力してください: " JETSTEAM_ENDPOINT
echo "JETSTEAM_ENDPOINT='$JETSTEAM_ENDPOINT'" >> $output_file

read -p "動作させるLinodeのIPアドレスを入力してください: " FEEDGEN_HOSTNAME

# IPアドレスをハイフンで区切る形式に変換
CONVERTED_HOSTNAME=$(echo "$FEEDGEN_HOSTNAME" | tr '.' '-').ip.linodeusercontent.com

# 変換後のホスト名をファイルに書き出す
echo "FEEDGEN_HOSTNAME='$CONVERTED_HOSTNAME'" >> $output_file

echo "変換されたホスト名は $CONVERTED_HOSTNAME です"

read -p "Web Pass Keywordを入力してください: " EDIT_WEB_PASSKEY
echo "EDIT_WEB_PASSKEY='$EDIT_WEB_PASSKEY'" >> $output_file



# 実行完了メッセージ
echo "設定ファイル $output_file が作成されました。"
