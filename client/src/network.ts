import type {
  ClientMessage,
  Content,
  ServerMessage,
  Snapshot,
} from "./protocol";

export class Connection {
  socket: WebSocket | null = null;
  id = 0;
  content: Content | null = null;
  state: Snapshot | null = null;
  private room = "";
  private pending: { playlist: string; practice: boolean } | null = null;
  private classId = "";
  private stopped = true;
  private attempts = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  onState: (state: Snapshot, welcome: boolean) => void = () => {};
  onStatus: (status: string) => void = () => {};
  onError: (code: string) => void = () => {};
  onQueue: (playlist: string, waiting: number, needed: number) => void =
    () => {};

  queue(playlist: string, classId: string, practice: boolean) {
    this.close();
    this.room = "";
    this.classId = classId;
    this.pending = { playlist, practice };
    this.stopped = false;
    this.attempts = 0;
    sessionStorage.removeItem("warshard.join");
    this.open();
  }
  cancelQueue() {
    this.send({ type: "cancel_queue" });
    this.close();
    this.pending = null;
  }

  join(room: string, classId: string) {
    this.close();
    this.pending = null;
    this.room = room;
    this.classId = classId;
    this.stopped = false;
    this.attempts = 0;
    sessionStorage.setItem("warshard.join", JSON.stringify({ room, classId }));
    this.open();
  }
  private open() {
    if (this.stopped) return;
    this.onStatus(this.attempts ? "RECONNECTING" : "CONNECTING");
    const socket = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
    );
    this.socket = socket;
    let admitted = false;
    socket.onopen = () =>
      this.pending
        ? this.send({
            type: "queue",
            version: 4,
            playlist: this.pending.playlist,
            class_id: this.classId,
            practice: this.pending.practice,
          })
        : this.send({
            type: "join",
            version: 4,
            room: this.room,
            class_id: this.classId,
            resume: sessionStorage.getItem(`warshard.token.${this.room}`),
          });
    socket.onmessage = (event) => {
      if (this.socket !== socket || this.stopped) return;
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        this.onError("invalid_server_message");
        this.close();
        return;
      }
      if (message.type === "welcome") {
        if (message.version !== 4) {
          this.onError("protocol_version");
          this.close();
          return;
        }
        admitted = true;
        this.room = message.room;
        this.pending = null;
        sessionStorage.setItem(
          "warshard.join",
          JSON.stringify({ room: this.room, classId: this.classId }),
        );
        this.attempts = 0;
        this.id = message.id;
        this.content = message.content;
        sessionStorage.setItem(`warshard.token.${this.room}`, message.token);
        this.state = message.state;
        this.onStatus("CONNECTED");
        this.onState(message.state, true);
      } else if (message.type === "state") {
        this.state = message.state;
        this.onState(message.state, false);
      } else if (message.type === "queued") {
        this.onStatus("QUEUED");
        this.onQueue(message.playlist, message.waiting, message.needed);
      } else if (message.type === "cancelled") {
        this.close();
      } else {
        this.onError(message.code);
        if (!admitted) {
          if (
            message.code === "session_expired" &&
            !this.room.startsWith("match-")
          ) {
            sessionStorage.removeItem(`warshard.token.${this.room}`);
            socket.close();
          } else {
            this.stopped = true;
            socket.close();
            this.onStatus("OFFLINE");
          }
        }
        if (message.code === "stale_session") {
          this.stopped = true;
          socket.close();
          this.onStatus("SESSION REPLACED");
        }
      }
    };
    socket.onclose = () => {
      if (this.socket !== socket || this.stopped) return;
      this.onStatus("RECONNECTING");
      this.attempts++;
      if (this.attempts > 8) {
        this.stopped = true;
        this.onError("connection_lost");
        this.onStatus("OFFLINE");
        return;
      }
      this.retry = setTimeout(
        () => this.open(),
        Math.min(1000 * this.attempts, 4000),
      );
    };
    socket.onerror = () => socket.close();
  }
  send(message: ClientMessage): boolean {
    if (
      this.socket?.readyState !== WebSocket.OPEN ||
      this.socket.bufferedAmount > 16_384
    )
      return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }
  close() {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    this.socket?.close();
    this.socket = null;
    this.onStatus("OFFLINE");
  }
}
