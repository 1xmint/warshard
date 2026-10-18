use super::*;

pub struct Rules {
    pub view: MatchView,
    pub config: Playlist,
    pub legacy: bool,
    empty_since: [Option<u32>; 2],
}
impl Rules {
    pub fn legacy(content: &Content) -> Self {
        Self::new(
            content.playlists["arena_1"].clone(),
            "arena_1",
            false,
            true,
            &content.arena,
        )
    }
    fn new(config: Playlist, id: &str, practice: bool, legacy: bool, map: &Arena) -> Self {
        let flags = if config.kind == "ctf" {
            (0..2)
                .map(|team| FlagView {
                    team,
                    home: map.spawns[usize::from(team)],
                    pos: map.spawns[usize::from(team)],
                    carrier: None,
                    dropped_until: 0,
                })
                .collect()
        } else {
            vec![]
        };
        Self {
            view: MatchView {
                playlist: id.into(),
                name: config.name.clone(),
                map: config.map.clone(),
                kind: config.kind.clone(),
                team_size: config.team_size,
                practice,
                bot_difficulty: BotDifficulty::Easy,
                ends_at: 0,
                winner_team: None,
                reason: String::new(),
                scores: vec![0, 0],
                flags,
                stats: BTreeMap::new(),
            },
            config,
            legacy,
            empty_since: [None, None],
        }
    }
}
impl World {
    pub fn configured(
        mut content: Content,
        id: &str,
        practice: bool,
    ) -> Result<Self, &'static str> {
        let config = content
            .playlists
            .get(id)
            .filter(|p| p.enabled)
            .ok_or("playlist_unavailable")?
            .clone();
        content.arena = content.maps[&config.map].clone();
        let rules = Rules::new(config, id, practice, false, &content.arena);
        let mut world = Self::new(content);
        world.rules = rules;
        Ok(world)
    }
    pub(super) fn ready(&self) -> bool {
        (0..2).all(|team| {
            self.players
                .values()
                .filter(|p| p.view.team == team && p.view.connected)
                .count()
                >= usize::from(self.rules.config.team_size)
        })
    }
    pub fn mobility(&mut self, id: u32, target: Option<u32>) -> Result<(), &'static str> {
        self.actionable(id)?;
        let p = &self.players[&id];
        if p.view.root_until > self.tick {
            return Err("rooted");
        }
        if p.private.mobility_until > self.tick {
            return Err("mobility_cooldown");
        }
        let target = self
            .players
            .get(&target.ok_or("select_target")?)
            .filter(|t| t.view.team != p.view.team && t.view.health > 0)
            .ok_or("invalid_target")?;
        let spec = &self.content.classes[&p.view.class_id].mobility;
        if !self
            .content
            .arena
            .line_of_sight(p.view.pos, target.view.pos)
        {
            return Err("line_of_sight");
        }
        let sign = if spec.retreat { -1 } else { 1 };
        let dx = target.view.pos.x - p.view.pos.x;
        let dz = target.view.pos.z - p.view.pos.z;
        let len = f64::from(dx).hypot(f64::from(dz)).max(1.0);
        let distance = if spec.retreat {
            f64::from(spec.distance)
        } else {
            f64::from(spec.distance).min((len - 1200.0).max(0.0))
        };
        let mut next = p.view.pos;
        for step in 1..=20 {
            let test = Pos {
                x: p.view.pos.x
                    + (f64::from(dx) / len * distance * f64::from(step) / 20.0) as i32 * sign,
                z: p.view.pos.z
                    + (f64::from(dz) / len * distance * f64::from(step) / 20.0) as i32 * sign,
            };
            if !self.content.arena.walkable(test) {
                break;
            }
            next = test;
        }
        if next == p.view.pos {
            return Err("no_path");
        }
        let cooldown = spec.cooldown;
        let p = self.players.get_mut(&id).unwrap();
        p.view.pos = next;
        p.cast = None;
        p.inputs.clear();
        p.private.ack = p.received_seq;
        p.private.mobility_until = self.tick + cooldown;
        Ok(())
    }
    pub(super) fn drop_flags(&mut self, id: u32) {
        for flag in &mut self.rules.view.flags {
            if flag.carrier == Some(id) {
                if let Some(p) = self.players.get(&id) {
                    flag.pos = p.view.pos;
                }
                flag.carrier = None;
                flag.dropped_until = self.tick + 300;
            }
        }
    }
    fn finish(&mut self, winner: Option<u8>, reason: &str) {
        self.phase = Phase::Finished;
        self.starts_at = self.tick + 100;
        self.rules.view.winner_team = winner;
        self.rules.view.reason = reason.into();
        self.winner = winner.and_then(|team| {
            self.players
                .iter()
                .find(|(_, p)| p.view.team == team)
                .map(|(id, _)| *id)
        });
        for p in self.players.values_mut() {
            p.cast = None;
            p.inputs.clear();
        }
        self.areas.clear();
    }
    pub(super) fn step_rules(&mut self) {
        if self.phase == Phase::Waiting && !self.rules.legacy && self.tick >= 400 {
            self.finish(None, "incomplete_roster");
        }
        if self.phase != Phase::Active {
            return;
        }
        if self.rules.config.kind == "arena" {
            let alive: Vec<_> = (0..2)
                .filter(|team| {
                    self.players
                        .values()
                        .any(|p| p.view.team == *team && p.view.health > 0)
                })
                .collect();
            if alive.len() < 2 {
                self.finish(alive.first().copied(), "elimination");
                return;
            }
        } else {
            let respawns: Vec<_> = self
                .players
                .iter()
                .filter(|(_, p)| {
                    p.view.health == 0
                        && p.view.connected
                        && p.view.respawn_at > 0
                        && p.view.respawn_at <= self.tick
                })
                .map(|(id, _)| *id)
                .collect();
            for id in respawns {
                let p = self.players.get_mut(&id).unwrap();
                p.view.health = p.view.max_health;
                p.view.shield = 0;
                p.view.respawn_at = 0;
                p.view.pos = self.content.arena.spawns[usize::from(p.view.team)];
                p.view.root_until = 0;
                p.view.slow_until = 0;
                p.view.form = self.content.classes[&p.view.class_id].base_form.clone();
                p.view.form_until = 0;
                p.private.resource = 100;
                p.private.gcd_until = 0;
                p.private.cooldowns.clear();
                p.private.charges.clear();
                p.private.chain = ChainView::default();
                p.private.lockouts.clear();
                p.root_stage = 0;
                p.root_reset = 0;
            }
            for flag in &mut self.rules.view.flags {
                if let Some(id) = flag.carrier {
                    if let Some(p) = self.players.get(&id) {
                        flag.pos = p.view.pos;
                    }
                } else if flag.dropped_until > 0 && self.tick >= flag.dropped_until {
                    flag.pos = flag.home;
                    flag.dropped_until = 0;
                }
            }
            // Return own dropped flags before evaluating captures; iteration is stable.
            for (id, p) in &self.players {
                if p.view.health <= 0 || !p.view.connected {
                    continue;
                }
                for flag in &mut self.rules.view.flags {
                    if flag.carrier.is_none() && p.view.pos.distance_sq(flag.pos) <= 800_i64.pow(2)
                    {
                        if flag.team == p.view.team && flag.dropped_until > 0 {
                            flag.pos = flag.home;
                            flag.dropped_until = 0;
                            self.rules.view.stats.entry(*id).or_default().returns += 1;
                        } else if flag.team != p.view.team {
                            flag.carrier = Some(*id);
                            flag.dropped_until = 0;
                            flag.pos = p.view.pos;
                        }
                    }
                }
            }
            for team in 0..2_u8 {
                let own_home = &self.rules.view.flags[usize::from(team)];
                let at_home = own_home.carrier.is_none() && own_home.dropped_until == 0;
                let home = own_home.home;
                let enemy = &mut self.rules.view.flags[usize::from(1 - team)];
                if let Some(id) = enemy.carrier {
                    let p = &self.players[&id];
                    if p.view.team == team
                        && at_home
                        && p.view.pos.distance_sq(home) <= 1000_i64.pow(2)
                    {
                        self.rules.view.scores[usize::from(team)] += 1;
                        self.rules.view.stats.entry(id).or_default().captures += 1;
                        enemy.carrier = None;
                        enemy.pos = enemy.home;
                        enemy.dropped_until = 0;
                    }
                }
            }
            if let Some(team) =
                (0..2).find(|team| self.rules.view.scores[*team] >= self.rules.config.capture_limit)
            {
                self.finish(Some(team as u8), "capture_limit");
                return;
            }
        }
        for team in 0..2_u8 {
            if self
                .players
                .values()
                .any(|p| p.view.team == team && p.view.connected)
            {
                self.rules.empty_since[usize::from(team)] = None;
            } else {
                let since = self.rules.empty_since[usize::from(team)].get_or_insert(self.tick);
                if self.tick - *since >= 600 {
                    let opponent_present = self
                        .players
                        .values()
                        .any(|p| p.view.team != team && p.view.connected);
                    self.finish(
                        if opponent_present {
                            Some(1 - team)
                        } else {
                            None
                        },
                        "forfeit",
                    );
                    return;
                }
            }
        }
        if self.tick >= self.rules.view.ends_at {
            let scores = &self.rules.view.scores;
            let winner = if scores[0] == scores[1] {
                None
            } else {
                Some(u8::from(scores[1] > scores[0]))
            };
            self.finish(winner, "time_limit");
        }
    }
}
