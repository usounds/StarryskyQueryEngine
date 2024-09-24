#!/bin/bash

git fetch origin
git stash
git pull --quiet origin preview
git stash pop

sudo systemctl stop starrysky.service
sudo systemctl start starrysky.service
