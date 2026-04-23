import fetch from 'node-fetch';
async function run() {
  const res = await fetch('http://127.0.0.1:3000/api/awdr/export?sede=00201');
  const data = await res.json();
  const rules = data.filter(r => r.title.toLowerCase().includes('autoliqui') || r.cart_condition_type);
  console.log(JSON.stringify(rules, null, 2));
}
run();
