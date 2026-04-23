async function run() {
  try {
    const res = await fetch('http://localhost:3000/api/awdr/export?sede=00201');
    const text = await res.text();
    const data = JSON.parse(text);
    const rules = data.filter(r => r.title.toLowerCase().includes('autoliqui') || r.cart_condition_type);
    console.log(JSON.stringify(rules, null, 2));
  } catch (e) {
    console.log("Fetch failed", e);
  }
}
run();
