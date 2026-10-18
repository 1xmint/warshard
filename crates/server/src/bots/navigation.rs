//! Bounded clearance-aware navigation. No position writes or collision bypasses.
use std::collections::{BTreeMap, VecDeque};
use warshard_sim::{Arena, geometry::Pos};

pub(super) fn direction(arena: &Arena, from: Pos, goal: Pos) -> (i8, i8) {
    let toward = |point: Pos| {
        (
            if (point.x - from.x).abs() > 125 {
                (point.x - from.x).signum() as i8
            } else {
                0
            },
            if (point.z - from.z).abs() > 125 {
                (point.z - from.z).signum() as i8
            } else {
                0
            },
        )
    };
    let direct = toward(goal);
    let step = arena.move_step(from, direct.0, direct.1, 250);
    if arena.path_clear(from, goal) && step.distance_sq(goal) < from.distance_sq(goal) {
        return direct;
    }
    if from.distance_sq(goal) < 250_i64.pow(2) {
        return (0, 0);
    }
    const CELL: i32 = 1000;
    let start = (from.x.div_euclid(CELL), from.z.div_euclid(CELL));
    let center = |at: (i32, i32)| Pos {
        x: at.0 * CELL + CELL / 2,
        z: at.1 * CELL + CELL / 2,
    };
    let mut todo = VecDeque::from([start]);
    let mut parents = BTreeMap::from([(start, start)]);
    let mut found = start;
    let mut best = from.distance_sq(goal);
    while let Some(at) = todo.pop_front() {
        let pos = if at == start { from } else { center(at) };
        let distance = pos.distance_sq(goal);
        if distance < best {
            found = at;
            best = distance;
        }
        // The actual goal can be walkable even when its cell center is inside cover.
        if at != start && distance < 1600_i64.pow(2) && arena.path_clear(pos, goal) {
            found = at;
            break;
        }
        for delta in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
            let next = (at.0 + delta.0, at.1 + delta.1);
            if !parents.contains_key(&next) && arena.path_clear(pos, center(next)) {
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
    toward(center(found))
}
