#!/bin/bash


read -p "このサーバーのドメインを入力してください: " DOMAIN
read -p "メールアドレスを入力してください: " EMAIL

echo "-----Step 1:OSのライブラリをバージョンアップしています-----"
sudo apt update
sudo apt upgrade -y


echo ""
echo "-----Step 2:nginxをインストールしています-----"
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo yum install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx

echo "Configuring Nginx for domain $DOMAIN..."
sudo tee /etc/nginx/conf.d/$DOMAIN.conf > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files \$uri \$uri/ =404;
    }
}
EOF

sudo certbot --nginx -d $DOMAIN -m $EMAIL --agree-tos

# NVMをインストール
echo ""
echo "-----Step 2:nodeをインストールしています-----"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

echo ""
echo "-----Step 3:makeのインストール中です----"
sudo apt install -y build-essential


echo ""
echo "-----Step 4:Starryskyのインストール中です----"
cd /opt
git clone -b preview https://github.com/usounds/StarryskyQueryEngine.git
cd StarryskyQueryEngine
mkdir -p /opt/StarryskyQueryEngineDatabase/

# 作成するファイルのパス
output_file=".env"

# ファイルを初期化
> $output_file

# 対話型で環境変数の値を入力

echo ""
echo "ここからは対話式でセットアップします"
echo ""

read -p "管理をするBlueskyのハンドルを入力してください: " FEEDGEN_PUBLISHER_IDENTIFIER
echo "FEEDGEN_PUBLISHER_IDENTIFIER='$FEEDGEN_PUBLISHER_IDENTIFIER'" >> $output_file

read -p "クリーンアップジョブを行う間隔(分)を入力してください。Jetstreamを使う場合は1が推奨されます: " FEEDGEN_CRON_INTERVAL
echo "FEEDGEN_CRON_INTERVAL='$FEEDGEN_CRON_INTERVAL'" >> $output_file

read -p "動作させるLinodeのドメイン「だけ」をを入力してください: " FEEDGEN_HOSTNAME
echo "FEEDGEN_HOSTNAME='$FEEDGEN_HOSTNAME'" >> $output_file

read -p "Starrysky Consoleからログインするときに使うWeb Pass Keywordを入力してください: " EDIT_WEB_PASSKEY
echo "EDIT_WEB_PASSKEY='$EDIT_WEB_PASSKEY'" >> $output_file

echo "JETSTEAM_ENDPOINT='wss://jetstream.atproto.tools'" >> $output_file
echo "FEEDGEN_SQLITE_LOCATION='/opt/StarryskyQueryEngineDatabase/db.sqlite'" >> $output_file
echo "FEEDGEN_PORT='3000'" >> $output_file

# 実行完了メッセージ
echo "設定ファイル $output_file が作成されました。"

echo ""
echo "-----Step 5:ライブラリをインストール中です----"
npm install
npm install -g ts-node

echo ""
echo "-----Step 6:システムサービスに登録中です----"
cp starrysky.service /etc/systemd/system/
sudo systemctl start starrysky.service

echo ""
echo "-----Step 7:デフォルトのプロセスを削除します----"
pm2 delete hello

echo ""
echo "-----設定は以上です。お疲れ様でした----"
