#!/bin/bash

git fetch origin
git stash
git pull --quiet origin preview
git stash pop

npm install
sudo systemctl stop starrysky.service
sudo systemctl start starrysky.service
