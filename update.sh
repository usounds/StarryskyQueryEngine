#!/bin/bash

git fetch origin
git reset --hard origin/preview
git pull --quiet --rebase origin preview
chmod +x update.sh

npm install
sudo systemctl stop starrysky.service
sudo systemctl start starrysky.service
