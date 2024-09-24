#!/bin/bash

# 状態を保存するファイル
STATE_FILE="/opt/setup_state.txt"
# 入力を保存するファイル
INPUT_FILE="/opt/setup_inputs.txt"

# 関数: 状態ファイルにステップの進捗を保存
save_state() {
    echo "$1" > "$STATE_FILE"
}

# 関数: 状態ファイルから進捗を取得
get_state() {
    if [ -f "$STATE_FILE" ]; then
        cat "$STATE_FILE"
    else
        echo "0"
    fi
}

# 関数: 入力データを保存
save_inputs() {
    echo "DOMAIN='$DOMAIN'" > "$INPUT_FILE"
    echo "EMAIL='$EMAIL'" >> "$INPUT_FILE"
    echo "FEEDGEN_PUBLISHER_IDENTIFIER='$FEEDGEN_PUBLISHER_IDENTIFIER'" >> "$INPUT_FILE"
    echo "EDIT_WEB_PASSKEY='$EDIT_WEB_PASSKEY'" >> "$INPUT_FILE"
}

# 関数: 保存された入力データを読み込み
load_inputs() {
    if [ -f "$INPUT_FILE" ]; then
        source "$INPUT_FILE"
    fi
}

# 入力データを確認し、なければ入力を求める
load_inputs
if [ -z "$DOMAIN" ]; then
    read -p "このサーバーのドメインを入力してください: " DOMAIN
fi
if [ -z "$EMAIL" ]; then
    read -p "メールアドレスを入力してください: " EMAIL
fi
if [ -z "$FEEDGEN_PUBLISHER_IDENTIFIER" ]; then
    read -p "管理をするBlueskyのハンドルを入力してください: " FEEDGEN_PUBLISHER_IDENTIFIER
fi
if [ -z "$EDIT_WEB_PASSKEY" ]; then
    read -p "Starrysky Consoleからログインするときに使うWeb Pass Keywordを入力してください: " EDIT_WEB_PASSKEY
fi

# 入力データを保存
save_inputs

# ステップ1: OSのライブラリをアップグレード
if [ "$(get_state)" -lt "1" ]; then
    echo "-----Step 1:OSのライブラリをバージョンアップしています-----"
    sudo apt update
    sudo apt upgrade -y
    save_state 1
fi

# ステップ2: nginxのインストール
if [ "$(get_state)" -lt "2" ]; then
    echo ""
    echo "-----Step 2:nginxをインストールしています-----"
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    sudo apt install -y nginx
    sudo systemctl start nginx
    sudo systemctl enable nginx

    sudo tee /etc/nginx/sites-available/$DOMAIN > /dev/null <<EOF
server {
    server_name    $DOMAIN;

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
    server_name     $DOMAIN;
    listen 80;
}
EOF

    sudo ln -s /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
    sudo rm /etc/nginx/sites-available/default
    save_state 2
fi

# ステップ3: SSL証明書の設定
if [ "$(get_state)" -lt "3" ]; then
    echo ""
    echo "-----Step 3:証明書を設定しています-----"
    sudo apt install -y certbot python3-certbot-nginx
    sudo certbot --nginx -d $DOMAIN -m $EMAIL --agree-tos
    (crontab -l 2>/dev/null; echo "0 1 * * * /usr/bin/certbot renew >> /var/log/certbot-renew.log 2>&1") | crontab -
    sudo systemctl restart nginx
    save_state 3
fi

# ステップ4: Node.jsのインストール
if [ "$(get_state)" -lt "4" ];then
    echo ""
    echo "-----Step 4:nodeをインストールしています-----"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
    save_state 4
fi

# ステップ5: Starryskyのインストール
if [ "$(get_state)" -lt "5" ];then
    echo ""
    echo "-----Step 5:Starryskyのインストールしています-----"
    cd /opt
    git clone -b preview https://github.com/usounds/StarryskyQueryEngine.git
    cd StarryskyQueryEngine
    chmod +x update.sh
    mkdir -p /opt/StarryskyQueryEngineDatabase/

    output_file="/opt/StarryskyQueryEngineDatabase/env"

    # ファイルを初期化して設定を書く
    > $output_file
    echo "FEEDGEN_PUBLISHER_IDENTIFIER='$FEEDGEN_PUBLISHER_IDENTIFIER'" >> $output_file
    echo "FEEDGEN_HOSTNAME='$DOMAIN'" >> $output_file
    echo "EDIT_WEB_PASSKEY='$EDIT_WEB_PASSKEY'" >> $output_file
    echo "JETSTEAM_ENDPOINT='wss://jetstream.atproto.tools'" >> $output_file
    echo "FEEDGEN_SQLITE_LOCATION='/opt/StarryskyQueryEngineDatabase/db.sqlite'" >> $output_file
    echo "FEEDGEN_PORT='3000'" >> $output_file
    echo "FEEDGEN_CRON_INTERVAL='1'" >> $output_file

    echo "設定ファイル $output_file が作成されました。"
    save_state 5
fi

# ステップ6: ライブラリのインストール
if [ "$(get_state)" -lt "6" ]; then
    echo ""
    echo "-----Step 6:ライブラリをインストール中です-----"
    sudo apt install -y build-essential
    npm install
    npm install -g ts-node
    save_state 6
fi

# ステップ7: システムサービスに登録
if [ "$(get_state)" -lt "7" ]; then
    echo ""
    echo "-----Step 7:システムサービスに登録中です-----"
    cp starrysky.service /etc/systemd/system/
    sudo systemctl start starrysky.service
    save_state 7
fi

# 中間ファイルを削除
rm $STATE_FILE
rm $INPUT_FILE

echo ""
echo "-----設定は以上です。お疲れ様でした----"
