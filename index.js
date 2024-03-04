
import fetch from "node-fetch";
import util from 'util';
import fs from 'fs';
import process from 'process';

const topCities = [
  "Zurich",
  "Geneva",
  "Basel",
  "Lausanne",
  "Bern",
  "Winterthur",
  "Lucerne",
  "St. Gallen",
  "Lugano",
  "Biel"
];

const cityData = {}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI / 180; // φ, λ in radians
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c; // in meters
  return distance;
}

async function overpassApiQuery(query) {
  const endpoint = 'https://overpass-api.de/api/interpreter';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Request failed', error);
    return null;
  }
}

//get the city area ID in OSM that represents the city
//this is important to only get Swiss cities
//because if we search for Zurich for example, we could get Zurich, Netherlands.
async function getCityAreaId(cityName, countryName = 'Switzerland') {
  const nominatimApi = 'https://nominatim.openstreetmap.org/search';
  const queryParams = new URLSearchParams({
      city: cityName,
      country: countryName,
      format: 'json',
      polygon_geojson: 1
  });

  try {
      const response = await fetch(`${nominatimApi}?${queryParams}`);
      const data = await response.json();

      // Assuming the first result is the desired one
      const cityData = data.find(place => place.osm_type === 'relation');
      if (cityData) {
          // The area ID in Overpass API is 3600000000 + OSM relation ID
          return 3600000000 + parseInt(cityData.osm_id);
      } else {
          throw new Error('City not found');
      }
  } catch (error) {
      console.error('Error fetching area ID:', error);
      throw error;
  }
}

async function start() {
  const cityData = {};

  for (const city of topCities) {
    try {
      const cityAreaId = await getCityAreaId(city);
      const query = `
        [out:json];
        area(${cityAreaId})->.cityArea;
        (
          node["landuse"="residential"](area.cityArea);
          way["landuse"="residential"](area.cityArea);
          relation["landuse"="residential"](area.cityArea);
        );
        out center;
      `;
      const residentialCenters = await overpassApiQuery(query);
      
      if (residentialCenters.elements.length === 0) {
        console.log(`No residential centers found for ${city}`);
        continue;
      }

      const centerLat = residentialCenters.elements[0].center.lat;
      const centerLon = residentialCenters.elements[0].center.lon;
      const nearestAmenities = await findNearestAmenities(centerLat, centerLon);

      if (nearestAmenities.length === 0) {
        console.log(`No amenities found near ${city}`);
        continue;
      }

      // Store each nearest amenity type and its data in cityData
      cityData[city] = {
        residentialCenter: residentialCenters.elements[0].center,
        nearestAmenities: nearestAmenities,
        travelDurations: {}
      };

      // Calculate and store travel times for each amenity type
      for (const amenity of nearestAmenities) {
        const { lat, lon } = amenity.amenity;
        console.log(`Getting travel times for city: ${city}, amenity type: ${amenity.type}`);
        const duration = await calculateTravelTimes([centerLon, centerLat], [lon, lat]);
        cityData[city].travelDurations[amenity.type] = duration;
      }
    } catch (error) {
      console.error(`Error processing ${city}:`, error);
      cityData[city] = { error: `Error processing city: ${error.message}` };
    }
  }

  console.log(util.inspect(cityData, { showHidden: false, depth: null }));
  fs.writeFile('cityData.json', JSON.stringify(cityData, null, 2), 'utf8', function (err) {
    if (err) {
        console.log("An error occurred while writing JSON Object to File.");
        return console.log(err);
    }

    console.log("JSON file has been saved.");
  });
}



start()

