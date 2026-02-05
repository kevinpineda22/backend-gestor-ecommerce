import dotenv from 'dotenv';
dotenv.config();

import { executeSiesaQuery } from './services/siesa/siesa.client.js';

async function testBulk() {
    console.log("Testing Bulk capabilities...");

    // Test 1: Fetch generic page (no params)
    console.log("\n--- Test 1: No Params (All items?) ---");
    try {
        const res = await executeSiesaQuery({
            descripcion: "API_v2_Inventarios_InvFecha",
            // parametros: "f120_id_cia=1" // Try filtering by company only
            parametros: "f120_id_cia=1" 
        });
        console.log(`Result count: ${res.length}`);
        if(res.length > 0) console.log("Sample:", res[0]);
    } catch (e) {
        console.error("Test 1 Failed:", e.message);
        if(e.response) console.log(e.response.data);
    }

    // Test 2: Multiple IDs?
    console.log("\n--- Test 2: Multiple IDs (Comma separated) ---");
    try {
        const res = await executeSiesaQuery({
            descripcion: "API_v2_Inventarios_InvFecha",
            parametros: "f120_id=16936,11674"
        });
        console.log(`Result count: ${res.length}`);
        console.log("Data:", res);
    } catch (e) {
        console.error("Test 2 Failed:", e.message);
    }

    // Test 3: Multiple IDs (Pipe separated)
    console.log("\n--- Test 3: Multiple IDs (Pipe separated) ---");
    try {
        const res = await executeSiesaQuery({
            descripcion: "API_v2_Inventarios_InvFecha",
            parametros: "f120_id=16936|f120_id=11674" 
        });
        console.log(`Result count: ${res.length}`);
        console.log("Data:", res);
    } catch (e) {
        console.error("Test 3 Failed:", e.message);
    }
}

testBulk();
