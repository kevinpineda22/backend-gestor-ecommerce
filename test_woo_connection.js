import dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';

const WC_URL = process.env.WC_URL;
const WC_CONSUMER_KEY = process.env.WC_CONSUMER_KEY;
const WC_CONSUMER_SECRET = process.env.WC_CONSUMER_SECRET;

console.log("Checking credentials...");
console.log("URL:", WC_URL);
console.log("KEY present:", !!WC_CONSUMER_KEY);
console.log("SECRET present:", !!WC_CONSUMER_SECRET);

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
  },
  timeout: 15000,
});

async function test() {
    try {
        console.log("Testing connection request to /products...");
        const res = await wooApi.get("/products", { params: { per_page: 1 } });
        console.log("Success! Status:", res.status);
    } catch (e) {
        console.error("Connection failed!");
        if (e.response) {
            console.error("Status:", e.response.status);
            console.error("Data:", JSON.stringify(e.response.data, null, 2));
        } else {
            console.error("Error:", e.message);
        }
    }
}

test();
