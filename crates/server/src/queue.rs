use crate::{App, Room, room::run_room};
use std::{
    collections::{BTreeMap, HashMap},
    sync::Arc,
};
use tokio::sync::{mpsc, oneshot, watch};
use warshard_sim::*;

pub struct Assignment {
    pub room: String,
    pub handle: Room,
}
struct Ticket {
    id: String,
    assignment: oneshot::Sender<Assignment>,
    updates: watch::Sender<ServerMessage>,
}
#[derive(Default)]
pub struct QueuePool {
    waiting: HashMap<String, Vec<Ticket>>,
}
impl QueuePool {
    pub fn cancel(&mut self, id: &str) {
        for (playlist, tickets) in &mut self.waiting {
            tickets.retain(|t| t.id != id && !t.assignment.is_closed());
            Self::notify(playlist, tickets);
        }
    }
    fn notify(playlist: &str, tickets: &[Ticket]) {
        // Capacity is recorded by the initial status and retained in the update.
        for ticket in tickets {
            let needed = match *ticket.updates.borrow() {
                ServerMessage::Queued { needed, .. } => needed,
                _ => 0,
            };
            ticket.updates.send_replace(ServerMessage::Queued {
                playlist: playlist.into(),
                waiting: tickets.len() as u32,
                needed,
            });
        }
    }
    pub async fn enter(
        app: &App,
        playlist: &str,
        practice: bool,
    ) -> Result<
        (
            String,
            oneshot::Receiver<Assignment>,
            watch::Receiver<ServerMessage>,
        ),
        &'static str,
    > {
        let config = app
            .content
            .playlists
            .get(playlist)
            .filter(|p| p.enabled)
            .ok_or("playlist_unavailable")?;
        let needed = u32::from(config.team_size) * 2;
        let id = uuid::Uuid::new_v4().to_string();
        let (tx, rx) = oneshot::channel();
        let (updates, status) = watch::channel(ServerMessage::Queued {
            playlist: playlist.into(),
            waiting: 1,
            needed: if practice { 1 } else { needed },
        });
        let mut queue = app.queue.lock().await;
        for tickets in queue.waiting.values_mut() {
            tickets.retain(|t| !t.assignment.is_closed());
        }
        let count: usize = queue.waiting.values().map(Vec::len).sum();
        if count >= 128 {
            return Err("queue_capacity");
        }
        let tickets = queue.waiting.entry(playlist.into()).or_default();
        tickets.retain(|t| !t.assignment.is_closed());
        if practice {
            let (room, handle) = create_room(app, playlist, true).await?;
            let _ = tx.send(Assignment { room, handle });
        } else {
            tickets.push(Ticket {
                id: id.clone(),
                assignment: tx,
                updates,
            });
            Self::notify(playlist, tickets);
            if tickets.len() >= needed as usize {
                let (room, handle) = match create_room(app, playlist, false).await {
                    Ok(room) => room,
                    Err(code) => {
                        tickets.retain(|t| t.id != id);
                        Self::notify(playlist, tickets);
                        return Err(code);
                    }
                };
                for ticket in tickets.drain(..needed as usize) {
                    let _ = ticket.assignment.send(Assignment {
                        room: room.clone(),
                        handle: handle.clone(),
                    });
                }
                Self::notify(playlist, tickets);
            }
        }
        Ok((id, rx, status))
    }
}
pub async fn create_room(
    app: &App,
    playlist: &str,
    practice: bool,
) -> Result<(String, Room), &'static str> {
    let mut rooms = app.rooms.lock().await;
    rooms.retain(|_, r| !r.tx.is_closed());
    if rooms.len() >= 64 {
        return Err("room_capacity");
    }
    let name = format!("match-{}", uuid::Uuid::new_v4());
    let (tx, rx) = mpsc::channel(256);
    let (states_tx, states) = watch::channel(Arc::new(BTreeMap::new()));
    let room = Room { tx, states };
    rooms.insert(name.clone(), room.clone());
    tokio::spawn(run_room(
        name.clone(),
        rx,
        states_tx,
        app.content.clone(),
        app.metrics.clone(),
        Some(playlist.into()),
        practice,
    ));
    Ok((name, room))
}
