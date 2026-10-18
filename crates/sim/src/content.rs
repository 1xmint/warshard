use crate::geometry::Pos;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use ts_rs::TS;

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct Content {
    pub version: u32,
    pub classes: BTreeMap<String, Class>,
    pub forms: BTreeMap<String, Form>,
    pub abilities: BTreeMap<String, Ability>,
    #[serde(default)]
    pub arena: Arena,
    pub maps: BTreeMap<String, Arena>,
    pub playlists: BTreeMap<String, Playlist>,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct Class {
    pub name: String,
    pub description: String,
    pub base_form: String,
    pub ultimate_forms: Vec<String>,
    pub health: i32,
    pub color: String,
    pub mobility: Mobility,
    #[serde(default)]
    pub utilities: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct Mobility {
    pub name: String,
    pub distance: i32,
    pub cooldown: u32,
    pub retreat: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct Playlist {
    pub name: String,
    pub map: String,
    pub team_size: u8,
    pub kind: String,
    pub enabled: bool,
    pub time_limit: u32,
    pub capture_limit: u32,
    pub respawn: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct Form {
    pub name: String,
    pub duration: u32,
    pub abilities: Vec<String>,
    #[serde(default)]
    pub activation: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct Ability {
    pub name: String,
    pub description: String,
    pub icon: String,
    pub target: TargetKind,
    pub range: i32,
    pub cast: u32,
    pub cooldown: u32,
    pub cost: i32,
    pub gcd: u32,
    pub school: String,
    pub effects: Vec<Effect>,
    #[serde(default)]
    pub crit_chance: u8,
    #[serde(default)]
    pub chains: bool,
    #[serde(default)]
    pub consumes_chain: bool,
    #[serde(default)]
    pub projectile_step: i32,
    #[serde(default)]
    pub charges: u8,
    #[serde(default)]
    pub cast_while_moving: bool,
    #[serde(default)]
    pub off_gcd: bool,
    #[serde(default)]
    pub primes_chain: bool,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TargetKind {
    Enemy,
    Ground,
    Own,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Effect {
    Splash {
        amount: i32,
        radius: i32,
    },
    BurnArea {
        amount: i32,
        radius: i32,
        duration: u32,
        interval: u32,
        proc_interval: u32,
    },
    Blink {
        distance: i32,
    },
    Damage {
        amount: i32,
    },
    Heal {
        amount: i32,
    },
    Shield {
        amount: i32,
        duration: u32,
    },
    Interrupt {
        duration: u32,
    },
    Root {
        duration: u32,
    },
    Slow {
        duration: u32,
    },
    DelayedArea {
        amount: i32,
        radius: i32,
        delay: u32,
    },
    RootArea {
        radius: i32,
        duration: u32,
    },
    Area {
        amount: i32,
        radius: i32,
        duration: u32,
        interval: u32,
    },
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, TS)]
pub struct Arena {
    pub name: String,
    pub half_x: i32,
    pub half_z: i32,
    pub obstacles: Vec<Obstacle>,
    pub spawns: Vec<Pos>,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct Obstacle {
    pub pos: Pos,
    pub radius: i32,
}

impl Content {
    pub fn load() -> Result<Self, String> {
        let mut content: Self = serde_json::from_str(include_str!("../../../data/game.json"))
            .map_err(|e| e.to_string())?;
        // The active map is derived; maps are authored in only one place.
        content.arena = content
            .maps
            .get("shattered_court")
            .ok_or("missing default map")?
            .clone();
        content.validate()?;
        Ok(content)
    }
    pub fn validate(&self) -> Result<(), String> {
        let fail = || "invalid content reference, bounds or timing".to_string();
        if self.version != 3
            || self.arena.name.is_empty()
            || self.arena.half_x <= 1000
            || self.arena.half_z <= 1000
            || self.arena.half_x > 100_000
            || self.arena.half_z > 100_000
            || self.arena.spawns.len() < 2
            || self.classes.is_empty()
        {
            return Err(fail());
        }
        for class in self.classes.values() {
            if class.utilities.len() > 4
                || class
                    .utilities
                    .iter()
                    .any(|id| !self.abilities.contains_key(id))
            {
                return Err(fail());
            }
            if class.health <= 0
                || !self.forms.contains_key(&class.base_form)
                || class.ultimate_forms.is_empty()
                || class
                    .ultimate_forms
                    .iter()
                    .any(|id| self.forms.get(id).is_none_or(|form| form.duration == 0))
                || self.forms[&class.base_form].duration != 0
                || class.health > 100_000
                || class.mobility.distance <= 0
                || class.mobility.distance > 8000
                || class.mobility.cooldown == 0
            {
                return Err(fail());
            }
        }
        for map in self.maps.values() {
            let mut scoped = self.clone();
            scoped.arena = map.clone();
            scoped.maps.clear();
            scoped.playlists.clear();
            scoped.validate()?;
        }
        for playlist in self.playlists.values() {
            if !self.maps.contains_key(&playlist.map)
                || playlist.team_size == 0
                || playlist.team_size > 40
                || !["arena", "ctf"].contains(&playlist.kind.as_str())
                || playlist.time_limit == 0
                || playlist.time_limit > 72000
                || playlist.respawn == 0
                || playlist.respawn > 1200
                || playlist.capture_limit == 0
                || playlist.capture_limit > 100
            {
                return Err(fail());
            }
        }
        for form in self.forms.values() {
            if form.duration > 72000
                || form.activation.as_ref().is_some_and(|id| {
                    self.abilities.get(id).is_none_or(|a| {
                        a.cast != 0
                            || a.cost != 0
                            || a.charges > 1
                            || a.target == TargetKind::Ground
                    }) || form.duration == 0
                })
                || form.abilities.len() != 5
                || form
                    .abilities
                    .iter()
                    .any(|id| !self.abilities.contains_key(id))
            {
                return Err(fail());
            }
        }
        for ability in self.abilities.values() {
            if ability.crit_chance > 100
                || ability.charges > 3
                || ability.projectile_step < 0
                || ability.projectile_step > 5000
                || (ability.projectile_step > 0 && ability.target != TargetKind::Enemy)
                || (ability.consumes_chain && (!ability.chains || ability.cast == 0))
                || ability.cost < 0
                || ability.cost > 100
                || ability.range < 0
                || ability.range > 100_000
                || ability.effects.is_empty()
                || (ability.off_gcd && ability.cast > 0)
                || (ability.cast_while_moving && ability.cast == 0)
                || (ability.primes_chain && !ability.chains)
                || ability.cooldown == 0
                || (!ability.off_gcd && ability.gcd == 0)
                || ability.cast > 1200
                || ability.cooldown > 72000
                || ability.school.is_empty()
            {
                return Err(fail());
            }
            for effect in &ability.effects {
                let valid = match effect {
                    Effect::Splash { amount, radius } => {
                        *amount > 0
                            && *amount <= 100_000
                            && *radius > 0
                            && *radius <= 10000
                            && ability.target == TargetKind::Enemy
                    }
                    Effect::BurnArea {
                        amount,
                        radius,
                        duration,
                        interval,
                        proc_interval,
                    } => {
                        *amount > 0
                            && *amount <= 100_000
                            && *radius > 0
                            && *radius <= 10000
                            && *duration > 0
                            && *duration <= 72000
                            && *interval > 0
                            && *interval <= *duration
                            && *proc_interval > 0
                            && *proc_interval <= 72000
                            && ability.target == TargetKind::Enemy
                    }
                    Effect::Blink { distance } => {
                        *distance > 0
                            && *distance <= 8000
                            && ability.target == TargetKind::Own
                            && ability.cast == 0
                    }
                    Effect::Damage { amount } | Effect::Heal { amount } => {
                        *amount > 0 && *amount <= 100_000 && ability.target != TargetKind::Ground
                    }
                    Effect::Shield { amount, duration } => {
                        *amount > 0
                            && *amount <= 100_000
                            && *duration > 0
                            && *duration <= 72000
                            && ability.target == TargetKind::Own
                    }
                    Effect::Interrupt { duration }
                    | Effect::Root { duration }
                    | Effect::Slow { duration } => {
                        *duration > 0 && *duration <= 72000 && ability.target == TargetKind::Enemy
                    }
                    Effect::DelayedArea {
                        amount,
                        radius,
                        delay,
                    } => {
                        *amount > 0
                            && *amount <= 100_000
                            && *radius > 0
                            && *radius <= 10000
                            && *delay > 0
                            && *delay <= 1200
                            && ability.target != TargetKind::Own
                    }
                    Effect::RootArea { radius, duration } => {
                        *radius > 0
                            && *radius <= 10000
                            && *duration > 0
                            && *duration <= 72000
                            && ability.target == TargetKind::Own
                    }
                    Effect::Area {
                        amount,
                        radius,
                        duration,
                        interval,
                    } => {
                        *amount > 0
                            && *amount <= 100_000
                            && *radius > 0
                            && *radius <= 10000
                            && *duration > 0
                            && *duration <= 72000
                            && *interval > 0
                            && ability.target == TargetKind::Ground
                    }
                };
                if !valid {
                    return Err(fail());
                }
            }
        }
        for obstacle in &self.arena.obstacles {
            if obstacle.radius <= 0
                || obstacle.radius > 10000
                || obstacle.pos.x.unsigned_abs() > self.arena.half_x as u32
                || obstacle.pos.z.unsigned_abs() > self.arena.half_z as u32
            {
                return Err(fail());
            }
        }
        for spawn in &self.arena.spawns {
            if !self.arena.walkable(*spawn) {
                return Err(fail());
            }
        }
        Ok(())
    }
}
