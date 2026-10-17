use crate::{App, Command, Metrics, Room, room::run_room};
use axum::{
    extract::{
        State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use std::{
    collections::BTreeMap,
    sync::{Arc, atomic::Ordering},
    time::{Duration, Instant},
};
use tokio::sync::{mpsc, oneshot, watch};
use warshard_sim::*;
pub(crate) async fn upgrade(
    State(app): State<App>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    let origin = headers.get("origin").and_then(|o| o.to_str().ok());
    if !origin.is_some_and(|o| app.origins.iter().any(|allowed| allowed == o)) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let Ok(permit) = app.sockets.clone().try_acquire_owned() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    ws.max_message_size(2048)
        .max_frame_size(2048)
        .on_upgrade(move |socket| async move {
            let _permit = permit;
            connection(socket, app).await;
        })
}
async fn send(socket: &mut WebSocket, message: &str, metrics: &Metrics) -> bool {
    let result = tokio::time::timeout(
        Duration::from_secs(1),
        socket.send(Message::Text(message.to_owned().into())),
    )
    .await;
    if matches!(result, Ok(Ok(()))) {
        metrics
            .bytes
            .fetch_add(message.len() as u64, Ordering::Relaxed);
        true
    } else {
        false
    }
}
async fn error(socket: &mut WebSocket, code: &str, metrics: &Metrics) -> bool {
    metrics.rejected.fetch_add(1, Ordering::Relaxed);
    send(
        socket,
        &serde_json::to_string(&ServerMessage::Error { code: code.into() }).unwrap(),
        metrics,
    )
    .await
}
async fn connection(mut socket: WebSocket, app: App) {
    let Ok(Some(Ok(Message::Text(text)))) =
        tokio::time::timeout(Duration::from_secs(5), socket.recv()).await
    else {
        return;
    };
    let Ok(intro) = serde_json::from_str::<ClientMessage>(&text) else {
        error(&mut socket, "join_required", &app.metrics).await;
        return;
    };
    let (version, room, class_id, resume, assigned) = match intro {
        ClientMessage::Join {
            version,
            room,
            class_id,
            resume,
        } => (version, room, class_id, resume, None),
        ClientMessage::Queue {
            version,
            playlist,
            class_id,
            practice,
        } => {
            if version != PROTOCOL {
                error(&mut socket, "protocol_version", &app.metrics).await;
                return;
            }
            if !app.content.classes.contains_key(&class_id) {
                error(&mut socket, "unknown_class", &app.metrics).await;
                return;
            }
            let (ticket, mut assignment, mut status) =
                match crate::queue::QueuePool::enter(&app, &playlist, practice).await {
                    Ok(ticket) => ticket,
                    Err(code) => {
                        error(&mut socket, code, &app.metrics).await;
                        return;
                    }
                };
            let initial = serde_json::to_string(&*status.borrow()).unwrap();
            if !send(&mut socket, &initial, &app.metrics).await {
                app.queue.lock().await.cancel(&ticket);
                return;
            }
            let assigned = loop {
                tokio::select! {
                    biased;
                    result=&mut assignment => { break result.ok(); },
                    changed=status.changed() => { if changed.is_err() {break None;} let message=serde_json::to_string(&*status.borrow_and_update()).unwrap(); if !send(&mut socket,&message,&app.metrics).await {break None;} },
                    message=socket.recv() => {
                        if let Some(Ok(Message::Text(text)))=message && matches!(serde_json::from_str::<ClientMessage>(&text),Ok(ClientMessage::CancelQueue)) { send(&mut socket,&serde_json::to_string(&ServerMessage::Cancelled).unwrap(),&app.metrics).await; }
                        break None;
                    },
                }
            };
            app.queue.lock().await.cancel(&ticket);
            let Some(assigned) = assigned else {
                return;
            };
            (
                version,
                assigned.room,
                class_id,
                None,
                Some(assigned.handle),
            )
        }
        _ => {
            error(&mut socket, "join_required", &app.metrics).await;
            return;
        }
    };
    if version != PROTOCOL {
        error(&mut socket, "protocol_version", &app.metrics).await;
        return;
    }
    if assigned.is_none() && room.starts_with("match-") && resume.is_none() {
        error(&mut socket, "session_expired", &app.metrics).await;
        return;
    }
    if assigned.is_none()
        && !room.starts_with("match-")
        && (room.is_empty()
            || room.len() > 32
            || !room
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'))
    {
        error(&mut socket, "invalid_room", &app.metrics).await;
        return;
    }
    let handle = if let Some(handle) = assigned {
        handle
    } else {
        let mut rooms = app.rooms.lock().await;
        rooms.retain(|_, r| !r.tx.is_closed());
        if let Some(handle) = rooms.get(&room) {
            handle.clone()
        } else {
            if room.starts_with("match-") {
                drop(rooms);
                error(&mut socket, "session_expired", &app.metrics).await;
                return;
            }
            if rooms.len() >= 64 {
                drop(rooms);
                error(&mut socket, "room_capacity", &app.metrics).await;
                return;
            }
            let (tx, rx) = mpsc::channel(256);
            let (states_tx, states) = watch::channel(Arc::new(BTreeMap::new()));
            let handle = Room { tx, states };
            rooms.insert(room.clone(), handle.clone());
            tokio::spawn(run_room(
                room,
                rx,
                states_tx,
                app.content.clone(),
                app.metrics.clone(),
                None,
                false,
            ));
            handle
        }
    };
    let (reply, receive) = oneshot::channel();
    if handle
        .tx
        .try_send(Command::Join {
            class_id,
            token: resume,
            reply,
        })
        .is_err()
    {
        error(&mut socket, "server_busy", &app.metrics).await;
        return;
    }
    let Ok(admission) = receive.await else {
        return;
    };
    let admission = match admission {
        Ok(a) => a,
        Err(code) => {
            error(&mut socket, code, &app.metrics).await;
            return;
        }
    };
    let id = admission.id;
    let generation = admission.generation;
    if !send(
        &mut socket,
        &serde_json::to_string(&admission.welcome).unwrap(),
        &app.metrics,
    )
    .await
    {
        let _ = handle.tx.send(Command::Leave { id, generation }).await;
        return;
    }
    let mut states = handle.states;
    let mut window = Instant::now();
    let mut count = 0;
    let mut last_in = tokio::time::Instant::now();
    loop {
        tokio::select! {
            _ = tokio::time::sleep_until(last_in + Duration::from_secs(15)) => break,
            changed = states.changed() => {
                if changed.is_err() { break; }
                let state = states.borrow_and_update().get(&id).cloned();
                // A newly admitted slot may not exist in the previous published tick.
                if let Some(state) = state
                    && !send(&mut socket, &state, &app.metrics).await { break; }
            },
            message = socket.recv() => {
                let Some(Ok(message)) = message else { break; };
                last_in = tokio::time::Instant::now();
                if window.elapsed() >= Duration::from_secs(1) { window = Instant::now(); count = 0; }
                count += 1;
                if count > 60 { error(&mut socket, "rate_limit", &app.metrics).await; break; }
                match message {
                    Message::Text(text) => {
                        let Ok(message) = serde_json::from_str::<ClientMessage>(&text) else { error(&mut socket, "invalid_message", &app.metrics).await; break; };
                        if matches!(message,ClientMessage::LeaveMatch) {let _=handle.tx.send(Command::Exit{id,generation}).await; break;}
                        let (reply, receive) = oneshot::channel();
                        if handle.tx.try_send(Command::Action { id, generation, message, reply }).is_err() { error(&mut socket, "server_busy", &app.metrics).await; break; }
                        match receive.await {
                            Ok(Ok(())) => {},
                            Ok(Err(code)) => { if !error(&mut socket, code, &app.metrics).await || code == "stale_session" { break; } },
                            Err(_) => break,
                        }
                    },
                    Message::Close(_) => break,
                    Message::Ping(_) | Message::Pong(_) => {},
                    _ => { error(&mut socket, "text_required", &app.metrics).await; break; },
                }
            }
        }
    }
    let _ = handle.tx.send(Command::Leave { id, generation }).await;
}
