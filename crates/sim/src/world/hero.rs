//! Small authoritative extensions for hero combat; no renderer or bot decisions.
use super::*;
impl World {
    pub fn ability_id(&self, id: u32, slot: u8) -> Option<&str> {
        let p = self.players.get(&id)?;
        if slot < 5 {
            self.content
                .forms
                .get(&p.view.form)?
                .abilities
                .get(usize::from(slot))
                .map(String::as_str)
        } else {
            self.content
                .classes
                .get(&p.view.class_id)?
                .utilities
                .get(usize::from(slot - 5))
                .map(String::as_str)
        }
    }
    pub fn charge_count(&self, id: u32, ability: &str) -> u8 {
        self.players
            .get(&id)
            .and_then(|p| p.private.charges.get(ability))
            .map_or(self.content.abilities[ability].charges.max(1), |c| c.count)
    }
    pub fn seed_combat(&mut self, seed: u64) {
        self.rng = seed.max(1);
    }
    pub fn reset_practice(&mut self, difficulty: BotDifficulty) -> Result<(), &'static str> {
        if !self.rules.view.practice || self.rules.config.kind != "arena" {
            return Err("practice_only");
        }
        if self.players.values().filter(|p| !p.view.bot).count() != 1 {
            return Err("practice_only");
        }
        self.rules.view.bot_difficulty = difficulty;
        for stats in self.rules.view.stats.values_mut() {
            stats.damage = 0;
            stats.kills = 0;
            stats.deaths = 0;
        }
        self.start_countdown();
        self.starts_at = self.tick + 20;
        self.rules.view.ends_at = self.starts_at + self.rules.config.time_limit;
        Ok(())
    }
    pub(super) fn emit(
        &mut self,
        source: u32,
        target: Option<u32>,
        ability: &str,
        kind: &str,
        amount: i32,
    ) {
        let pos = target
            .and_then(|id| self.players.get(&id))
            .or_else(|| self.players.get(&source))
            .map_or(Pos::default(), |p| p.view.pos);
        self.events.push_back(CombatEvent {
            id: self.next_event,
            tick: self.tick,
            source,
            target,
            ability: ability.into(),
            kind: kind.into(),
            amount,
            pos,
        });
        self.next_event += 1;
        while self.events.len() > 128 {
            self.events.pop_front();
        }
    }
    pub(super) fn blink_destination(&self, id: u32, distance: i32) -> Pos {
        let p = &self.players[&id].view;
        if p.root_until > self.tick {
            return p.pos;
        }
        let angle = f64::from(p.facing) / 1000.;
        let dx = (angle.sin() * 1000.) as i16;
        let dz = (angle.cos() * 1000.) as i16;
        let mut pos = p.pos;
        for _ in 0..distance / 250 {
            let next = self.content.arena.move_vector(pos, dx, dz, 250);
            // Stop at the first obstruction, never teleport through terrain.
            let expected = Pos {
                x: pos.x + i32::from(dx) * 250 / 1000,
                z: pos.z + i32::from(dz) * 250 / 1000,
            };
            if next != expected {
                break;
            }
            pos = next;
        }
        pos
    }
    pub(super) fn launch(
        &mut self,
        source: u32,
        ability_id: &str,
        a: &Ability,
        target: Option<u32>,
        point: Option<Pos>,
    ) {
        if a.projectile_step > 0 {
            let Some(target) = target else {
                return;
            };
            let Some(t) = self.players.get(&target) else {
                return;
            };
            let from = self.players[&source].view.pos;
            let ticks = ((from.distance_sq(t.view.pos) as f64).sqrt()
                / f64::from(a.projectile_step))
            .ceil() as u32;
            self.projectiles.push(ProjectileView {
                id: self.next_event,
                owner: source,
                target,
                ability: ability_id.into(),
                from,
                to: t.view.pos,
                started: self.tick,
                ends: self.tick + ticks.max(1),
            });
            self.next_event += 1;
        } else {
            self.resolve(source, ability_id, a, target, point);
        }
    }
    pub(super) fn strike(
        &mut self,
        source: u32,
        target: u32,
        ability_id: &str,
        a: &Ability,
        amount: i32,
    ) -> bool {
        if self.players.get(&target).is_none_or(|p| p.view.health <= 0) {
            return false;
        }
        self.rng ^= self.rng << 13;
        self.rng ^= self.rng >> 7;
        self.rng ^= self.rng << 17;
        let p = self.players.get_mut(&source).unwrap();
        let bonus = if p.view.form == "spellstorm" { 15 } else { 0 };
        let critical = a.crit_chance > 0
            && (self.rng % 100 < u64::from(a.crit_chance) + bonus
                || (a.chains && p.private.chain.dry_streak >= 3));
        if a.chains {
            let chain = &mut p.private.chain;
            if critical {
                chain.dry_streak = 0;
                if chain.ready_until <= self.tick {
                    if chain.prepared_until > self.tick {
                        chain.prepared_until = 0;
                        chain.ready_until = self.tick + 200;
                    } else {
                        chain.prepared_until = self.tick + 120;
                    }
                }
            } else {
                chain.dry_streak = chain.dry_streak.saturating_add(1);
                if a.primes_chain
                    && chain.prepared_until <= self.tick
                    && chain.ready_until <= self.tick
                {
                    chain.prepared_until = self.tick + 120;
                }
            }
        }
        let damage = if critical { amount * 3 / 2 } else { amount };
        let before = self.players[&target].view.health + self.players[&target].view.shield;
        self.damage(source, target, damage);
        let after = self.players[&target].view.health + self.players[&target].view.shield;
        self.emit(
            source,
            Some(target),
            ability_id,
            if critical { "crit" } else { "hit" },
            before - after,
        );
        critical
    }
    pub(super) fn hero_tick(&mut self) {
        while self
            .events
            .front()
            .is_some_and(|e| self.tick.saturating_sub(e.tick) > 40)
        {
            self.events.pop_front();
        }
        for p in self.players.values_mut() {
            for (id, charge) in &mut p.private.charges {
                let a = &self.content.abilities[id];
                if charge.next_at > 0 && self.tick >= charge.next_at {
                    charge.count = (charge.count + 1).min(a.charges);
                    charge.next_at = if charge.count < a.charges {
                        charge.next_at + a.cooldown
                    } else {
                        0
                    };
                }
            }
        }
        let mut impacts = vec![];
        self.projectiles.retain(|p| {
            if self.tick >= p.ends {
                impacts.push(p.clone());
                false
            } else {
                true
            }
        });
        if self.phase != Phase::Active {
            self.projectiles.clear();
            return;
        }
        for projectile in impacts {
            let a = self.content.abilities[&projectile.ability].clone();
            if self.players.contains_key(&projectile.owner)
                && self
                    .valid_target(projectile.owner, &a, Some(projectile.target), None)
                    .is_ok()
            {
                self.resolve(
                    projectile.owner,
                    &projectile.ability,
                    &a,
                    Some(projectile.target),
                    None,
                );
            } else {
                self.emit(
                    projectile.owner,
                    Some(projectile.target),
                    &projectile.ability,
                    "fizzle",
                    0,
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn duel() -> World {
        let mut world = World::configured(Content::load().unwrap(), "arena_1", true).unwrap();
        world.add(1, "arcanist", 0, 0).unwrap();
        world.add(2, "briarwarden", 1, 1).unwrap();
        world.players.get_mut(&2).unwrap().view.bot = true;
        for _ in 0..61 {
            world.step();
        }
        world
    }
    fn wait(world: &mut World, ticks: u32) {
        for _ in 0..ticks {
            world.step();
        }
    }
    #[test]
    fn mobile_builder_completes_while_moving_and_shield_preserves_cast_and_gcd() {
        let mut world = duel();
        world
            .content
            .abilities
            .get_mut("cinder_dart")
            .unwrap()
            .crit_chance = 0;
        world.cast(1, 0, Some(2), None).unwrap();
        let started = world.players[&1].cast.as_ref().unwrap().view.started;
        let gcd = world.players[&1].private.gcd_until;
        world.cast(1, 5, None, None).unwrap();
        assert_eq!(
            world.players[&1].cast.as_ref().unwrap().view.started,
            started
        );
        assert_eq!(world.players[&1].private.gcd_until, gcd);
        assert_eq!(world.players[&1].view.shield, 240);
        let origin = world.players[&1].view.pos;
        for seq in 1..=20 {
            world.input(1, seq, 1, 0).unwrap();
            world.step();
        }
        assert!(world.players[&1].view.pos.x > origin.x + 4000);
        wait(&mut world, 20);
        assert!(world.players[&1].private.chain.prepared_until > world.tick);
        assert_eq!(world.players[&1].private.chain.ready_until, 0);
        world.cast(1, 2, Some(2), None).unwrap();
        assert!(world.players[&1].private.chain.ready_until > world.tick);
        wait(&mut world, 16);
        world.cast(1, 3, Some(2), None).unwrap();
        assert!(world.players[&1].cast.is_none());
    }
    #[test]
    fn meteor_locks_position_waits_for_impact_and_checks_teams_range_and_cover() {
        let mut world = duel();
        world
            .content
            .abilities
            .get_mut("crownfall")
            .unwrap()
            .crit_chance = 0;
        world.add(3, "arcanist", 0, 0).unwrap();
        world.add(4, "briarwarden", 1, 1).unwrap();
        world.players.get_mut(&2).unwrap().view.pos = Pos { x: 4000, z: 0 };
        world.players.get_mut(&3).unwrap().view.pos = Pos { x: 4000, z: 0 };
        world.players.get_mut(&4).unwrap().view.pos = Pos { x: 4500, z: 0 };
        world.cast(1, 6, Some(2), None).unwrap();
        wait(&mut world, 14);
        assert!(world.areas.is_empty());
        wait(&mut world, 1);
        let area = world.areas[0].view.clone();
        assert_eq!(area.pos, Pos { x: 4000, z: 0 });
        assert_eq!(area.activates - area.started, 24);
        world.players.get_mut(&2).unwrap().view.pos = Pos { x: 10000, z: 0 };
        let ally = world.players[&3].view.health;
        let enemy = world.players[&4].view.health;
        wait(&mut world, 23);
        assert_eq!(world.players[&4].view.health, enemy);
        wait(&mut world, 1);
        assert_eq!(world.players[&4].view.health, enemy - 240);
        assert_eq!(
            world.players[&2].view.health,
            world.players[&2].view.max_health
        );
        assert_eq!(world.players[&3].view.health, ally);
        wait(&mut world, 1);
        assert!(world.areas.is_empty());
        // A second impact cannot reach an enemy behind intervening cover.
        world
            .content
            .arena
            .obstacles
            .push(crate::content::Obstacle {
                pos: Pos { x: 4250, z: 0 },
                radius: 100,
            });
        world
            .players
            .get_mut(&1)
            .unwrap()
            .private
            .cooldowns
            .remove("crownfall");
        world.players.get_mut(&2).unwrap().view.pos = Pos { x: 4000, z: 0 };
        world.players.get_mut(&4).unwrap().view.pos = Pos { x: 5000, z: 0 };
        let before = world.players[&4].view.health;
        world.cast(1, 6, Some(2), None).unwrap();
        wait(&mut world, 39);
        assert_eq!(world.players[&4].view.health, before);
        world.reset_practice(BotDifficulty::Trained).unwrap_err(); // multi-human practice cannot reset
    }
    #[test]
    fn glasswake_peels_nearby_enemies_and_uses_root_diminishing_returns() {
        let mut world = duel();
        world.players.get_mut(&2).unwrap().view.pos = Pos { x: -3500, z: 0 };
        world.cast(1, 8, None, None).unwrap();
        assert_eq!(world.players[&2].view.root_until - world.tick, 60);
        assert_eq!(world.players[&1].view.root_until, 0);
        wait(&mut world, 60);
        world
            .players
            .get_mut(&1)
            .unwrap()
            .private
            .cooldowns
            .remove("glasswake");
        world.cast(1, 8, None, None).unwrap();
        assert_eq!(world.players[&2].view.root_until - world.tick, 30);
        world
            .players
            .get_mut(&1)
            .unwrap()
            .private
            .cooldowns
            .remove("glasswake");
        wait(&mut world, 30);
        world.players.get_mut(&2).unwrap().view.pos = Pos { x: 0, z: 0 };
        world.cast(1, 8, None, None).unwrap();
        assert!(world.players[&2].view.root_until <= world.tick);
    }
    #[test]
    fn moving_cast_remains_interruptible_and_reset_clears_pending_meteor() {
        let mut world = duel();
        world
            .content
            .classes
            .get_mut("briarwarden")
            .unwrap()
            .utilities = vec!["unweave".into()];
        world.cast(1, 0, Some(2), None).unwrap();
        world.cast(2, 5, Some(1), None).unwrap();
        assert!(world.players[&1].cast.is_none());
        assert!(world.players[&1].private.lockouts["ember"] > world.tick);
        wait(&mut world, 60);
        world.cast(1, 6, Some(2), None).unwrap();
        wait(&mut world, 15);
        assert_eq!(world.areas.len(), 1);
        world.reset_practice(BotDifficulty::Trained).unwrap();
        assert!(world.areas.is_empty());
        assert!(world.players[&1].cast.is_none());
        assert_eq!(
            world.players[&2].view.health,
            world.players[&2].view.max_health
        );
    }
    #[test]
    fn spellstorm_enhances_the_same_kit_and_expires_without_a_stuck_cast() {
        let mut world = duel();
        assert_eq!(world.content.abilities["flare_lance"].cast, 30);
        assert_eq!(world.content.abilities["sunshard"].cast, 90);
        world.players.get_mut(&1).unwrap().private.energy = 100;
        world.ultimate(1, None, Some(2)).unwrap();
        let expires = world.players[&1].view.form_until;
        world.cast(1, 1, Some(2), None).unwrap();
        let cast = world.players[&1].cast.as_ref().unwrap();
        assert_eq!(cast.view.ends - cast.view.started, 15);
        let remaining = expires - world.tick;
        wait(&mut world, remaining);
        assert_eq!(world.players[&1].view.form, "arcanist");
        assert_eq!(world.players[&1].view.form_until, 0);
        assert!(world.players[&1].cast.is_none());
        world.cast(1, 3, Some(2), None).unwrap();
        let cast = world.players[&1].cast.as_ref().unwrap();
        assert_eq!(cast.view.ends - cast.view.started, 90);
    }
    #[test]
    fn two_crits_bank_one_instant_and_projectile_crit_restarts_the_chain() {
        let mut world = duel();
        world
            .content
            .abilities
            .get_mut("sunshard")
            .unwrap()
            .crit_chance = 100;
        world.cast(1, 2, Some(2), None).unwrap();
        assert!(world.players[&1].private.chain.prepared_until > world.tick);
        assert_eq!(world.players[&1].private.chain.ready_until, 0);
        wait(&mut world, 16);
        world.cast(1, 2, Some(2), None).unwrap();
        assert!(world.players[&1].private.chain.ready_until > world.tick);
        assert_eq!(world.charge_count(1, "flashkindle"), 0);
        wait(&mut world, 16);
        assert_eq!(world.cast(1, 2, Some(2), None), Err("cooldown"));
        let health = world.players[&2].view.health;
        world.cast(1, 3, Some(2), None).unwrap();
        assert!(world.players[&1].cast.is_none());
        assert_eq!(world.players[&1].private.chain.ready_until, 0);
        assert_eq!(world.players[&2].view.health, health);
        assert_eq!(world.projectiles.len(), 1);
        wait(&mut world, 20);
        assert!(world.projectiles.is_empty());
        assert_eq!(world.players[&2].view.health, health - 450);
        assert!(world.players[&1].private.chain.prepared_until > world.tick);
        assert!(
            world
                .events
                .iter()
                .any(|e| e.kind == "crit" && e.ability == "sunshard")
        );
    }
    #[test]
    fn invalid_target_preserves_proc_and_charges_recover_sequentially() {
        let mut world = duel();
        world.players.get_mut(&1).unwrap().private.chain.ready_until = world.tick + 100;
        let resource = world.players[&1].private.resource;
        assert_eq!(world.cast(1, 3, Some(999), None), Err("invalid_target"));
        assert!(world.players[&1].private.chain.ready_until > world.tick);
        assert_eq!(world.players[&1].private.resource, resource);
        world.cast(1, 2, Some(2), None).unwrap();
        wait(&mut world, 16);
        world.cast(1, 2, Some(2), None).unwrap();
        wait(&mut world, 184);
        assert_eq!(world.charge_count(1, "flashkindle"), 1);
        wait(&mut world, 200);
        assert_eq!(world.charge_count(1, "flashkindle"), 2);
    }
    #[test]
    fn bad_luck_protection_interrupt_and_movement_cancellation() {
        let mut world = duel();
        world
            .content
            .abilities
            .get_mut("cinder_dart")
            .unwrap()
            .crit_chance = 1;
        world.players.get_mut(&1).unwrap().private.chain.dry_streak = 3;
        world.cast(1, 0, Some(2), None).unwrap();
        wait(&mut world, 40);
        assert!(world.players[&1].private.chain.prepared_until > world.tick);
        world.cast(1, 1, Some(2), None).unwrap();
        world.input(1, 1, 1, 0).unwrap();
        world.step();
        assert!(world.players[&1].cast.is_none());
        // Off-GCD utilities may cancel a deliberate cast, but cannot shorten its GCD.
        wait(&mut world, 16);
        world.cast(1, 1, Some(2), None).unwrap();
        let gcd = world.players[&1].private.gcd_until;
        world.players.get_mut(&2).unwrap().view.class_id = "arcanist".into();
        world.players.get_mut(&2).unwrap().view.form = "arcanist".into();
        world.cast(2, 1, Some(1), None).unwrap();
        world.cast(1, 7, Some(2), None).unwrap();
        assert!(world.players[&1].cast.is_none() && world.players[&2].cast.is_none());
        assert_eq!(world.players[&1].private.gcd_until, gcd);
        assert!(world.players[&2].private.lockouts["ember"] > world.tick);
    }
    #[test]
    fn blink_respects_roots_and_collision_and_reset_clears_combat() {
        let mut world = duel();
        world.players.get_mut(&1).unwrap().view.root_until = world.tick + 10;
        assert_eq!(world.cast(1, 4, None, None), Err("rooted"));
        wait(&mut world, 10);
        let p = world.players.get_mut(&1).unwrap();
        p.view.pos = Pos { x: -4000, z: 4700 };
        p.view.facing = 1570;
        world.cast(1, 4, None, None).unwrap();
        assert!(world.players[&1].view.pos.x < -1500);
        assert!(world.content.arena.walkable(world.players[&1].view.pos));
        // Transformation's activation projectile still requires an exposed target.
        world.players.get_mut(&1).unwrap().view.pos = Pos { x: -5500, z: 0 };
        world.players.get_mut(&1).unwrap().private.energy = 100;
        world.ultimate(1, None, Some(2)).unwrap();
        assert_eq!(world.players[&1].view.form, "spellstorm");
        assert!(world.players[&1].private.chain.ready_until > world.tick);
        world.reset_practice(BotDifficulty::Skilled).unwrap();
        assert_eq!(world.players[&1].view.form, "arcanist");
        assert_eq!(world.players[&1].private.chain.ready_until, 0);
        assert_eq!(world.players[&1].private.energy, 0);
        assert_eq!(world.players[&1].private.resource, 100);
        assert!(world.projectiles.is_empty() && world.events.is_empty());
        assert_eq!(world.rules.view.bot_difficulty, BotDifficulty::Skilled);
        assert_eq!(
            World::new(Content::load().unwrap()).reset_practice(BotDifficulty::Easy),
            Err("practice_only")
        );
    }
    #[test]
    fn two_blink_charges_recover_sequentially_and_damage_has_no_cast_pushback() {
        let mut world = duel();
        world.cast(1, 1, Some(2), None).unwrap();
        let ends = world.players[&1].cast.as_ref().unwrap().view.ends;
        world.damage(2, 1, 40);
        assert_eq!(world.players[&1].cast.as_ref().unwrap().view.ends, ends);
        world.cast(1, 4, None, None).unwrap();
        assert!(world.players[&1].cast.is_none());
        world.cast(1, 4, None, None).unwrap();
        assert_eq!(world.charge_count(1, "riftstep"), 0);
        assert_eq!(world.cast(1, 4, None, None), Err("cooldown"));
        wait(&mut world, 240);
        assert_eq!(world.charge_count(1, "riftstep"), 1);
        wait(&mut world, 240);
        assert_eq!(world.charge_count(1, "riftstep"), 2);
    }
}
