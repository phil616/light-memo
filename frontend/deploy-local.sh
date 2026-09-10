export VITE_API_BASE_URL=https://loopback-api.altasci.com
npm run build
sudo rm -rf /opt/1panel/www/sites/loopback.altasci.com/index/*
sudo cp -r ./dist/* /opt/1panel/www/sites/loopback.altasci.com/index/
