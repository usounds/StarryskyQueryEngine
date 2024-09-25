#!/bin/bash
cd /opt/StarryskyQueryEngine

echo "-----Step 1:Starryskyの最新の資材を取り込みます-----"
git fetch origin
git reset --hard origin/preview
git pull --quiet --rebase origin preview
chmod +x update.sh

echo "-"
echo "-----Step 2:ライブラリをアップデートします-----"
npm install

echo ""
echo "-----Step 3:サービスを再起動します-----"
sudo systemctl stop starrysky.service
sudo systemctl start starrysky.service

echo ""
echo "-----アップデートは以上です。お疲れ様でした----"
