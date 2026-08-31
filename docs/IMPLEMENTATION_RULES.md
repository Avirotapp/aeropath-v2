# V2 Implementation Rules

- No frontend direct mutation of authoritative state.
- Every state transition is validated server-side.
- Permissions are enforced server-side.
- Database constraints protect invariants.
- Consequential actions create audit records.
- Notifications are emitted after successful transactions.
- Failed transactions must leave no partial state.
- Each milestone must pass automated tests before the next milestone.
- V1 is not modified during V2 foundation work.
