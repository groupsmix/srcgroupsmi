import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    // Load test matching 2x launch traffic estimate
    stages: [
        { duration: '30s', target: 50 }, // Ramp up to 50 users
        { duration: '1m', target: 50 },  // Stay at 50 users
        { duration: '30s', target: 0 },  // Ramp down
    ],
    thresholds: {
        http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
        http_req_failed: ['rate<0.01'],   // Error rate must be less than 1%
    },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:8787';

export default function () {
    // 1. Health check
    let res1 = http.get(`${BASE_URL}/api/health-check`);
    check(res1, { 'health check status is 200': (r) => r.status === 200 });
    sleep(1);

    // 2. Chat endpoint (without auth token, expects 401/403)
    let payload = JSON.stringify({
        messages: [{ role: 'user', content: 'What is GroupsMix?' }]
    });
    let params = { headers: { 'Content-Type': 'application/json' } };
    let res2 = http.post(`${BASE_URL}/api/chat`, payload, params);
    // We expect a 401 since k6 isn't sending a valid JWT
    check(res2, { 'chat rejects unauthenticated': (r) => r.status === 401 });
    sleep(1);

    // 3. Contact notify (Rate limited, expect 200 or 429)
    let contactPayload = JSON.stringify({
        data: { name: 'Load Test', email: 'test@example.com', message: 'Hello from k6' }
    });
    let res3 = http.post(`${BASE_URL}/api/contact-notify`, contactPayload, params);
    check(res3, { 'contact-notify responds': (r) => r.status === 200 || r.status === 429 });
    sleep(1);
}
