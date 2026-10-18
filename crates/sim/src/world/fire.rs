//! Finite, server-owned echoes. Copies cannot recursively cast or generate resources.
use super::*;
impl World {
    pub(super) fn echo_finisher(
        &mut self,
        source: u32,
        recipient: u32,
        ability_id: &str,
        ability: &Ability,
    ) {
        let Some(sun) = self.players[&source]
            .view
            .sun
            .clone()
            .filter(|sun| sun.ends > self.tick && sun.charges > 0)
        else {
            return;
        };
        let center = self.players[&recipient].view.pos;
        let energy = self.players[&source].private.energy;
        let earned = self.players[&source].energy_earned;
        for effect in &ability.effects {
            let (amount, targets) = match effect {
                Effect::Damage { amount } => (*amount, vec![recipient]),
                Effect::Splash { amount, radius } => {
                    (*amount, self.enemies_in_area(source, center, *radius))
                }
                _ => continue,
            };
            for target in targets {
                let before = self.players[&target].view.health + self.players[&target].view.shield;
                self.damage(source, target, amount * i32::from(sun.percent) / 100);
                let after = self.players[&target].view.health + self.players[&target].view.shield;
                self.emit(source, Some(target), ability_id, "echo", before - after);
            }
        }
        let player = self.players.get_mut(&source).unwrap();
        player.private.energy = energy;
        player.energy_earned = earned;
        player.view.sun = (sun.charges > 1).then_some(SunView {
            charges: sun.charges - 1,
            ..sun
        });
    }
}
