# ADR 0001: Pure Rust matches and WebSocket transport

Accepted 2026-10-17 for the first playable slice. Use a synchronous deterministic Rust library with one Tokio owner per room. A TypeScript server reduces language overhead; an ECS adds scheduling. Neither currently outweighs the explicit Rust boundary. This is not a capacity claim.

Use Axum WebSockets, bounded commands and latest-value snapshots. WebTransport offers streams/datagrams and is newly baseline, but adds HTTP/3 operations and older-browser concerns. No rewind yet. Keep transport outside combat so measured network behavior can motivate a later change.

Official sources consulted 2026-10-17:
- [Axum WebSockets](https://docs.rs/axum/latest/axum/extract/ws/index.html): upgrade, limits and socket ownership.
- [Tokio channels](https://tokio.rs/tokio/tutorial/channels): bounded MPSC and watch publication.
- [MDN bufferedAmount](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/bufferedAmount): queued outgoing bytes; client flow control.
- [MDN WebTransport](https://developer.mozilla.org/en-US/docs/Web/API/WebTransport): secure HTTP/3, streams/datagrams, newly available compatibility. Do not describe it as universally unsupported.

Consequences: two languages need executable wire checks; TCP backlog cannot be undone by watch channels. Measure tick time, bytes and buffering before adding replication complexity.
