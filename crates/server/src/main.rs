mod bots;
mod network;
mod queue;
mod room;
use axum::{Router, extract::State, routing::get};
use network::upgrade;
use std::{
    collections::{BTreeMap, HashMap},
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
};
use tokio::sync::{Mutex, Semaphore, mpsc, oneshot, watch};
use warshard_sim::*;
#[derive(Default)]
struct Metrics {
    ticks: AtomicU64,
    slow_ticks: AtomicU64,
    max_tick_us: AtomicU64,
    bytes: AtomicU64,
    rejected: AtomicU64,
}
#[derive(Clone)]
struct App {
    rooms: Arc<Mutex<HashMap<String, Room>>>,
    content: Arc<Content>,
    metrics: Arc<Metrics>,
    sockets: Arc<Semaphore>,
    origins: Arc<Vec<String>>,
    queue: Arc<Mutex<queue::QueuePool>>,
}
#[derive(Clone)]
struct Room {
    tx: mpsc::Sender<Command>,
    states: watch::Receiver<Arc<BTreeMap<u32, String>>>,
}
struct Session {
    id: u32,
    generation: u32,
    disconnected_at: Option<u32>,
    spawn: usize,
}
struct Admission {
    id: u32,
    generation: u32,
    welcome: ServerMessage,
}
enum Command {
    Join {
        class_id: String,
        token: Option<String>,
        reply: oneshot::Sender<Result<Admission, &'static str>>,
    },
    Action {
        id: u32,
        generation: u32,
        message: ClientMessage,
        reply: oneshot::Sender<Result<(), &'static str>>,
    },
    Leave {
        id: u32,
        generation: u32,
    },
    Exit {
        id: u32,
        generation: u32,
    },
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
    let content = Content::load().expect("valid game definitions");
    let origins = std::env::var("ALLOWED_ORIGINS")
        .unwrap_or_else(|_| "http://localhost:5173,http://127.0.0.1:5173".into())
        .split(',')
        .map(str::to_owned)
        .collect();
    let app = App {
        rooms: Default::default(),
        content: Arc::new(content),
        metrics: Default::default(),
        sockets: Arc::new(Semaphore::new(128)),
        origins: Arc::new(origins),
        queue: Default::default(),
    };
    let router = Router::new()
        .route("/ws", get(upgrade))
        .route("/health", get(|| async { "warshard protocol=3\n" }))
        .route("/metrics", get(metrics))
        .with_state(app);
    let bind = std::env::var("BIND").unwrap_or_else(|_| "127.0.0.1:3001".into());
    let listener = tokio::net::TcpListener::bind(&bind)
        .await
        .expect("bind server");
    println!("Warshard server http://{bind}");
    axum::serve(listener, router)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await
        .expect("serve");
}
async fn metrics(State(app): State<App>) -> String {
    let m = &app.metrics;
    format!(
        "warshard_ticks {}\nwarshard_slow_ticks {}\nwarshard_max_tick_us {}\nwarshard_sent_bytes {}\nwarshard_rejected {}\n",
        m.ticks.load(Ordering::Relaxed),
        m.slow_ticks.load(Ordering::Relaxed),
        m.max_tick_us.load(Ordering::Relaxed),
        m.bytes.load(Ordering::Relaxed),
        m.rejected.load(Ordering::Relaxed)
    )
}
