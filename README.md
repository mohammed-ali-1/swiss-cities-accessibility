Steps to run this script:
1. install npm and node
2. get an API key from: https://openrouteservice.org/dev/#/home and export OPEN_ROUTE_SERVICE_API_KEY env variable
3. run the script with: `OPEN_ROUTE_SERVICE_API_KEY=api_key node index.js`
4. the script will output `cityData.json` once it's done
5. for simplicity's sake, copy the content of `cityData.json` into the `index.html` file
6. you can run a local server to serve the website if you have python by running: `python -m http.server` then go to `localhost:8000` to see the website
