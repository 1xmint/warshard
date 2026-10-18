use crate::{Admission, Command, Metrics, Session};
use std::{
    collections::{BTreeMap, HashMap},
    sync::{Arc, atomic::Ordering},
    time::{Duration, Instant},
};
use tokio::sync::{mpsc, watch};
use warshard_sim::*;
pub(crate) async fn run_room(
    name: String,
    mut commands: mpsc::Receiver<Command>,
    states: watch::Sender<Arc<BTreeMap<u32, String>>>,
    content: Arc<Content>,
    metrics: Arc<Metrics>,
) {
    let mut world = World::new((*content).clone());
    let mut sessions: HashMap<String, Session> = HashMap::new();
    let mut next_id = 1;
    let mut timer = tokio::time::interval(Duration::from_millis(u64::from(TICK_MS)));
    timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    tracing::info!(room = name, "match created");
    loop {
        tokio::select! {
            biased;
            _ = timer.tick() => {
                let begin = Instant::now();
                let expired: Vec<_> = sessions.iter().filter(|(_, s)| s.disconnected_at.is_some_and(|tick| world.tick.saturating_sub(tick) >= 600)).map(|(token, s)| (token.clone(), s.id)).collect();
                for (token, id) in expired { sessions.remove(&token); world.remove(id); }
                world.step();
                let snapshots = sessions.values().filter(|s| s.disconnected_at.is_none()).map(|s| (s.id, serde_json::to_string(&ServerMessage::State { state: world.snapshot(s.id) }).unwrap())).collect();
                states.send_replace(Arc::new(snapshots));
                let micros = begin.elapsed().as_micros() as u64;
                metrics.ticks.fetch_add(1, Ordering::Relaxed);
                metrics.max_tick_us.fetch_max(micros, Ordering::Relaxed);
                if micros > 50_000 { metrics.slow_ticks.fetch_add(1, Ordering::Relaxed); tracing::warn!(room = name, micros, "slow match tick"); }
                if sessions.is_empty() && world.tick > 20 { break; }
            },
            command = commands.recv() => {
                let Some(command) = command else { break; };
                match command {
                    Command::Join { class_id, token, reply } => {
                        if let Some(token) = token {
                            if let Some(session) = sessions.get_mut(&token) {
                                session.generation += 1; session.disconnected_at = None;
                                world.connected(session.id, true);
                                let _ = reply.send(Ok(Admission { id: session.id, generation: session.generation, welcome: ServerMessage::Welcome { version: PROTOCOL, id: session.id, token, content: (*content).clone(), state: world.snapshot(session.id) } }));
                            } else { let _ = reply.send(Err("session_expired")); }
                            continue;
                        }
                        if sessions.len() >= 2 { let _ = reply.send(Err("room_full")); continue; }
                        let spawn = (0..2).find(|index| sessions.values().all(|s| s.spawn != *index)).unwrap();
                        let id = next_id; next_id += 1;
                        if let Err(code) = world.add(id, &class_id, spawn, spawn as u8) { let _ = reply.send(Err(code)); continue; }
                        let token = uuid::Uuid::new_v4().to_string();
                        sessions.insert(token.clone(), Session { id, generation: 1, disconnected_at: None, spawn });
                        let _ = reply.send(Ok(Admission { id, generation: 1, welcome: ServerMessage::Welcome { version: PROTOCOL, id, token, content: (*content).clone(), state: world.snapshot(id) } }));
                    },
                    Command::Action { id, generation, message, reply } => {
                        let valid = sessions.values().any(|s| s.id == id && s.generation == generation && s.disconnected_at.is_none());
                        let result = if !valid { Err("stale_session") } else { match message {
                            ClientMessage::Input { seq, dx, dz } => world.input(id, seq, dx, dz),
                            ClientMessage::Cast { slot, target, point } => world.cast(id, slot, target, point),
                            ClientMessage::Ultimate { form } => world.ultimate(id, form.as_deref()),
                            ClientMessage::Join { .. } => Err("already_joined"),
                        } };
                        let _ = reply.send(result);
                    },
                    Command::Leave { id, generation } => {
                        if let Some(s) = sessions.values_mut().find(|s| s.id == id && s.generation == generation) { s.disconnected_at = Some(world.tick); world.connected(id, false); }
                    },
                }
            }
        }
    }
    tracing::info!(room = name, "match retired");
}
