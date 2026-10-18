//! Practice opponents issue the same legal intents as humans. No damage shortcuts.
use std::collections::BTreeMap;
mod navigation;
use navigation::direction;
use warshard_sim::{geometry::Pos, *};

#[derive(Default)]
pub struct BotMemory {
    seq: u32,
    next_think: u32,
    movement: (i16, i16, u16),
    observed_cast: Option<(u32, u32, u32)>,
}
pub fn update(world: &mut World, sequences: &mut BTreeMap<u32, BotMemory>) {
    if world.phase != Phase::Active {
        return;
    }
    let ids: Vec<_> = world
        .players
        .values()
        .filter(|p| p.view.bot && p.view.health > 0)
        .map(|p| p.view.id)
        .collect();
    for id in ids {
        if world.rules.view.bot_difficulty != BotDifficulty::Easy {
            let memory = sequences.entry(id).or_default();
            trained(world, id, memory);
            continue;
        }
        world.players.get_mut(&id).unwrap().view.bot_action =
            Some("Easy: approach and basic attack".into());
        let state = world.snapshot(id);
        let p = state.players.iter().find(|p| p.id == id).unwrap();
        let carrying = state.match_info.flags.iter().any(|f| f.carrier == Some(id));
        let objective_role = state.match_info.kind == "ctf" && (carrying || id.is_multiple_of(3));
        let enemy = state
            .players
            .iter()
            .filter(|e| e.team != p.team && e.health > 0)
            .min_by_key(|e| e.pos.distance_sq(p.pos));
        let objective = if state.match_info.kind == "ctf" {
            let flags = &state.match_info.flags;
            if carrying {
                flags[usize::from(p.team)].home
            } else if flags[usize::from(p.team)].dropped_until > 0 {
                flags[usize::from(p.team)].pos
            } else {
                flags[usize::from(1 - p.team)].pos
            }
        } else {
            enemy.map_or(p.pos, |e| e.pos)
        };
        let form = world.content.forms[&p.form].clone();
        let target = enemy.map(|e| e.id);
        if let Some(enemy) = enemy {
            let distance = p.pos.distance_sq(enemy.pos);
            let ranged = world.content.abilities[&form.abilities[0]].range > 5000;
            let combat = state.match_info.kind == "arena" || distance < 9000_i64.pow(2);
            if combat && world.content.arena.line_of_sight(p.pos, enemy.pos) {
                // Easy practice: one basic attack every two seconds, staggered per bot.
                // No cast-reading interrupts, defensive combos, mobility or Ascension.
                if world.tick % 40 == (id * 7) % 40
                    && world.cast(id, 0, target, None).is_ok()
                    && world.content.abilities[&form.abilities[0]].cast > 0
                {
                    continue;
                }
                if p.casting.is_some() {
                    continue;
                }
                if !objective_role && ranged && distance < 11000_i64.pow(2) {
                    continue;
                }
            }
        }
        let goal = if let Some(e) = enemy.filter(|e| {
            !objective_role
                && (state.match_info.kind == "arena" || e.pos.distance_sq(p.pos) < 4500_i64.pow(2))
        }) {
            e.pos
        } else {
            // Flag runners use an outside lane to avoid the central melee.
            let lane = if id.is_multiple_of(2) { 10500 } else { -10500 };
            if objective_role && (objective.x - p.pos.x).abs() > 18000 && p.pos.z.abs() < 9000 {
                Pos {
                    x: p.pos.x,
                    z: lane,
                }
            } else if objective_role && (objective.x - p.pos.x).abs() > 10000 {
                Pos {
                    x: objective.x,
                    z: lane,
                }
            } else {
                objective
            }
        };
        let (dx, dz) = direction(&world.content.arena, p.pos, goal);
        let seq = sequences.entry(id).or_default();
        seq.seq += 1;
        // Pursue at half speed so humans can open a gap; flag runners retain normal
        // navigation speed. Both still use ordinary validated steering and collisions.
        let scale = match (objective_role, dx != 0 && dz != 0) {
            (true, true) => 707,
            (true, false) => 1000,
            (false, true) => 353,
            (false, false) => 500,
        };
        let facing = if dx == 0 && dz == 0 {
            p.facing
        } else {
            (f64::from(dx)
                .atan2(f64::from(dz))
                .rem_euclid(std::f64::consts::TAU)
                * 1000.0) as u16
        };
        let _ = world.steer(
            id,
            seq.seq,
            i16::from(dx) * scale,
            i16::from(dz) * scale,
            facing,
        );
    }
}
fn trained(world: &mut World, id: u32, memory: &mut BotMemory) {
    let skilled = world.rules.view.bot_difficulty == BotDifficulty::Skilled;
    let interval = if skilled { 4 } else { 6 };
    if world.tick >= memory.next_think {
        memory.next_think = world.tick + interval;
        // This snapshot intentionally excludes private opponent cooldowns, resources and procs.
        let state = world.snapshot(id);
        let own = state.players.iter().find(|p| p.id == id).unwrap();
        let enemy = state
            .players
            .iter()
            .filter(|p| p.team != own.team && p.health > 0 && p.connected)
            .min_by_key(|p| {
                (
                    !world.content.arena.line_of_sight(own.pos, p.pos),
                    own.pos.distance_sq(p.pos),
                )
            });
        memory.movement = (0, 0, own.facing);
        if let Some(enemy) = enemy {
            let distance = own.pos.distance_sq(enemy.pos);
            let arcanist = own.class_id == "arcanist";
            let ranged =
                world.content.abilities[&world.content.forms[&own.form].abilities[0]].range > 5000;
            let away = |from: Pos| Pos {
                x: (own.pos.x + (own.pos.x - from.x).signum() * 4000).clamp(
                    -world.content.arena.half_x + 600,
                    world.content.arena.half_x - 600,
                ),
                z: (own.pos.z + (own.pos.z - from.z).signum() * 4000).clamp(
                    -world.content.arena.half_z + 600,
                    world.content.arena.half_z - 600,
                ),
            };
            let danger = state.areas.iter().find(|a| {
                state
                    .players
                    .iter()
                    .any(|p| p.id == a.owner && p.team != own.team)
                    && own.pos.distance_sq(a.pos) < i64::from(a.radius + 600).pow(2)
            });
            let pressured = own.health * 100 / own.max_health < 40;
            let carrying = state
                .match_info
                .flags
                .iter()
                .any(|flag| flag.carrier == Some(id));
            let objective_role = carrying || id.is_multiple_of(3);
            let objective = (state.match_info.kind == "ctf").then(|| {
                let home = &state.match_info.flags[usize::from(own.team)];
                if carrying {
                    home.home
                } else if home.dropped_until > 0 {
                    home.pos
                } else {
                    state.match_info.flags[usize::from(1 - own.team)].pos
                }
            });
            let travelling = objective.is_some()
                && (carrying
                    || distance > 14000_i64.pow(2)
                    || (objective_role && distance > 6500_i64.pow(2)));
            let mut goal = if let Some(area) = danger {
                away(area.pos)
            } else if travelling {
                let destination = objective.unwrap();
                // Both teams use both lanes rather than tying lane selection to team parity.
                let lane = if (id / 2).is_multiple_of(2) {
                    10500
                } else {
                    -10500
                };
                if (destination.x - own.pos.x).abs() > 16000 && own.pos.z.abs() < 9000 {
                    Pos {
                        x: own.pos.x,
                        z: lane,
                    }
                } else if (destination.x - own.pos.x).abs() > 8000 {
                    Pos {
                        x: destination.x,
                        z: lane,
                    }
                } else {
                    destination
                }
            } else if ranged && distance < 5000_i64.pow(2) {
                away(enemy.pos)
            } else if (!ranged && distance > 1800_i64.pow(2))
                || (ranged && distance > 10000_i64.pow(2))
                || !world.content.arena.line_of_sight(own.pos, enemy.pos)
            {
                enemy.pos
            } else {
                own.pos
            };
            if let Some(cast) = &enemy.casting {
                if memory.observed_cast.is_none_or(|(target, started, _)| {
                    target != enemy.id || started != cast.started
                }) {
                    memory.observed_cast = Some((enemy.id, cast.started, world.tick));
                }
            } else {
                memory.observed_cast = None;
            }
            let reaction_ready = memory
                .observed_cast
                .is_some_and(|(_, _, seen)| world.tick >= seen + if skilled { 4 } else { 8 });
            let private = own.private.as_ref().unwrap();
            if arcanist
                && private.energy >= 100
                && own.form == "arcanist"
                && !pressured
                && own.casting.is_none()
                && danger.is_none()
                && enemy.shield == 0
                && distance <= 12500_i64.pow(2)
                && world.content.arena.line_of_sight(own.pos, enemy.pos)
            {
                let _ = world.ultimate(id, None, Some(enemy.id));
            }
            if goal == own.pos
                && own.casting.is_none()
                && danger.is_none()
                && !carrying
                && let Some(ally) = state
                    .players
                    .iter()
                    .filter(|ally| {
                        ally.id != id
                            && ally.team == own.team
                            && ally.health > 0
                            && ally.pos.distance_sq(own.pos) < 1000_i64.pow(2)
                    })
                    .min_by_key(|ally| ally.pos.distance_sq(own.pos))
            {
                let side = if own.pos.z == ally.pos.z {
                    if id < ally.id { -1 } else { 1 }
                } else {
                    (own.pos.z - ally.pos.z).signum()
                };
                let spread = Pos {
                    x: (own.pos.x + (own.pos.x - ally.pos.x).signum() * 1000).clamp(
                        -world.content.arena.half_x + 600,
                        world.content.arena.half_x - 600,
                    ),
                    z: (own.pos.z + side * 1400).clamp(
                        -world.content.arena.half_z + 600,
                        world.content.arena.half_z - 600,
                    ),
                };
                if world.content.arena.path_clear(own.pos, spread) {
                    goal = spread;
                }
            }
            let mut facing_override = None;
            let mut action = "Hold casting range";
            let mut cast_slot = None;
            let ready = |slot| {
                world.ability_id(id, slot).is_some_and(|ability| {
                    let definition = &world.content.abilities[ability];
                    (definition.off_gcd || private.gcd_until <= world.tick)
                        && private.cooldowns.get(ability).copied().unwrap_or(0) <= world.tick
                        && private.resource >= definition.cost
                        && private
                            .lockouts
                            .get(&definition.school)
                            .copied()
                            .unwrap_or(0)
                            <= world.tick
                        && (definition.charges <= 1 || world.charge_count(id, ability) > 0)
                })
            };
            if reaction_ready && ready(if arcanist { 7 } else { 3 }) {
                cast_slot = Some(if arcanist { 7 } else { 3 });
                action = "React to a visible cast";
            } else if pressured && own.shield == 0 && ready(if arcanist { 5 } else { 2 }) {
                cast_slot = Some(if arcanist { 5 } else { 2 });
                action = "Barrier under pressure";
            } else if arcanist && own.casting.is_none() && distance < 2700_i64.pow(2) && ready(8) {
                cast_slot = Some(8);
                action = "Glasswake peel / meteor setup";
            } else if arcanist && distance < 3500_i64.pow(2) && ready(4) {
                // Turn away first, then use the same facing-based blink as the player.
                let angle = f64::from(own.pos.x - enemy.pos.x)
                    .atan2(f64::from(own.pos.z - enemy.pos.z))
                    .rem_euclid(std::f64::consts::TAU);
                let facing = (angle * 1000.) as u16;
                facing_override = Some(facing);
                // Facing is applied by the fixed simulation tick; blink on the next decision.
                if (i32::from(own.facing) - i32::from(facing)).abs() < 150 {
                    cast_slot = Some(4);
                }
                action = "Turn and blink away";
                memory.movement.2 = facing;
            } else if own.casting.is_none() && danger.is_none() {
                if arcanist {
                    let meteor_setup = goal == own.pos
                        && ready(6)
                        && (enemy.root_until > world.tick + 39
                            || enemy
                                .casting
                                .as_ref()
                                .is_some_and(|cast| cast.ends > world.tick + 39)
                            || state
                                .players
                                .iter()
                                .filter(|target| {
                                    target.team != own.team
                                        && target.health > 0
                                        && target.pos.distance_sq(enemy.pos) <= 2700_i64.pow(2)
                                })
                                .count()
                                >= 2);
                    cast_slot = Some(if private.chain.ready_until > world.tick {
                        3
                    } else if meteor_setup {
                        6
                    } else if private.chain.prepared_until > world.tick
                        && world.charge_count(id, "flashkindle") > 0
                    {
                        2
                    } else if goal != own.pos && own.root_until <= world.tick {
                        0
                    } else {
                        1
                    });
                    action = if private.chain.ready_until > world.tick {
                        "Spend instant Sunshard"
                    } else if meteor_setup {
                        "Crownfall on controlled / clustered enemies"
                    } else if private.chain.prepared_until > world.tick {
                        "Complete the critical chain"
                    } else if goal != own.pos {
                        "Kite with mobile pressure"
                    } else {
                        "Commit to a cast"
                    };
                } else {
                    cast_slot = Some(0);
                    action = "Basic pressure";
                }
            }
            let succeeded =
                cast_slot.is_some_and(|slot| world.cast(id, slot, Some(enemy.id), None).is_ok());
            if !succeeded && own.casting.is_none() && danger.is_none() {
                let _ = world.cast(id, 0, Some(enemy.id), None);
            }
            if succeeded
                && world
                    .snapshot(id)
                    .players
                    .iter()
                    .find(|p| p.id == id)
                    .unwrap()
                    .casting
                    .as_ref()
                    .is_some_and(|cast| !world.content.abilities[&cast.ability].cast_while_moving)
            {
                goal = own.pos;
            }
            if own
                .casting
                .as_ref()
                .is_some_and(|cast| !world.content.abilities[&cast.ability].cast_while_moving)
                && danger.is_none()
                && !(ranged && distance < 3500_i64.pow(2))
            {
                goal = own.pos;
            }
            if goal != own.pos {
                action = if danger.is_some() {
                    "Leave hostile area"
                } else if goal == enemy.pos {
                    "Close line of sight / range"
                } else {
                    "Create distance"
                };
            }
            let (dx, dz) = direction(&world.content.arena, own.pos, goal);
            let scale = if dx != 0 && dz != 0 { 707 } else { 1000 };
            let facing = if dx == 0 && dz == 0 {
                (f64::from(enemy.pos.x - own.pos.x)
                    .atan2(f64::from(enemy.pos.z - own.pos.z))
                    .rem_euclid(std::f64::consts::TAU)
                    * 1000.) as u16
            } else {
                (f64::from(dx)
                    .atan2(f64::from(dz))
                    .rem_euclid(std::f64::consts::TAU)
                    * 1000.) as u16
            };
            memory.movement = (
                i16::from(dx) * scale,
                i16::from(dz) * scale,
                facing_override.unwrap_or(facing),
            );
            world.players.get_mut(&id).unwrap().view.bot_action = Some(action.into());
            // Failed casts do not reveal a hidden opponent state; try another legal action next decision.
        }
    }
    memory.seq += 1;
    let (dx, dz, facing) = memory.movement;
    let _ = world.steer(id, memory.seq, dx, dz, facing);
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn navigation_reaches_a_valid_goal_with_a_blocked_cell_center() {
        let content = Content::load().unwrap();
        let arena = &content.maps["riftwood_crossing"];
        let mut pos = Pos { x: 0, z: 4000 };
        let goal = Pos { x: 5700, z: 1400 };
        assert!(arena.walkable(goal));
        assert!(!arena.walkable(Pos { x: 5500, z: 1500 }));
        for _ in 0..160 {
            let (dx, dz) = direction(arena, pos, goal);
            pos = arena.move_step(pos, dx, dz, 250);
            assert!(arena.walkable(pos));
        }
        assert!(pos.distance_sq(goal) < 750_i64.pow(2), "stalled at {pos:?}");
    }
    #[test]
    fn trained_mage_completes_a_legal_rotation_without_cancelling_its_filler() {
        let mut world = World::configured(Content::load().unwrap(), "arena_1", true).unwrap();
        world.add(1, "arcanist", 0, 0).unwrap();
        world.add(2, "arcanist", 1, 1).unwrap();
        world.players.get_mut(&2).unwrap().view.bot = true;
        world.players.get_mut(&1).unwrap().view.health = 20000;
        world.players.get_mut(&1).unwrap().view.max_health = 20000;
        world.rules.view.bot_difficulty = BotDifficulty::Trained;
        world.seed_combat(42);
        let mut memory = BTreeMap::new();
        let mut casts = std::collections::BTreeSet::new();
        for _ in 0..700 {
            update(&mut world, &mut memory);
            world.step();
            for event in &world.snapshot(2).events {
                if event.source == 2 && event.kind == "cast" {
                    casts.insert(event.ability.clone());
                }
            }
        }
        for ability in ["flare_lance", "flashkindle", "sunshard"] {
            assert!(casts.contains(ability), "missing {ability}: {casts:?}");
        }
        assert!(world.rules.view.stats[&2].damage > 1000);
    }
    #[test]
    fn trained_battleground_roster_leaves_bases_fights_and_runs_flags() {
        let mut world = World::configured(Content::load().unwrap(), "ctf_6", true).unwrap();
        world.rules.view.bot_difficulty = BotDifficulty::Trained;
        world.seed_combat(42);
        for slot in 0..12 {
            let id = slot + 1;
            world
                .add(
                    id,
                    if (slot / 2) % 2 == 0 {
                        "briarwarden"
                    } else {
                        "arcanist"
                    },
                    (slot % 2) as usize,
                    (slot % 2) as u8,
                )
                .unwrap();
            world.players.get_mut(&id).unwrap().view.bot = true;
        }
        let mut memory = BTreeMap::new();
        let mut flag_moved = false;
        let mut travelled = std::collections::BTreeSet::new();
        for _ in 0..1000 {
            update(&mut world, &mut memory);
            world.step();
            flag_moved |= world
                .rules
                .view
                .flags
                .iter()
                .any(|flag| flag.carrier.is_some())
                || world.rules.view.scores.iter().sum::<u32>() > 0;
            for player in world.players.values() {
                assert!(world.content.arena.walkable(player.view.pos));
                let base = world.content.arena.spawns[usize::from(player.view.team)];
                if player.view.pos.distance_sq(base) > 10000_i64.pow(2) {
                    travelled.insert(player.view.id);
                }
            }
        }
        assert_eq!(travelled.len(), 12, "bots stuck near bases: {travelled:?}");
        assert!(
            world
                .rules
                .view
                .stats
                .values()
                .filter(|stats| stats.damage > 0)
                .count()
                >= 6
        );
        assert!(flag_moved, "objective roles never reached a flag");
    }
    #[test]
    fn trained_bot_reacts_after_delay_without_private_opponent_information() {
        let mut world = World::configured(Content::load().unwrap(), "arena_1", true).unwrap();
        world.add(1, "arcanist", 0, 0).unwrap();
        world.add(2, "arcanist", 1, 1).unwrap();
        world.players.get_mut(&2).unwrap().view.bot = true;
        world.rules.view.bot_difficulty = BotDifficulty::Trained;
        for _ in 0..61 {
            world.step();
        }
        assert!(
            world
                .snapshot(2)
                .players
                .iter()
                .find(|p| p.id == 1)
                .unwrap()
                .private
                .is_none()
        );
        world.cast(1, 1, Some(2), None).unwrap();
        let mut memory = BTreeMap::new();
        for _ in 0..4 {
            update(&mut world, &mut memory);
            world.step();
        }
        assert!(
            world
                .snapshot(1)
                .players
                .iter()
                .find(|p| p.id == 1)
                .unwrap()
                .casting
                .is_some()
        );
        for _ in 0..16 {
            update(&mut world, &mut memory);
            world.step();
        }
        let state = world.snapshot(1);
        assert!(
            state
                .players
                .iter()
                .find(|p| p.id == 1)
                .unwrap()
                .casting
                .is_none()
        );
        assert!(
            state
                .players
                .iter()
                .find(|p| p.id == 1)
                .unwrap()
                .private
                .as_ref()
                .unwrap()
                .lockouts
                .get("ember")
                .is_some_and(|until| *until > world.tick)
        );
        assert!(
            world
                .players
                .values()
                .all(|p| world.content.arena.walkable(p.view.pos))
        );
        assert!(
            state
                .players
                .iter()
                .find(|p| p.id == 2)
                .unwrap()
                .bot_action
                .is_some()
        );
    }
    #[test]
    fn human_can_outpace_pursuing_bot_and_roots_still_stop_it() {
        let mut world = World::new(Content::load().unwrap());
        world.add(1, "briarwarden", 0, 0).unwrap();
        world.add(2, "briarwarden", 1, 1).unwrap();
        world.players.get_mut(&1).unwrap().view.bot = true;
        for _ in 0..61 {
            world.step();
        }
        let bot_start = world.players[&1].view.pos;
        let human_start = world.players[&2].view.pos;
        let mut sequences = BTreeMap::new();
        for seq in 1..=20 {
            update(&mut world, &mut sequences);
            world.input(2, seq, 1, 0).unwrap();
            world.step();
            assert_eq!(world.players[&1].view.pos.x, bot_start.x + seq as i32 * 125);
            assert_eq!(
                world.players[&2].view.pos.x,
                human_start.x + seq as i32 * 250
            );
        }
        let bot = world.players[&1].view.pos;
        let human = world.players[&2].view.pos;
        assert!(human.distance_sq(bot) > human_start.distance_sq(bot_start));
        world.players.get_mut(&1).unwrap().view.root_until = world.tick + 10;
        for _ in 0..5 {
            update(&mut world, &mut sequences);
            world.step();
            assert_eq!(world.players[&1].view.pos, bot);
        }
    }
    #[test]
    fn easy_bot_uses_slow_basic_attacks_without_interrupts_or_ascension() {
        let mut world = World::new(Content::load().unwrap());
        world.add(1, "briarwarden", 0, 0).unwrap();
        world.add(2, "ashweaver", 1, 1).unwrap();
        for _ in 0..61 {
            world.step();
        }
        world.players.get_mut(&1).unwrap().view.pos = Pos { x: 4000, z: 0 };
        world.players.get_mut(&1).unwrap().view.bot = true;
        world.cast(2, 0, Some(1), None).unwrap();
        let mut sequences = BTreeMap::new();
        for _ in 0..10 {
            update(&mut world, &mut sequences);
            world.step();
        }
        assert!(
            world
                .snapshot(1)
                .players
                .iter()
                .find(|p| p.id == 2)
                .unwrap()
                .casting
                .is_some()
        );
        for _ in 0..390 {
            update(&mut world, &mut sequences);
            world.step();
        }
        let state = world.snapshot(1);
        let bot = state.players.iter().find(|p| p.id == 1).unwrap();
        assert_eq!(bot.form, "warden");
        assert_eq!(bot.private.as_ref().unwrap().energy, 100);
        assert!(
            bot.private
                .as_ref()
                .unwrap()
                .cooldowns
                .keys()
                .all(|id| id == "thorncut")
        );
        assert!(state.match_info.stats[&1].damage <= 10 * 95);
    }
    #[test]
    fn practice_bots_navigate_fight_and_follow_objectives_without_state_shortcuts() {
        let mut world = World::configured(Content::load().unwrap(), "ctf_10", true).unwrap();
        for slot in 0..20 {
            let id = slot + 1;
            world
                .add(
                    id,
                    if slot % 4 < 2 {
                        "briarwarden"
                    } else {
                        "ashweaver"
                    },
                    (slot % 2) as usize,
                    (slot % 2) as u8,
                )
                .unwrap();
            world.players.get_mut(&id).unwrap().view.bot = true;
            world.rules.view.stats.get_mut(&id).unwrap().bot = true;
        }
        let mut sequences = BTreeMap::new();
        let mut samples = vec![];
        let mut touched_flag = false;
        for _ in 0..1261 {
            let begin = std::time::Instant::now();
            let active = world.phase == Phase::Active;
            update(&mut world, &mut sequences);
            world.step();
            touched_flag |= world
                .rules
                .view
                .flags
                .iter()
                .any(|flag| flag.carrier.is_some());
            if active {
                samples.push(begin.elapsed().as_micros());
            }
            assert!(
                world
                    .players
                    .values()
                    .all(|p| world.content.arena.walkable(p.view.pos))
            );
        }
        assert!(
            world
                .rules
                .view
                .stats
                .values()
                .map(|s| s.damage)
                .sum::<i32>()
                > 1000
        );
        assert!(world.rules.view.stats.values().any(|s| s.kills > 0));
        assert!(touched_flag || world.rules.view.scores.iter().sum::<u32>() > 0);
        assert!(sequences.len() == 20);
        samples.sort_unstable();
        let bytes = serde_json::to_vec(&ServerMessage::State {
            state: world.snapshot(1),
        })
        .unwrap()
        .len();
        eprintln!(
            "20-bot scenario, simulation + bot decisions only: p95={}us p99={}us max={}us; final recipient snapshot={} bytes ({} bytes/s at 20Hz). Excludes host serialization, scheduling and network.",
            samples[samples.len() * 95 / 100],
            samples[samples.len() * 99 / 100],
            samples.last().unwrap(),
            bytes,
            bytes * 20
        );
    }
}
