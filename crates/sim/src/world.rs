use crate::{geometry::Pos, *};
use std::collections::{BTreeMap, VecDeque};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Waiting,
    Countdown,
    Active,
    Finished,
}
impl Phase {
    fn name(self) -> &'static str {
        match self {
            Self::Waiting => "waiting",
            Self::Countdown => "countdown",
            Self::Active => "active",
            Self::Finished => "finished",
        }
    }
}
#[derive(Clone, Debug)]
struct PendingCast {
    view: CastView,
    target: Option<u32>,
    point: Option<Pos>,
}
#[derive(Clone, Debug)]
struct Movement {
    seq: u32,
    dx: i8,
    dz: i8,
    received: u32,
}
#[derive(Clone, Debug)]
pub struct Player {
    pub view: PlayerView,
    private: PrivateView,
    cast: Option<PendingCast>,
    inputs: VecDeque<Movement>,
    received_seq: u32,
    shield_until: u32,
}
#[derive(Clone, Debug)]
struct Area {
    view: AreaView,
    amount: i32,
    next: u32,
    interval: u32,
}

pub struct World {
    pub content: Content,
    pub tick: u32,
    pub phase: Phase,
    pub players: BTreeMap<u32, Player>,
    areas: Vec<Area>,
    next_area: u32,
    round: u32,
    starts_at: u32,
    winner: Option<u32>,
}
impl World {
    pub fn new(content: Content) -> Self {
        Self {
            content,
            tick: 0,
            phase: Phase::Waiting,
            players: BTreeMap::new(),
            areas: vec![],
            next_area: 1,
            round: 0,
            starts_at: 0,
            winner: None,
        }
    }

