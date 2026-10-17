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
    pub arena: Arena,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct Class {
    pub name: String,
    pub description: String,
    pub base_form: String,
    pub ultimate_forms: Vec<String>,
    pub health: i32,
    pub color: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct Form {
    pub name: String,
    pub duration: u32,
    pub abilities: Vec<String>,
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
    Area {
        amount: i32,
        radius: i32,
        duration: u32,
        interval: u32,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct Arena {
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
        let content: Self = serde_json::from_str(include_str!("../../../data/game.json"))
            .map_err(|e| e.to_string())?;
        content.validate()?;
        Ok(content)
    }
    pub fn validate(&self) -> Result<(), String> {
        let fail = || "invalid content reference, bounds or timing".to_string();
        if self.version != 1
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
            if class.health <= 0
                || !self.forms.contains_key(&class.base_form)
                || class.ultimate_forms.is_empty()
                || class
                    .ultimate_forms
                    .iter()
                    .any(|id| self.forms.get(id).is_none_or(|form| form.duration == 0))
                || self.forms[&class.base_form].duration != 0
                || class.health > 100_000
            {
                return Err(fail());
            }
        }
        for form in self.forms.values() {
            if form.duration > 72000
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
            if ability.cost < 0
                || ability.cost > 100
                || ability.range < 0
                || ability.range > 100_000
                || ability.effects.is_empty()
                || ability.cooldown == 0
                || ability.gcd == 0
                || ability.cast > 1200
                || ability.cooldown > 72000
                || ability.school.is_empty()
            {
                return Err(fail());
            }
            for effect in &ability.effects {
                let valid = match effect {
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
