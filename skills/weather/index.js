/**
 * Weather Skill - wttr.in with Open-Meteo Fallback
 */

async function getOpenMeteoWeather(location) {
    console.log(`[DEBUG] Attempting Open-Meteo for: ${location}`);

    // 1. Geocoding
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
    const geoRes = await fetch(geoUrl);
    const geoData = await geoRes.json();

    if (!geoData.results || geoData.results.length === 0) {
        throw new Error(`Could not find coordinates for ${location}`);
    }

    const { latitude, longitude, name, admin1 } = geoData.results[0];

    // 2. Weather
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto`;
    const weatherRes = await fetch(weatherUrl);
    const weatherData = await weatherRes.json();

    const current = weatherData.current_weather;

    return {
        location: `${name}, ${admin1}`,
        temp_C: current.temperature,
        condition: "Weather Code: " + current.weathercode,
        wind: `${current.windspeed} km/h`,
        forecast: weatherData.daily.time.slice(0, 3).map((date, i) => ({
            date,
            max_temp: weatherData.daily.temperature_2m_max[i],
            min_temp: weatherData.daily.temperature_2m_min[i],
            condition: "Code: " + weatherData.daily.weathercode[i]
        }))
    };
}

export async function get_weather({ location }) {
    if (!location) throw new Error("Location is required");

    try {
        // Try Open-Meteo first (more reliable, fast)
        return await getOpenMeteoWeather(location);
    } catch (e) {
        console.warn(`⚠️ Open-Meteo failed, trying wttr.in backup: ${e.message}`);

        const encodedLoc = encodeURIComponent(location).replace(/%20/g, '+');
        const url = `https://wttr.in/${encodedLoc}?format=j1`;

        try {
            console.log(`[DEBUG] Weather Fetch (wttr.in): ${url}`);
            const res = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) AppleWebkit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0' },
                signal: AbortSignal.timeout(3000)
            });
            if (!res.ok) throw new Error(`wttr.in returned ${res.status}`);

            const data = await res.json();
            const current = data.current_condition[0];

            return {
                location: location,
                temp_C: current.temp_C,
                condition: current.weatherDesc[0].value,
                humidity: current.humidity,
                wind: `${current.windspeedKmph} km/h`,
                forecast: data.weather.slice(0, 3).map(day => ({
                    date: day.date,
                    max_temp: day.maxtempC,
                    min_temp: day.mintempC,
                    condition: day.hourly[4].weatherDesc[0].value
                }))
            };
        } catch (fallbackError) {
            return { error: `Failed to fetch weather for ${location} (Both providers failed).`, detail: fallbackError.message };
        }
    }
}
