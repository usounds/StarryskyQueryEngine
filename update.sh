#!/bin/bash

git fetch origin
git pull --quiet origin preview

sudo systemctl stop starrysky.service
sudo systemctl start starrysky.service
