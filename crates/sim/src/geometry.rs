use crate::content::Arena;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, TS, PartialEq, Eq)]
pub struct Pos {
    pub x: i32,
    pub z: i32,
}
impl Pos {
    pub fn distance_sq(self, other: Self) -> i64 {
        let dx = i64::from(self.x) - i64::from(other.x);
        let dz = i64::from(self.z) - i64::from(other.z);
        dx * dx + dz * dz
    }
}
impl Arena {
    pub fn walkable(&self, p: Pos) -> bool {
        p.x.unsigned_abs() <= (self.half_x - 350) as u32
            && p.z.unsigned_abs() <= (self.half_z - 350) as u32
            && self
                .obstacles
                .iter()
                .all(|o| p.distance_sq(o.pos) > i64::from(o.radius + 350).pow(2))
    }
    pub fn move_step(&self, p: Pos, dx: i8, dz: i8, step: i32) -> Pos {
        let diagonal = dx != 0 && dz != 0;
        let scale = if diagonal { 707 } else { 1000 };
        self.move_vector(p, i16::from(dx) * scale, i16::from(dz) * scale, step)
    }
    /// Direction uses thousandths of unit length; admission validates its magnitude.
    pub fn move_vector(&self, p: Pos, dx: i16, dz: i16, step: i32) -> Pos {
        let mut next = p;
        let x = Pos {
            x: p.x + i32::from(dx) * step / 1000,
            z: p.z,
        };
        if self.walkable(x) {
            next = x;
        }
        let z = Pos {
            x: next.x,
            z: p.z + i32::from(dz) * step / 1000,
        };
        if self.walkable(z) {
            next = z;
        }
        next
    }
    pub fn line_of_sight(&self, a: Pos, b: Pos) -> bool {
        self.obstacles.iter().all(|o| {
            let dx = f64::from(b.x - a.x);
            let dz = f64::from(b.z - a.z);
            let len = dx * dx + dz * dz;
            let t = if len == 0.0 {
                0.0
            } else {
                ((f64::from(o.pos.x - a.x) * dx + f64::from(o.pos.z - a.z) * dz) / len)
                    .clamp(0.0, 1.0)
            };
            let x = f64::from(a.x) + t * dx - f64::from(o.pos.x);
            let z = f64::from(a.z) + t * dz - f64::from(o.pos.z);
            x * x + z * z > f64::from(o.radius).powi(2)
        })
    }
}
