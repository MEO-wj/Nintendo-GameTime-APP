import autocannon from "autocannon";

const url = process.env.LOAD_TEST_URL ?? "http://localhost:4000/api/sync/status";
const token = process.env.LOAD_TEST_BEARER ?? "";
const connections = Number(process.env.LOAD_TEST_CONNECTIONS ?? 50);
const duration = Number(process.env.LOAD_TEST_DURATION ?? 20);

if (!token) {
  console.error("Please set LOAD_TEST_BEARER before running load test.");
  process.exit(1);
}

const result = await autocannon({
  url,
  connections,
  duration,
  headers: {
    Authorization: `Bearer ${token}`
  }
});

console.log(autocannon.printResult(result));
const p95 = result.latency?.p95 ?? 0;
console.log(`P95 latency: ${p95} ms`);
if (p95 > 300) {
  console.error("P95 exceeded target 300ms");
  process.exit(2);
}
