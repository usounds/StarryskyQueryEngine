#!/bin/bash


read -p "このサーバーのドメインを入力してください: " DOMAIN
read -p "メールアドレスを入力してください: " EMAIL
read -p "管理をするBlueskyのハンドルを入力してください: " FEEDGEN_PUBLISHER_IDENTIFIER
read -p "Starrysky Consoleからログインするときに使うWeb Pass Keywordを入力してください: " EDIT_WEB_PASSKEY

echo "-----Step 1:OSのライブラリをバージョンアップしています-----"
sudo apt update
sudo apt upgrade -y


echo ""
echo "-----Step 2:nginxをインストールしています-----"
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo apt install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx

sudo tee /etc/nginx/sites-available/$DOMAIN > /dev/null <<EOF
server {
    server_name    $DOMAIN www.$DOMAIN;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
server {
    server_name     $DOMAIN www.$DOMAIN;
    listen 80;
}
EOF

sudo ln -s /etc/nginx/sites-available/.$DOMAIN /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
sudo systemctl restart nginx

echo ""
echo "-----Step 3:証明書を設定しています-----"
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d $DOMAIN -m $EMAIL --agree-tos
(crontab -l 2>/dev/null; echo "0 1 * * * /usr/bin/certbot renew >> /var/log/certbot-renew.log 2>&1") | crontab -

# NVMをインストール
echo ""
echo "-----Step 4:nodeをインストールしています-----"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs


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

echo "FEEDGEN_PUBLISHER_IDENTIFIER='$FEEDGEN_PUBLISHER_IDENTIFIER'" >> $output_file
echo "FEEDGEN_HOSTNAME='$DOMAIN'" >> $output_file
echo "EDIT_WEB_PASSKEY='$EDIT_WEB_PASSKEY'" >> $output_file
echo "JETSTEAM_ENDPOINT='wss://jetstream.atproto.tools'" >> $output_file
echo "FEEDGEN_SQLITE_LOCATION='/opt/StarryskyQueryEngineDatabase/db.sqlite'" >> $output_file
echo "FEEDGEN_PORT='3000'" >> $output_file
echo "FEEDGEN_CRON_INTERVAL='1'" >> $output_file

# 実行完了メッセージ
echo "設定ファイル $output_file が作成されました。"

echo ""
echo "-----Step 5:ライブラリをインストール中です----"
sudo apt install -y build-essential

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
