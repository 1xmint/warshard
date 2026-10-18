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
        let bonus = self.content.forms[&p.view.form].crit_bonus;
        let critical = a.crit_chance > 0
            && (self.rng % 100 < u64::from(a.crit_chance) + u64::from(bonus)
                || ((a.chains || a.crit_embers) && p.private.chain.dry_streak >= 3));
        p.private.embers = p
            .private
            .embers
            .saturating_add(a.ember_gain + u8::from(critical && a.crit_embers))
            .min(3);
        if a.crit_embers && !a.chains {
            if critical {
                p.private.chain.dry_streak = 0;
            } else {
                p.private.chain.dry_streak = p.private.chain.dry_streak.saturating_add(1);
            }
        }
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
            if p.view.health <= 0
                || p.view
                    .sun
                    .as_ref()
                    .is_some_and(|sun| sun.ends <= self.tick || p.view.form_until <= self.tick)
            {
                p.view.sun = None;
            }
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
        let mut w = World::configured(Content::load().unwrap(), "arena_1", true).unwrap();
        w.add(1, "arcanist", 0, 0).unwrap();
        w.add(2, "briarwarden", 1, 1).unwrap();
        w.players.get_mut(&2).unwrap().view.bot = true;
        for _ in 0..61 {
            w.step();
        }
        w.players.get_mut(&2).unwrap().view.health = 20000;
        w.players.get_mut(&2).unwrap().view.max_health = 20000;
        w
    }
    fn wait(w: &mut World, n: u32) {
        for _ in 0..n {
            w.step();
        }
    }
    #[test]
    fn mobile_builder_shield_and_damage_preserve_cast_then_flash_converts_to_finisher() {
        let mut w = duel();
        w.content
            .abilities
            .get_mut("cinder_dart")
            .unwrap()
            .crit_chance = 0;
        w.cast(1, 0, Some(2), None).unwrap();
        let ends = w.players[&1].cast.as_ref().unwrap().view.ends;
        w.cast(1, 5, None, None).unwrap();
        w.damage(2, 1, 40);
        assert_eq!(w.players[&1].cast.as_ref().unwrap().view.ends, ends);
        for seq in 1..=20 {
            w.input(1, seq, 1, 0).unwrap();
            w.step();
        }
        wait(&mut w, 10);
        assert_eq!(w.players[&1].private.embers, 1);
        w.cast(1, 1, Some(2), None).unwrap();
        assert_eq!(w.players[&1].private.embers, 3);
        w.cast(1, 2, Some(2), None).unwrap();
        assert!(w.players[&1].cast.is_none());
        assert_eq!(w.players[&1].private.embers, 0);
    }
    #[test]
    fn flash_during_furnace_does_not_cancel_or_extend_gcd_and_invalid_spender_spends_nothing() {
        let mut w = duel();
        w.cast(1, 3, Some(2), None).unwrap();
        let ends = w.players[&1].cast.as_ref().unwrap().view.ends;
        let gcd = w.players[&1].private.gcd_until;
        w.cast(1, 1, Some(2), None).unwrap();
        assert_eq!(w.players[&1].private.embers, 2);
        assert_eq!(w.players[&1].cast.as_ref().unwrap().view.ends, ends);
        assert_eq!(w.players[&1].private.gcd_until, gcd);
        wait(&mut w, 40);
        assert_eq!(w.players[&1].private.embers, 3);
        assert_eq!(w.cast(1, 2, Some(1), None), Err("invalid_target"));
        assert_eq!(w.players[&1].private.embers, 3);
    }
    #[test]
    fn blink_inputs_share_charges_and_roots_block_both() {
        let mut w = duel();
        w.players.get_mut(&1).unwrap().view.root_until = w.tick + 5;
        assert_eq!(w.cast(1, 4, None, None), Err("rooted"));
        assert_eq!(w.mobility(1, Some(2)), Err("rooted"));
        wait(&mut w, 5);
        w.cast(1, 4, None, None).unwrap();
        w.mobility(1, Some(2)).unwrap();
        assert_eq!(w.charge_count(1, "riftstep"), 0);
        assert_eq!(w.mobility(1, Some(2)), Err("cooldown"));
        wait(&mut w, 240);
        assert_eq!(w.charge_count(1, "riftstep"), 1);
    }
    #[test]
    fn meteor_locks_at_completion_ignites_on_impact_and_reset_clears_it() {
        let mut w = duel();
        w.cast(1, 6, Some(2), None).unwrap();
        wait(&mut w, 14);
        assert!(w.areas.is_empty());
        assert!(w.burns.is_empty());
        wait(&mut w, 1);
        let point = w.areas[0].view.pos;
        assert_eq!(point, w.players[&2].view.pos);
        assert!(w.burns.is_empty());
        wait(&mut w, 24);
        assert_eq!(w.burns.len(), 1);
        w.reset_practice(BotDifficulty::Trained).unwrap();
        assert!(w.burns.is_empty() && w.areas.is_empty());
        assert_eq!(w.players[&1].private.embers, 0);
    }
    #[test]
    fn ascension_changes_primary_kit_and_echoes_are_finite_without_resource_gains() {
        let mut w = duel();
        w.players.get_mut(&1).unwrap().private.energy = 100;
        w.ultimate(1, None, Some(2)).unwrap();
        assert_eq!(w.players[&1].private.embers, 3);
        assert_eq!(w.ability_id(1, 0), Some("infernal_jet"));
        assert_eq!(w.ability_id(1, 3), Some("living_sun"));
        w.cast(1, 3, None, None).unwrap();
        wait(&mut w, 16);
        assert_eq!(w.players[&1].view.sun.as_ref().unwrap().charges, 3);
        w.content
            .abilities
            .get_mut("worldflare")
            .unwrap()
            .crit_chance = 0;
        w.cast(1, 2, Some(2), None).unwrap();
        wait(&mut w, 20);
        assert_eq!(w.players[&1].view.sun.as_ref().unwrap().charges, 2);
        assert!(w.events.iter().any(|e| e.kind == "echo"));
        assert_eq!(w.players[&1].private.energy, 0);
        wait(&mut w, 240);
        assert!(w.players[&1].view.sun.is_none());
        assert_eq!(w.ability_id(1, 0), Some("cinder_dart"));
        assert_eq!(w.ability_id(1, 3), Some("flare_lance"));
    }
    #[test]
    fn ascension_does_not_charge_from_idle_or_crowd_spikes() {
        let mut w = duel();
        wait(&mut w, 100);
        assert_eq!(w.players[&1].private.energy, 0);
        for _ in 0..20 {
            w.damage(1, 2, 100);
        }
        assert_eq!(w.players[&1].private.energy, 4);
    }
}
