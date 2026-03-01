import fetch from 'node-fetch';
import { logDebug, logDebugError } from '../../core/logger.js';

// --- Node 0: Utility / Data ---
const wmoCodes = {
    0: "Clear sky",
    1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Depositing rime fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    56: "Light freezing drizzle", 57: "Dense freezing drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    66: "Light freezing rain", 67: "Heavy freezing rain",
    71: "Slight snow fall", 73: "Moderate snow fall", 75: "Heavy snow fall",
    77: "Snow grains",
    80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
    85: "Slight snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail"
};

function getCondition(code) {
    return wmoCodes[code] || `Weather Code: ${code}`;
}

// --- Node 1: Geocoding Attempt ---
async function node_geocoding_attempt(location) {
    logDebug(`[DEBUG] Node 1: Geocoding for: ${location}`);
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;

    try {
        const res = await fetch(geoUrl);
        const data = await res.json();
        if (!data.results || data.results.length === 0) throw new Error("No coords found");

        // Success -> Transition to Node 2
        return await node_open_meteo_fetch(data.results[0], location);
    } catch (e) {
        // Failure -> Transition to Node 4 (Fallback)
        logDebug(`[WARN] Node 1 failed: ${e.message}. Switching branch to Node 4.`);
        return await node_fallback_wttr(location);
    }
}

// --- Node 2/3: Open-Meteo Fetch & Format ---
async function node_open_meteo_fetch(geoData, originalLocation) {
    logDebug(`[DEBUG] Node 2: Open-Meteo Weather Fetch`);
    const { latitude, longitude, name, admin1 } = geoData;

    // Updated to request humidity
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto`;

    try {
        const res = await fetch(weatherUrl);
        if (!res.ok) throw new Error("API returned " + res.status);
        const data = await res.json();

        // Node 3 Logic: Formatting
        const current = data.current;
        return {
            location: `${name}, ${admin1 || originalLocation}`,
            provider: "Open-Meteo",
            temp_C: current.temperature_2m,
            condition: getCondition(current.weather_code),
            humidity: `${current.relative_humidity_2m}%`,
            wind: `${current.wind_speed_10m} km/h`,
            forecast: data.daily.time.slice(0, 3).map((date, i) => ({
                date,
                max_temp: data.daily.temperature_2m_max[i],
                min_temp: data.daily.temperature_2m_min[i],
                condition: getCondition(data.daily.weather_code[i])
            }))
        };
    } catch (e) {
        // Failure -> Transition to Node 4
        logDebug(`[WARN] Node 2 failed: ${e.message}. Switching branch to Node 4.`);
        return await node_fallback_wttr(originalLocation);
    }
}

// --- Node 4: Fallback (wttr.in) ---
async function node_fallback_wttr(location) {
    logDebug(`[DEBUG] Node 4: Fallback wttr.in Fetch`);
    const encodedLoc = encodeURIComponent(location).replace(/%20/g, '+');
    const url = `https://wttr.in/${encodedLoc}?format=j1`;

    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) Prometheus-System/2.0' },
            signal: AbortSignal.timeout(3000)
        });
        if (!res.ok) throw new Error(`wttr.in returned ${res.status}`);

        const data = await res.json();
        const current = data.current_condition[0];

        return {
            location: location,
            provider: "wttr.in",
            temp_C: current.temp_C,
            condition: current.weatherDesc[0].value,
            humidity: `${current.humidity}%`,
            wind: `${current.windspeedKmph} km/h`,
            forecast: data.weather.slice(0, 3).map(day => ({
                date: day.date,
                max_temp: day.maxtempC,
                min_temp: day.mintempC,
                condition: day.hourly[4].weatherDesc[0].value // Approx midday condition
            }))
        };
    } catch (e) {
        // Failure -> Terminal Node
        return node_terminal_failure(location, e.message);
    }
}

// --- Node 5: Terminal Failure Analysis ---
function node_terminal_failure(location, lastError) {
    logDebugError(`[ERROR] Node 5: Terminal Failure for ${location}`);
    return {
        error: `System Diagnostic: Both primary (Open-Meteo) and fallback (wttr.in) weather providers failed.`,
        detail: `Last exception: ${lastError}`,
        status: "terminal_node_reached"
    };
}

// --- Entry Point ---
export async function get_weather({ location }) {
    // Apply Default Fallback
    const targetLocation = location || "Charlottetown, Canada";

    // Start Decision Tree at Root Node
    return await node_geocoding_attempt(targetLocation);
}
