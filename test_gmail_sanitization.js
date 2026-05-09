const code = "4/0Aci98E8I_AhZlliRwRM6JGB67t0g9kV_gQz_3O7J9oRmT0ZSxfezNN5mQAbvFx09Wh_HQA&scope=https://www";
const cleanCode = code.split('&')[0].trim();
console.log(`Original: ${code}`);
console.log(`Cleaned:  ${cleanCode}`);

if (cleanCode === "4/0Aci98E8I_AhZlliRwRM6JGB67t0g9kV_gQz_3O7J9oRmT0ZSxfezNN5mQAbvFx09Wh_HQA") {
    console.log("✅ Sanitization works!");
} else {
    console.log("❌ Sanitization failed!");
    process.exit(1);
}
