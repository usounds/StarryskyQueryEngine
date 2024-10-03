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

# ステップ2: caddyのインストール
if [ "$(get_state)" -lt "2" ]; then
    echo ""
    echo "-----Step 2:caddyをインストールしています-----"
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
    sudo apt update
    sudo apt install caddy

    sudo tee /etc/caddy/Caddyfile > /dev/null <<EOF
{
    email $EMAIL
}

$DOMAIN {
    tls {
        on_demand
    }
    reverse_proxy localhost:3000
}
EOF

    sudo systemctl start caddy
    sudo systemctl enable caddy
    save_state 2
fi

# ステップ3:Nodeのインストール
if [ "$(get_state)" -lt "3" ];then
    echo ""
    echo "-----Step 3:nodeをインストールしています-----"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt update
    sudo apt install -y nodejs
    save_state 3
fi

# ステップ4: yarnのインストール
if [ "$(get_state)" -lt "4" ];then
    echo ""
    echo "-----Step 4:yarnをインストールしています-----"
    curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -
    echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list
    sudo apt update
    sudo apt install -y yarn
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
    yarn install
    yarn audit --fix
    save_state 6
fi

# ステップ7: システムサービスに登録
if [ "$(get_state)" -lt "7" ]; then
    echo ""
    echo "-----Step 7:システムサービスに登録中です-----"
    cp starrysky.service /etc/systemd/system/
    sudo systemctl start starrysky.service
    sudo systemctl enable starrysky.service
    save_state 7
fi

# 中間ファイルを削除
rm $STATE_FILE
rm $INPUT_FILE

echo ""
echo "-----設定は以上です。お疲れ様でした----"
