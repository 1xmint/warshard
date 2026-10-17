use crate::{Content, geometry::Pos};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use ts_rs::TS;

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum ClientMessage {
    Join {
        version: u32,
        room: String,
        class_id: String,
        resume: Option<String>,
    },
    Input {
        seq: u32,
        dx: i8,
        dz: i8,
    },
    Cast {
        slot: u8,
        target: Option<u32>,
        point: Option<Pos>,
    },
    Ultimate {
        form: Option<String>,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    Welcome {
        version: u32,
        id: u32,
        token: String,
        content: Content,
        state: Snapshot,
    },
    State {
        state: Snapshot,
    },
    Error {
        code: String,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct Snapshot {
    pub tick: u32,
    pub phase: String,
    pub round: u32,
    pub starts_at: u32,
    pub winner: Option<u32>,
    pub players: Vec<PlayerView>,
    pub areas: Vec<AreaView>,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct PlayerView {
    pub id: u32,
    pub class_id: String,
    pub pos: Pos,
    pub health: i32,
    pub max_health: i32,
    pub shield: i32,
    pub connected: bool,
    pub form: String,
    pub form_until: u32,
    pub root_until: u32,
    pub slow_until: u32,
    pub casting: Option<CastView>,
    pub private: Option<PrivateView>,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct PrivateView {
    pub energy: i32,
    pub resource: i32,
    pub gcd_until: u32,
    pub cooldowns: BTreeMap<String, u32>,
    pub ack: u32,
    pub lockouts: BTreeMap<String, u32>,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct CastView {
    pub ability: String,
    pub started: u32,
    pub ends: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct AreaView {
    pub id: u32,
    pub owner: u32,
    pub pos: Pos,
    pub radius: i32,
    pub ends: u32,
}