async function _findNearestAmenities(centroidLat, centroidLon) {
  let nearestAmenities = [];
  const amenitiesTypes = [
    "restaurant",
    "supermarket",
    "hospital",
    "school",
    "bank",
    "pharmacy",
    "parking",
    "fuel",
    "atm",
    "bus_station"
  ];

  for (const amenityType of amenitiesTypes) {
    const query = `
      [out:json];
      node
        ["amenity"="${amenityType}"]
        (around:1000,${centroidLat},${centroidLon});
      out;
    `;

    const amenities = await overpassApiQuery(query);
    let nearestAmenity = null;
    let minDistance = Infinity;

    amenities.elements.forEach(amenity => {
      const distance = calculateDistance(centroidLat, centroidLon, amenity.lat, amenity.lon);
      if (distance < minDistance) {
        nearestAmenity = amenity;
        minDistance = distance;
      }
    });

    if (nearestAmenity) {
      nearestAmenities.push({
        type: amenityType,
        amenity: nearestAmenity
      });
    }
  }
  return nearestAmenities;
}

async function findNearestAmenities(centroidLat, centroidLon) {
  let nearestAmenities = [];
  const amenitiesTypes = [
    "restaurant",
    "supermarket",
    "hospital",
    "school",
    "bank",
    "pharmacy",
    "parking",
    "fuel",
    "atm",
    "bus_station"
  ];

  for (const amenityType of amenitiesTypes) {
    const query = `
      [out:json];
      node
        ["amenity"="${amenityType}"]
        (around:1000,${centroidLat},${centroidLon});
      out;
    `;

    const amenities = await overpassApiQuery(query);
    if (amenities && amenities.elements.length > 0) {
      let nearestAmenity = amenities.elements.reduce((closest, amenity) => {
        const distance = calculateDistance(centroidLat, centroidLon, amenity.lat, amenity.lon);
        return (distance < closest.distance) ? { amenity, distance } : closest;
      }, { amenity: null, distance: Infinity });

      if (nearestAmenity.amenity) {
        nearestAmenities.push({
          type: amenityType,
          amenity: nearestAmenity.amenity,
          distance: nearestAmenity.distance // Optionally include distance
        });
      }
    }
  }
  return nearestAmenities;
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

class RateLimiter {
  constructor(limit, interval) {
    this.limit = limit; // Max number of tokens in the bucket
    this.interval = interval; // Time interval in ms for the rate limit
    this.tokens = limit; // Current number of tokens available
    this.lastCheck = Date.now(); // Last time tokens were checked/added
  }

  async getToken() {
    const now = Date.now();
    const timePassed = now - this.lastCheck;

    // Add tokens based on time passed, up to the limit
    if (timePassed > this.interval) {
      const tokensToAdd = Math.floor(timePassed / this.interval) * this.limit;
      this.tokens = Math.min(this.limit, this.tokens + tokensToAdd);
      this.lastCheck = now;
    }

    if (this.tokens > 0) {
      this.tokens -= 1; // Consume a token
      return true;
    } else {
      const waitForNextToken = this.interval - (now - this.lastCheck);
      await this.delay(waitForNextToken); // Wait for the next token to be available
      return this.getToken(); // Recursively try again
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Create an instance of RateLimiter for 40 requests per minute
const limiter = new RateLimiter(40, 60000 / 40);

async function calculateTravelTimes(startCoordinates, endCoordinates, attempts = 3) {
  const profiles = ['wheelchair', 'cycling-road', 'foot-walking'];
  const travelSummaries = {};

  for (const profile of profiles) {
    const endpoint = `https://api.openrouteservice.org/v2/directions/${profile}`;
    let attempt = 0;
    let success = false;

    while (!success && attempt < attempts) {
      try {
        await limiter.getToken(); // Wait for token before making a request

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': process.env.OPEN_ROUTE_SERVICE_API_KEY,
            'Content-Type': 'application/json; charset=UTF-8',
          },
          body: JSON.stringify({
            "coordinates": [startCoordinates, endCoordinates]
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        travelSummaries[profile] = data.routes[0].summary; // Duration in seconds
        travelSummaries[profile].durationUnit = 'seconds';
        travelSummaries[profile].distanceUnit = 'meters';
        success = true;
      } catch (error) {
        attempt++;
        console.error(`Request failed for profile ${profile}, attempt ${attempt}`, error);
        if (attempt >= attempts) {
          travelSummaries[profile] = null;
          console.error(`All retries failed for profile ${profile}`);
        }
      }
    }
  }

  return travelSummaries;
}

