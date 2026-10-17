//! Practice opponents issue the same legal intents as humans. No damage shortcuts.
use std::collections::{BTreeMap, VecDeque};
use warshard_sim::{geometry::Pos, *};

pub fn update(world: &mut World, sequences: &mut BTreeMap<u32, u32>) {
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
        *seq += 1;
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
            *seq,
            i16::from(dx) * scale,
            i16::from(dz) * scale,
            facing,
        );
    }
}
fn direction(arena: &Arena, from: Pos, goal: Pos) -> (i8, i8) {
    // Small shared collision grid, searched only for bots currently blocked by terrain.
    let direct = (
        if (goal.x - from.x).abs() > 250 {
            (goal.x - from.x).signum() as i8
        } else {
            0
        },
        if (goal.z - from.z).abs() > 250 {
            (goal.z - from.z).signum() as i8
        } else {
            0
        },
    );
    if arena.line_of_sight(from, goal) && arena.move_step(from, direct.0, direct.1, 250) != from {
        return direct;
    }
    const CELL: i32 = 1000;
    let cell = |p: Pos| (p.x.div_euclid(CELL), p.z.div_euclid(CELL));
    let start = cell(from);
    let end = cell(goal);
    let mut todo = VecDeque::from([start]);
    let mut parents = BTreeMap::from([(start, start)]);
    let mut found = start;
    while let Some(at) = todo.pop_front() {
        if at == end {
            found = at;
            break;
        }
        for d in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
            let next = (at.0 + d.0, at.1 + d.1);
            let p = Pos {
                x: next.0 * CELL + 500,
                z: next.1 * CELL + 500,
            };
            if !parents.contains_key(&next) && arena.walkable(p) {
                parents.insert(next, at);
                todo.push_back(next);
            }
        }
        if parents.len() > 2000 {
            break;
        }
    }
    if found == start {
        return (0, 0);
    }
    while parents[&found] != start {
        found = parents[&found];
    }
    let p = Pos {
        x: found.0 * CELL + 500,
        z: found.1 * CELL + 500,
    };
    ((p.x - from.x).signum() as i8, (p.z - from.z).signum() as i8)
}

#[cfg(test)]
mod tests {
    use super::*;
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
        for _ in 0..1261 {
            let begin = std::time::Instant::now();
            let active = world.phase == Phase::Active;
            update(&mut world, &mut sequences);
            world.step();
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
        assert!(
            world.rules.view.flags.iter().any(|f| f.carrier.is_some())
                || world.rules.view.scores.iter().sum::<u32>() > 0
        );
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
