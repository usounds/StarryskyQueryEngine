#!/bin/bash

git fetch origin
git reset --hard origin/preview
git pull --quiet --rebase origin preview

sudo systemctl stop starrysky.service
sudo systemctl start starrysky.service
