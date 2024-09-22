#!/bin/bash

# 作成するファイルのパス
output_file="config.env"

# ファイルを初期化
> $output_file

# 対話型で環境変数の値を入力
read -p "EDIT_WEB_PASSKEYを入力してください: " EDIT_WEB_PASSKEY
echo "EDIT_WEB_PASSKEY='$EDIT_WEB_PASSKEY'" >> $output_file

read -p "FEEDGEN_PUBLISHER_IDENTIFIERを入力してください: " FEEDGEN_PUBLISHER_IDENTIFIER
echo "FEEDGEN_PUBLISHER_IDENTIFIER='$FEEDGEN_PUBLISHER_IDENTIFIER'" >> $output_file

read -p "FEEDGEN_CRON_INTERVALを入力してください: " FEEDGEN_CRON_INTERVAL
echo "FEEDGEN_CRON_INTERVAL='$FEEDGEN_CRON_INTERVAL'" >> $output_file

read -p "JETSTEAM_ENDPOINTを入力してください: " JETSTEAM_ENDPOINT
echo "JETSTEAM_ENDPOINT='$JETSTEAM_ENDPOINT'" >> $output_file

# 実行完了メッセージ
echo "設定ファイル $output_file が作成されました。"