    pub fn add(&mut self, id: u32, class_id: &str, spawn: usize) -> Result<(), &'static str> {
        if self.players.contains_key(&id) {
            return Err("duplicate_player");
        }
        let class = self.content.classes.get(class_id).ok_or("unknown_class")?;
        let pos = *self
            .content
            .arena
            .spawns
            .get(spawn)
            .ok_or("invalid_spawn")?;
        self.players.insert(
            id,
            Player {
                view: PlayerView {
                    id,
                    class_id: class_id.into(),
                    pos,
                    health: class.health,
                    max_health: class.health,
                    shield: 0,
                    connected: true,
                    form: class.base_form.clone(),
                    form_until: 0,
                    root_until: 0,
                    slow_until: 0,
                    casting: None,
                    private: None,
                },
                private: PrivateView {
                    energy: 0,
                    resource: 100,
                    gcd_until: 0,
                    cooldowns: BTreeMap::new(),
                    ack: 0,
                    lockouts: BTreeMap::new(),
                },
                cast: None,
                inputs: VecDeque::new(),
                received_seq: 0,
                shield_until: 0,
            },
        );
        Ok(())
    }
    pub fn connected(&mut self, id: u32, connected: bool) {
        if let Some(p) = self.players.get_mut(&id) {
            p.view.connected = connected;
            p.inputs.clear();
            p.private.ack = p.received_seq;
            p.cast = None;
        }
    }
    pub fn remove(&mut self, id: u32) {
        self.players.remove(&id);
    }

    pub fn input(&mut self, id: u32, seq: u32, dx: i8, dz: i8) -> Result<(), &'static str> {
        if !(-1..=1).contains(&dx) || !(-1..=1).contains(&dz) {
            return Err("invalid_movement");
        }
        let p = self.players.get_mut(&id).ok_or("unknown_player")?;
        if seq <= p.received_seq {
            return Err("stale_input");
        }
        if p.inputs.len() >= 5 {
            // Movement samples are replaceable; discard old intent, never execute
            // multiple samples in a tick to catch up or grant extra movement.
            p.private.ack = p.inputs.pop_front().unwrap().seq;
        }
        p.received_seq = seq;
        p.inputs.push_back(Movement {
            seq,
            dx,
            dz,
            received: self.tick,
        });
        Ok(())
    }
    fn actionable(&self, id: u32) -> Result<(), &'static str> {
        if self.phase != Phase::Active {
            return Err("round_not_active");
        }
        let p = self.players.get(&id).ok_or("unknown_player")?;
        if p.view.health <= 0 {
            return Err("dead");
        }
        if !p.view.connected {
            return Err("disconnected");
        }
        Ok(())
    }
    fn valid_target(
        &self,
        id: u32,
        a: &Ability,
        target: Option<u32>,
        point: Option<Pos>,
    ) -> Result<(), &'static str> {
        let source = &self.players.get(&id).ok_or("unknown_player")?.view;
        let pos = match a.target {
            TargetKind::Own => source.pos,
            TargetKind::Enemy => {
                let t = self
                    .players
                    .get(&target.ok_or("select_target")?)
                    .ok_or("invalid_target")?;
                if t.view.id == id || t.view.health <= 0 {
                    return Err("invalid_target");
                }
                t.view.pos
            }
            TargetKind::Ground => {
                let p = point.ok_or("select_ground")?;
                if p.x.unsigned_abs() > self.content.arena.half_x as u32
                    || p.z.unsigned_abs() > self.content.arena.half_z as u32
                {
                    return Err("invalid_ground");
                }
                p
            }
        };
        if a.target != TargetKind::Own && source.pos.distance_sq(pos) > i64::from(a.range).pow(2) {
            return Err("out_of_range");
        }
        if !self.content.arena.line_of_sight(source.pos, pos) {
            return Err("line_of_sight");
        }
        Ok(())
    }
    pub fn cast(
        &mut self,
        id: u32,
        slot: u8,
        target: Option<u32>,
        point: Option<Pos>,
    ) -> Result<(), &'static str> {
        self.actionable(id)?;
        let p = &self.players[&id];
        let ability_id = self.content.forms[&p.view.form]
            .abilities
            .get(usize::from(slot))
            .ok_or("invalid_slot")?
            .clone();
        let a = self.content.abilities[&ability_id].clone();
        if p.cast.is_some() {
            return Err("already_casting");
        }
        if p.private.gcd_until > self.tick {
            return Err("global_cooldown");
        }
        if p.private.cooldowns.get(&ability_id).copied().unwrap_or(0) > self.tick {
            return Err("cooldown");
        }
        if p.private.lockouts.get(&a.school).copied().unwrap_or(0) > self.tick {
            return Err("school_locked");
        }
        if p.private.resource < a.cost {
            return Err("resource");
        }
        self.valid_target(id, &a, target, point)?;
        let p = self.players.get_mut(&id).unwrap();
        p.private.resource -= a.cost;
        p.private.gcd_until = self.tick + a.gcd;
        p.private
            .cooldowns
            .insert(ability_id.clone(), self.tick + a.cooldown);
        if a.cast > 0 {
            p.cast = Some(PendingCast {
                view: CastView {
                    ability: ability_id,
                    started: self.tick,
                    ends: self.tick + a.cast,
                },
                target,
                point,
            });
        } else {
            self.resolve(id, &a, target, point);
        }
        Ok(())
    }
    pub fn ultimate(&mut self, id: u32, form: Option<&str>) -> Result<(), &'static str> {
        self.actionable(id)?;
        let p = self.players.get_mut(&id).unwrap();
        let class = &self.content.classes[&p.view.class_id];
        if p.view.form != class.base_form {
            return Err("already_transformed");
        }
        let form = form.unwrap_or(&class.ultimate_forms[0]);
        if !class.ultimate_forms.iter().any(|id| id == form) {
            return Err("invalid_form");
        }
        if p.private.energy < 100 {
            return Err("energy");
        }
        p.private.energy = 0;
        p.cast = None;
        p.view.form = form.into();
        p.view.form_until = self.tick + self.content.forms[&p.view.form].duration;
        Ok(())
    }
    fn damage(&mut self, source: u32, target: u32, amount: i32) {
        let Some(t) = self.players.get_mut(&target) else {
            return;
        };
        if t.view.health <= 0 {
            return;
        }
        let absorb = amount.min(t.view.shield);
        t.view.shield -= absorb;
        let effective = (amount - absorb).min(t.view.health);
        t.view.health -= effective;
        t.private.energy = (t.private.energy + (effective + absorb) / 12).min(100);
        if t.view.health == 0 {
            t.cast = None;
            t.inputs.clear();
        }
        if let Some(s) = self.players.get_mut(&source) {
            s.private.energy = (s.private.energy + (effective + absorb) / 8).min(100);
        }
    }
    fn resolve(&mut self, source: u32, a: &Ability, target: Option<u32>, point: Option<Pos>) {
        let recipient = if a.target == TargetKind::Own {
            source
        } else {
            target.unwrap_or(source)
        };
        for effect in &a.effects {
            match *effect {
                Effect::Damage { amount } => self.damage(source, recipient, amount),
                Effect::Heal { amount } => {
                    let p = self.players.get_mut(&recipient).unwrap();
                    if p.view.health > 0 {
                        let effective = amount.min(p.view.max_health - p.view.health);
                        p.view.health += effective;
                        if let Some(s) = self.players.get_mut(&source) {
                            s.private.energy = (s.private.energy + effective / 8).min(100);
                        }
                    }
                }
                Effect::Shield { amount, duration } => {
                    let p = self.players.get_mut(&recipient).unwrap();
                    p.view.shield = p.view.shield.max(amount);
                    p.shield_until = self.tick + duration;
                }
                Effect::Interrupt { duration } => {
                    let p = self.players.get_mut(&recipient).unwrap();
                    if let Some(cast) = p.cast.take() {
                        p.private.lockouts.insert(
                            self.content.abilities[&cast.view.ability].school.clone(),
                            self.tick + duration,
                        );
                    }
                }
                Effect::Root { duration } => {
                    let p = self.players.get_mut(&recipient).unwrap();
                    p.view.root_until = p.view.root_until.max(self.tick + duration);
                }
                Effect::Slow { duration } => {
                    let p = self.players.get_mut(&recipient).unwrap();
                    p.view.slow_until = p.view.slow_until.max(self.tick + duration);
                }
                Effect::Area {
                    amount,
                    radius,
                    duration,
                    interval,
                } => {
                    self.areas.push(Area {
                        view: AreaView {
                            id: self.next_area,
                            owner: source,
                            pos: point.unwrap(),
                            radius,
                            ends: self.tick + duration,
                        },
                        amount,
                        interval,
                        next: self.tick,
                    });
                    self.next_area += 1;
                }
            }
        }
    }
    fn start_countdown(&mut self) {
        self.phase = Phase::Countdown;
        self.starts_at = self.tick + 60;
        self.winner = None;
        self.areas.clear();
        self.round += 1;
        for (index, p) in self.players.values_mut().enumerate() {
            p.view.health = p.view.max_health;
            p.view.shield = 0;
            p.view.pos = self.content.arena.spawns[index % self.content.arena.spawns.len()];
            p.view.form = self.content.classes[&p.view.class_id].base_form.clone();
            p.view.form_until = 0;
            p.view.root_until = 0;
            p.view.slow_until = 0;
            p.cast = None;
            p.inputs.clear();
            p.private.ack = p.received_seq;
            p.private.energy = 0;
            p.private.resource = 100;
            p.private.gcd_until = 0;
            p.private.cooldowns.clear();
            p.private.lockouts.clear();
        }
    }
    pub fn step(&mut self) {
        self.tick += 1;
        let ready = self.players.len() >= 2 && self.players.values().all(|p| p.view.connected);
        match self.phase {
            Phase::Waiting if ready => self.start_countdown(),
            Phase::Countdown if !ready => self.phase = Phase::Waiting,
            Phase::Countdown if self.tick >= self.starts_at => self.phase = Phase::Active,
            Phase::Finished if self.tick >= self.starts_at => {
                if ready {
                    self.start_countdown();
                } else {
                    self.phase = Phase::Waiting;
                }
            }
            _ => {}
        }
        let active = self.phase == Phase::Active;
        let mut completions = vec![];
        for (id, p) in &mut self.players {
            if p.view.form_until > 0 && self.tick >= p.view.form_until {
                p.view.form = self.content.classes[&p.view.class_id].base_form.clone();
                p.view.form_until = 0;
                p.cast = None;
            }
            if self.tick >= p.shield_until {
                p.view.shield = 0;
            }
            if active && p.view.health > 0 {
                p.private.resource = (p.private.resource + 1).min(100);
                if self.tick.is_multiple_of(20) {
                    p.private.energy = (p.private.energy + 1).min(100);
                }
            }
            while p.inputs.front().is_some_and(|i| self.tick - i.received > 5) {
                p.private.ack = p.inputs.pop_front().unwrap().seq;
            }
            if let Some(input) = p.inputs.pop_front() {
                p.private.ack = input.seq;
                if active && p.view.health > 0 && p.view.connected && self.tick >= p.view.root_until
                {
                    let step = if self.tick < p.view.slow_until {
                        STEP / 2
                    } else {
                        STEP
                    };
                    let next = self
                        .content
                        .arena
                        .move_step(p.view.pos, input.dx, input.dz, step);
                    if next != p.view.pos {
                        p.cast = None;
                    }
                    p.view.pos = next;
                }
            }
            if active
                && p.view.health > 0
                && p.cast.as_ref().is_some_and(|c| self.tick >= c.view.ends)
            {
                completions.push((*id, p.cast.take().unwrap()));
            }
        }
        for (id, cast) in completions {
            let a = self.content.abilities[&cast.view.ability].clone();
            if self.players[&id].view.health > 0
                && self.valid_target(id, &a, cast.target, cast.point).is_ok()
            {
                self.resolve(id, &a, cast.target, cast.point);
            }
        }
        let mut pulses = vec![];
        self.areas.retain(|a| self.tick < a.view.ends && active);
        for area in &mut self.areas {
            if self.tick >= area.next {
                pulses.push(area.clone());
                area.next += area.interval;
            }
        }
        for area in pulses {
            let targets: Vec<_> = self
                .players
                .iter()
                .filter(|(id, p)| {
                    **id != area.view.owner
                        && p.view.pos.distance_sq(area.view.pos)
                            <= i64::from(area.view.radius).pow(2)
                        && self.content.arena.line_of_sight(area.view.pos, p.view.pos)
                })
                .map(|(id, _)| *id)
                .collect();
            for target in targets {
                self.damage(area.view.owner, target, area.amount);
            }
        }
        if active && (self.players.len() < 2 || self.players.values().any(|p| p.view.health <= 0)) {
            self.phase = Phase::Finished;
            self.starts_at = self.tick + 100;
            self.winner = self
                .players
                .iter()
                .find(|(_, p)| p.view.health > 0)
                .map(|(id, _)| *id);
            for p in self.players.values_mut() {
                p.cast = None;
                p.inputs.clear();
            }
            self.areas.clear();
        }
    }
    pub fn snapshot(&self, recipient: u32) -> Snapshot {
        Snapshot {
            tick: self.tick,
            phase: self.phase.name().into(),
            round: self.round,
            starts_at: self.starts_at,
            winner: self.winner,
            players: self
                .players
                .iter()
                .map(|(id, p)| {
                    let mut view = p.view.clone();
                    view.casting = p.cast.as_ref().map(|c| c.view.clone());
                    view.private = if *id == recipient {
                        Some(p.private.clone())
                    } else {
                        None
                    };
                    view
                })
                .collect(),
            areas: self.areas.iter().map(|a| a.view.clone()).collect(),
        }
    }
}

#[cfg(test)]
mod tests;
