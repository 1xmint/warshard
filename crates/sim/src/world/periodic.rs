//! Authoritative attached burns. Reapplication refreshes, never stacks a source's burn.
use super::*;

pub(super) struct Burn {
    pub(super) view: BurnView,
    amount: i32,
    next: u32,
    interval: u32,
    proc_interval: u32,
}

impl World {
    pub(super) fn enemies_in_area(&self, source: u32, center: Pos, radius: i32) -> Vec<u32> {
        let team = self.players[&source].view.team;
        self.players
            .values()
            .filter(|player| {
                player.view.team != team
                    && player.view.health > 0
                    && player.view.pos.distance_sq(center) <= i64::from(radius).pow(2)
                    && self.content.arena.line_of_sight(center, player.view.pos)
            })
            .map(|player| player.view.id)
            .collect()
    }

    pub(super) fn apply_burn(&mut self, owner: u32, target: u32, ability: &str, effect: &Effect) {
        let Effect::BurnArea {
            amount,
            duration,
            interval,
            proc_interval,
            ..
        } = *effect
        else {
            return;
        };
        let mut burn = Burn {
            view: BurnView {
                owner,
                target,
                ability: ability.into(),
                started: self.tick,
                ends: self.tick + duration,
            },
            amount,
            next: self.tick + interval,
            interval,
            proc_interval,
        };
        if let Some(existing) = self.burns.iter_mut().find(|burn| {
            burn.view.owner == owner && burn.view.target == target && burn.view.ability == ability
        }) {
            burn.next = burn.next.min(existing.next);
            *existing = burn;
        } else {
            self.burns.push(burn);
        }
        self.emit(owner, Some(target), ability, "ignite", 0);
    }

