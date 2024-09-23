#!/bin/bash

echo "-----OSのライブラリバージョンアップ-----"
sudo apt update
sudo apt upgrade -y

# NVMをインストール
echo "-----nodeのバージョンアップ-----"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

echo ""
echo "-----makeのインストール----"
sudo apt install -y build-essential


echo ""
echo "-----Starryskyのインストール----"

cd /opt
git clone -b preview https://github.com/usounds/StarryskyQueryEngine.git
cd StarryskyQueryEngine

# 作成するファイルのパス
output_file=".env"

# ファイルを初期化
> $output_file

# 対話型で環境変数の値を入力
echo ""

read -p "管理をするBlueskyのハンドルを入力してください: " FEEDGEN_PUBLISHER_IDENTIFIER
echo "FEEDGEN_PUBLISHER_IDENTIFIER='$FEEDGEN_PUBLISHER_IDENTIFIER'" >> $output_file

read -p "クリーンアップジョブを行う間隔(分)を入力してください。Jetstreamを使う場合は1が推奨されます: " FEEDGEN_CRON_INTERVAL
echo "FEEDGEN_CRON_INTERVAL='$FEEDGEN_CRON_INTERVAL'" >> $output_file

read -p "動作させるLinodeのIPアドレスを入力してください: " FEEDGEN_HOSTNAME

# IPアドレスをハイフンで区切る形式に変換
CONVERTED_HOSTNAME=$(echo "$FEEDGEN_HOSTNAME" | tr '.' '-').ip.linodeusercontent.com

# 変換後のホスト名をファイルに書き出す
echo "FEEDGEN_HOSTNAME='$CONVERTED_HOSTNAME'" >> $output_file

echo "変換されたホスト名は $CONVERTED_HOSTNAME です"

read -p "Starrysky Consoleからログインするときに使うWeb Pass Keywordを入力してください: " EDIT_WEB_PASSKEY
echo "EDIT_WEB_PASSKEY='$EDIT_WEB_PASSKEY'" >> $output_file

echo "JETSTEAM_ENDPOINT='wss://jetstream.atproto.tools'" >> $output_file
echo "FEEDGEN_SQLITE_LOCATION='/opt/StarryskyQueryEngineDatabase/db.sqlite'" >> $output_file
echo "FEEDGEN_PORT='3000'" >> $output_file

# 実行完了メッセージ
echo "設定ファイル $output_file が作成されました。"

echo ""
echo "-----ライブラリをインストール中です----"
npm install
npm install -g ts-node

echo ""
echo "-----システムサービスに登録中です----"
cp starrysky.service /etc/systemd/system/
sudo systemctl start starrysky.service
