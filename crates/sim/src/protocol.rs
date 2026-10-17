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
    Queue {
        version: u32,
        playlist: String,
        class_id: String,
        practice: bool,
    },
    CancelQueue,
    Mobility {
        target: Option<u32>,
    },
    LeaveMatch,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    Welcome {
        version: u32,
        id: u32,
        token: String,
        content: Box<Content>,
        state: Snapshot,
        room: String,
    },
    State {
        state: Snapshot,
    },
    Error {
        code: String,
    },
    Queued {
        playlist: String,
        waiting: u32,
        needed: u32,
    },
    Cancelled,
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
    pub match_info: MatchView,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct MatchView {
    pub playlist: String,
    pub name: String,
    pub map: String,
    pub kind: String,
    pub team_size: u8,
    pub practice: bool,
    pub ends_at: u32,
    pub winner_team: Option<u8>,
    pub reason: String,
    pub scores: Vec<u32>,
    pub flags: Vec<FlagView>,
    pub stats: BTreeMap<u32, CombatStats>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, TS)]
pub struct CombatStats {
    pub class_id: String,
    pub team: u8,
    pub bot: bool,
    pub damage: i32,
    pub kills: u32,
    pub deaths: u32,
    pub captures: u32,
    pub returns: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct FlagView {
    pub team: u8,
    pub home: Pos,
    pub pos: Pos,
    pub carrier: Option<u32>,
    pub dropped_until: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct PlayerView {
    pub id: u32,
    pub team: u8,
    pub class_id: String,
    pub pos: Pos,
    pub health: i32,
    pub max_health: i32,
    pub shield: i32,
    pub connected: bool,
    pub bot: bool,
    pub respawn_at: u32,
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
    pub mobility_until: u32,
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