    pub(super) fn periodic_tick(&mut self) {
        let active = self.phase == Phase::Active;
        self.burns.retain(|burn| {
            active
                && self.tick <= burn.view.ends
                && self.players.contains_key(&burn.view.owner)
                && self
                    .players
                    .get(&burn.view.target)
                    .is_some_and(|p| p.view.health > 0)
        });
        let mut pulses = vec![];
        for burn in &mut self.burns {
            if self.tick >= burn.next {
                pulses.push((burn.view.clone(), burn.amount, burn.proc_interval));
                burn.next += burn.interval;
            }
        }
        for (view, amount, proc_interval) in pulses {
            let mut ability = self.content.abilities[&view.ability].clone();
            let may_kindle = self.players[&view.owner].view.health > 0
                && self.players[&view.owner].next_burn_chain <= self.tick;
            ability.chains &= may_kindle;
            ability.ember_gain = 0;
            ability.crit_embers &= may_kindle;
            let critical = self.strike(view.owner, view.target, &view.ability, &ability, amount);
            if critical && may_kindle {
                self.players.get_mut(&view.owner).unwrap().next_burn_chain =
                    self.tick + proc_interval;
            }
        }
        // The final tick is delivered at expiry, then its public debuff disappears.
        self.burns.retain(|burn| {
            self.tick < burn.view.ends
                && self
                    .players
                    .get(&burn.view.target)
                    .is_some_and(|p| p.view.health > 0)
        });
    }
    pub(super) fn detonate_burn(
        &mut self,
        owner: u32,
        recipient: u32,
        ability: &str,
        percent: u8,
        radius: i32,
    ) {
        let targets = self.enemies_in_area(owner, self.players[&recipient].view.pos, radius);
        let mut damage = BTreeMap::<u32, i32>::new();
        for burn in &mut self.burns {
            if burn.view.owner == owner
                && targets.contains(&burn.view.target)
                && burn.next <= burn.view.ends
            {
                let pulses = (burn.view.ends - burn.next) / burn.interval + 1;
                let remaining = burn.amount * (100 - i32::from(percent)) / 100;
                *damage.entry(burn.view.target).or_default() +=
                    (burn.amount - remaining) * pulses as i32;
                burn.amount = remaining;
            }
        }
        for (target, amount) in damage {
            self.damage(owner, target, amount);
            self.emit(owner, Some(target), ability, "detonate", amount);
        }
    }
    pub(super) fn spread_burn(&mut self, owner: u32, recipient: u32, radius: i32, count: u8) {
        let Some(original) = self.burns.iter().find(|burn| {
            burn.view.owner == owner && burn.view.target == recipient && burn.view.ends > self.tick
        }) else {
            return;
        };
        let view = original.view.clone();
        let amount = original.amount;
        let interval = original.interval;
        let proc_interval = original.proc_interval;
        let next = original.next;
        let mut targets = self.enemies_in_area(owner, self.players[&recipient].view.pos, radius);
        targets.retain(|target| {
            *target != recipient
                && !self.burns.iter().any(|burn| {
                    burn.view.owner == owner
                        && burn.view.target == *target
                        && burn.view.ability == view.ability
                })
        });
        for target in targets.into_iter().take(usize::from(count)) {
            self.burns.push(Burn {
                view: BurnView {
                    target,
                    ..view.clone()
                },
                amount,
                next,
                interval,
                proc_interval,
            });
            self.emit(owner, Some(target), &view.ability, "ignite", 0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn duel() -> World {
        let mut world = World::configured(Content::load().unwrap(), "arena_2", true).unwrap();
        for (id, team) in [(1, 0), (2, 1), (3, 0), (4, 1)] {
            world.add(id, "arcanist", usize::from(team), team).unwrap();
            let p = world.players.get_mut(&id).unwrap();
            p.view.health = 20000;
            p.view.max_health = 20000;
        }
        for _ in 0..61 {
            world.step();
        }
        for id in [2, 3, 4] {
            world.players.get_mut(&id).unwrap().view.pos = Pos { x: 4500, z: 0 };
        }
        world
            .content
            .abilities
            .get_mut("firestorm")
            .unwrap()
            .crit_chance = 100;
        world
    }
    fn wait(world: &mut World, ticks: u32) {
        for _ in 0..ticks {
            world.step();
        }
    }

    #[test]
    fn firestorm_requires_legal_target_before_spending_energy_and_ignites_only_enemies() {
        let mut world = duel();
        world.players.get_mut(&1).unwrap().private.energy = 100;
        assert!(world.ultimate(1, None, Some(3)).is_err());
        assert_eq!(world.players[&1].private.energy, 100);
        assert_eq!(world.players[&1].view.form, "arcanist");
        world
            .players
            .get_mut(&1)
            .unwrap()
            .private
            .lockouts
            .insert("ember".into(), world.tick + 20);
        assert_eq!(world.ultimate(1, None, Some(2)), Err("school_locked"));
        assert_eq!(world.players[&1].private.energy, 100);
        wait(&mut world, 20);
        world.ultimate(1, None, Some(2)).unwrap();
        assert_eq!(world.players[&1].view.form, "spellstorm");
        assert_eq!(world.projectiles.len(), 1);
        assert!(world.burns.is_empty());
        wait(&mut world, 18);
        assert_eq!(world.burns.len(), 2);
        assert!(
            world
                .snapshot(1)
                .burns
                .iter()
                .all(|burn| [2, 4].contains(&burn.target))
        );
        assert_eq!(world.players[&3].view.health, 20000);
        assert_eq!(world.players[&2].view.health, 20000 - 270);
        world.players.get_mut(&1).unwrap().private.embers = 0;
        wait(&mut world, 20);
        assert_eq!(world.players[&2].view.health, 20000 - 270 - 33);
        assert_eq!(world.players[&1].private.embers, 1);
        assert_eq!(world.players[&1].private.embers, 1); // two victims, only one proc
        wait(&mut world, 20);
        assert_eq!(world.players[&1].private.embers, 2);
        wait(&mut world, 120);
        assert!(world.burns.is_empty());
        assert_eq!(world.players[&2].view.health, 20000 - 270 - 8 * 33);
    }

    #[test]
    fn burn_refresh_never_stacks_and_reset_or_death_clears_debuffs() {
        let mut world = duel();
        let effect = world.content.abilities["firestorm"].effects[1].clone();
        world.apply_burn(1, 2, "firestorm", &effect);
        wait(&mut world, 10);
        world.apply_burn(1, 2, "firestorm", &effect);
        assert_eq!(world.burns.len(), 1);
        assert_eq!(world.burns[0].view.started, world.tick);
        world.players.get_mut(&2).unwrap().view.health = 0;
        world.step();
        assert!(world.burns.is_empty());
        world.apply_burn(1, 4, "firestorm", &effect);
        for id in [2, 3, 4] {
            world.players.get_mut(&id).unwrap().view.bot = true;
        }
        world.reset_practice(BotDifficulty::Trained).unwrap();
        assert!(world.burns.is_empty());
    }
}
