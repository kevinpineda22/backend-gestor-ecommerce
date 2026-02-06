import dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';

const WC_URL = process.env.WC_URL?.trim().replace(/\/$/, "");
const WC_CONSUMER_KEY = process.env.WC_CONSUMER_KEY?.trim();
const WC_CONSUMER_SECRET = process.env.WC_CONSUMER_SECRET?.trim();

console.log("Checking credentials (IMPROVED)...");
console.log("URL:", WC_URL);
// Show start/end of key for verification (safe-ish)
console.log("KEY:", WC_CONSUMER_KEY ? `${WC_CONSUMER_KEY.substring(0,5)}...${WC_CONSUMER_KEY.slice(-3)}` : 'MISSING');

if (!WC_URL || !WC_CONSUMER_KEY || !WC_CONSUMER_SECRET) {
    console.error("Missing credentials in .env");
    process.exit(1);
}

const wooApi = axios.create({
  baseURL: `${WC_URL}/wp-json/wc/v3`,
  auth: {
    username: WC_CONSUMER_KEY,
    password: WC_CONSUMER_SECRET,
  },
  headers: {
    "Content-Type": "application/json",
    "User-Agent": "GestorEcommerce-App/1.0"
  },
  timeout: 15000,
});

async function test() {
    try {
        console.log("Testing connection...");
        const res = await wooApi.get("/products", { params: { per_page: 1 } });
        console.log("Success! Status:", res.status);
    } catch (e) {
        console.error("Connection failed!");
        if (e.response) {
            console.error("Status:", e.response.status);
            console.error("Msg:", e.response.data?.message);
        } else {
            console.error("Error:", e.message);
        }
    }
}

test();
