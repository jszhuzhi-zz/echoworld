#!/bin/bash
# SCF Web Function bootstrap script
# Express app listens on port 9000 (SCF Web Function default port)
export PORT=9000
export DEPLOY_ENV=cloudbase
node index.js
