export const appFixture = {
  user: { id: "usr_test", name: "Test Learner", email: "learner@example.test", timezone: "Africa/Johannesburg" },
  challenge: { id: "challenge_test", dateKey: "2026-07-12", title: "Investigate a production symptom", topic: "Troubleshooting", difficulty: "Normal" },
};
export function bearerHeaders(token = "test-token") { return { Authorization: `Bearer ${token}`, "X-App-Version": "1.0.0" }; }
