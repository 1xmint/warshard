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
                if p.private.as_ref().unwrap().energy >= 100 {
                    let _ = world.ultimate(id, None);
                }
                let slot = if enemy.casting.is_some() {
                    3
                } else if p.health < p.max_health / 2 && p.shield == 0 {
                    2
                } else if world.tick.is_multiple_of(80) && ranged {
                    4
                } else {
                    0
                };
                if world.cast(id, slot, target, Some(enemy.pos)).is_ok()
                    && world.content.abilities[&form.abilities[usize::from(slot)]].cast > 0
                {
                    continue;
                }
                if p.casting.is_some() {
                    continue;
                }
                if !ranged && distance > 4000_i64.pow(2) || ranged && distance < 2200_i64.pow(2) {
                    let _ = world.mobility(id, target);
                }
                if !objective_role
                    && ranged
                    && (4000_i64.pow(2)..11000_i64.pow(2)).contains(&distance)
                {
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
        let _ = world.input(id, *seq, dx, dz);
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
