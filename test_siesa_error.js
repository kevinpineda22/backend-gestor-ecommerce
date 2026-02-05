import dotenv from 'dotenv';
dotenv.config();

import { getLiveStockForItem } from './services/siesa/siesa.stock.js';

async function test400() {
    const item = "15688";
    const sede = "PV001"; 

    console.log(`Testing stock for Item: ${item} (reported as 400)`);
    
    try {
        const result = await getLiveStockForItem({ item, sede });
        console.log("Result:", result);
    } catch (e) {
        console.error("Error Full:", e);
        if (e.response) {
            console.error("Response Status:", e.response.status);
            console.error("Response Data:", e.response.data);
        }
    }
}

test400();
