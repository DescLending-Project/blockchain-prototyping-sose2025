const fs = require("fs");

const coveragePath = "coverage/coverage-final.json";
const filteredPath = "coverage/coverage-final.filtered.json";

const raw = JSON.parse(fs.readFileSync(coveragePath));
const filtered = Object.fromEntries(
    Object.entries(raw).filter(([key]) => !key.includes("mocks"))
);

fs.writeFileSync(filteredPath, JSON.stringify(filtered, null, 2));
console.log("✅ Filtered mocks from coverage-final.json"); 