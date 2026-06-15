#!/bin/bash
set -e

echo "Pushing production branch..."
git push origin production

echo "Deploying to server..."
ssh root@91.98.142.94 "/opt/deploy-openpanel.sh"

echo "Done."
