/**
 * Weather Skill - wttr.in (No API Key Required)
 */

export async function get_weather({ location }) {
    if (!location) throw new Error("Location is required");

    // Replace spaces with + for better wttr.in compatibility
    // encodeURIComponent converts space to %20, wttr.in prefers +
    const encodedLoc = encodeURIComponent(location).replace(/%20/g, '+');
    const url = `https://wttr.in/${encodedLoc}?format=j1`;

    console.log(`[DEBUG] Weather Fetch: ${url}`);

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Weather service error: ${res.statusText}`);

        const data = await res.json();
        const current = data.current_condition[0];

        return {
            location: location,
            temp_C: current.temp_C,
            condition: current.weatherDesc[0].value,
            humidity: current.humidity,
            wind: `${current.windspeedKmph} km/h`,
            feels_like: current.FeelsLikeC
        };
    } catch (e) {
        return { error: `Failed to fetch weather for ${location}: ${e.message}` };
    }
}
