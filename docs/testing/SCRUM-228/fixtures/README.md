# Example domain fixtures — not official API payloads

This folder supplies human-readable data for test planning only. The schema is intentionally not an assumed REST contract. Map these scenarios to the accepted SCRUM-201 DTOs once Hashem publishes the contract.

- `valid-capacity.json`: 10 students and capacity 14.
- `exact-capacity.json`: 14 students and capacity 14.
- `over-capacity.json`: 15 students and capacity 14, which must not produce a valid accepted 15-seat assignment.
- `saved-route-version.json`: snapshot for propose/apply/discard and optimistic version tests.
