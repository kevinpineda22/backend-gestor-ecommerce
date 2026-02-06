import wooApi from "./services/woo.service.js";

async function check() {
  try {
    console.log("Checking Tags...");
    const res = await wooApi.get("/products/tags", { params: { per_page: 20 }});
    console.log("Tags:", JSON.stringify(res.data, null, 2));
  } catch (e) {
    console.error(e);
  }
}

check();
