use super::*;

fn duel() -> World {
    let mut w = World::new(Content::load().unwrap());
    w.add(1, "briarwarden", 0, 0).unwrap();
    w.add(2, "ashweaver", 1, 1).unwrap();
    for _ in 0..61 {
        w.step();
    }
    assert_eq!(w.phase, Phase::Active);
    w
}
fn advance(w: &mut World, ticks: u32) {
    for _ in 0..ticks {
        w.step();
    }
}
fn close(w: &mut World) {
    w.players.get_mut(&1).unwrap().view.pos = Pos { x: 4000, z: 0 };
}

#[test]
fn analog_steering_is_bounded_and_facing_never_grants_movement() {
    let mut w = duel();
    let start = w.players[&1].view.pos;
    assert_eq!(w.steer(1, 1, 1000, 1000, 0), Err("invalid_movement"));
    assert_eq!(
        w.steer(1, 1, i16::MIN, i16::MAX, 0),
        Err("invalid_movement")
    );
    assert_eq!(w.steer(1, 1, 0, 0, 6284), Err("invalid_movement"));
    w.steer(1, 1, 600, 800, 927).unwrap();
    w.step();
    assert_eq!(
        w.players[&1].view.pos,
        Pos {
            x: start.x + 150,
            z: start.z + 200
        }
    );
    assert_eq!(w.players[&1].view.facing, 927);
    let pos = w.players[&1].view.pos;
    w.steer(1, 2, 0, 0, 2000).unwrap();
    w.step();
    assert_eq!(w.players[&1].view.pos, pos);
    assert_eq!(w.players[&1].view.facing, 2000);
    w.players.get_mut(&1).unwrap().view.root_until = w.tick + 10;
    w.steer(1, 3, 1000, 0, 3000).unwrap();
    w.step();
    assert_eq!(w.players[&1].view.pos, pos);
    assert_eq!(w.players[&1].view.facing, 3000);
    assert_eq!(w.steer(1, 3, 0, 0, 0), Err("stale_input"));
}

#[test]
fn range_target_resources_and_gcd_are_authoritative() {
    let mut w = duel();
    assert_eq!(w.cast(1, 0, Some(2), None), Err("out_of_range"));
    assert_eq!(w.cast(2, 0, Some(2), None), Err("invalid_target"));
    assert_eq!(w.cast(2, 9, Some(1), None), Err("invalid_slot"));
    close(&mut w);
    w.cast(1, 0, Some(2), None).unwrap();
    assert_eq!(w.players[&2].view.health, 1155);
    assert_eq!(w.cast(1, 0, Some(2), None), Err("global_cooldown"));
    w.players.get_mut(&1).unwrap().private.gcd_until = 0;
    assert_eq!(w.cast(1, 0, Some(2), None), Err("cooldown"));
    advance(&mut w, 20);
    w.players.get_mut(&1).unwrap().private.resource = 0;
    assert_eq!(w.cast(1, 0, Some(2), None), Err("resource"));
}
#[test]
fn interrupt_cancels_and_locks_school_without_refund() {
    let mut w = duel();
    close(&mut w);
    w.cast(2, 0, Some(1), None).unwrap();
    w.cast(1, 3, Some(2), None).unwrap();
    assert!(w.players[&2].cast.is_none());
    assert_eq!(w.players[&2].private.resource, 92);
    advance(&mut w, 29);
    assert_eq!(w.players[&1].view.health, 1500);
    assert_eq!(w.cast(2, 0, Some(1), None), Err("school_locked"));
    advance(&mut w, 31);
    w.cast(2, 0, Some(1), None).unwrap();
}
#[test]
fn cast_completion_rechecks_range_and_los_and_movement_cancels() {
    let mut w = duel();
    w.cast(2, 0, Some(1), None).unwrap();
    w.players.get_mut(&1).unwrap().view.pos.x = -13000;
    advance(&mut w, 28);
    assert_eq!(w.players[&1].view.health, 1500);
    w.players.get_mut(&1).unwrap().view.pos = Pos { x: 0, z: -7000 };
    w.players.get_mut(&2).unwrap().view.pos = Pos { x: 0, z: -2000 };
    assert_eq!(w.cast(2, 0, Some(1), None), Err("line_of_sight"));
    w.players.get_mut(&1).unwrap().view.pos = Pos { x: 1000, z: 0 };
    w.players.get_mut(&2).unwrap().view.pos = Pos { x: 5000, z: 0 };
    w.cast(2, 0, Some(1), None).unwrap();
    w.input(2, 1, 1, 0).unwrap();
    w.step();
    assert!(w.players[&2].cast.is_none());
}
#[test]
fn ground_has_no_precast_warning_and_pulses_only_after_completion() {
    let mut w = duel();
    let point = w.players[&1].view.pos;
    w.cast(2, 4, None, Some(point)).unwrap();
    assert!(w.snapshot(1).areas.is_empty());
    let encoded = serde_json::to_string(&w.snapshot(1)).unwrap();
    assert!(!encoded.contains("point"));
    advance(&mut w, 29);
    assert_eq!(w.players[&1].view.health, 1500);
    w.step();
    assert_eq!(w.players[&1].view.health, 1435);
    advance(&mut w, 80);
    assert_eq!(w.players[&1].view.health, 1240);
    assert!(w.snapshot(1).areas.is_empty());
    assert_eq!(
        w.cast(2, 4, None, Some(Pos { x: i32::MAX, z: 0 })),
        Err("cooldown")
    );
}
#[test]
fn forms_are_content_driven_and_keep_gcd_and_expire() {
    let mut w = duel();
    assert_eq!(w.ultimate(1, None, Some(2)), Err("energy"));
    w.players.get_mut(&1).unwrap().private.energy = 100;
    w.players.get_mut(&1).unwrap().private.gcd_until = w.tick + 10;
    w.ultimate(1, None, Some(2)).unwrap();
    assert_eq!(w.players[&1].view.form, "verdant_crown");
    assert_eq!(w.cast(1, 0, Some(2), None), Err("global_cooldown"));
    advance(&mut w, 240);
    assert_eq!(w.players[&1].view.form, "warden");
    w.players.get_mut(&2).unwrap().private.energy = 100;
    w.ultimate(2, None, Some(1)).unwrap();
    assert_eq!(w.players[&2].view.form, "solar_ascendant");
}
#[test]
fn shield_roots_and_input_validation() {
    let mut w = duel();
    close(&mut w);
    w.cast(2, 2, None, None).unwrap();
    w.cast(1, 0, Some(2), None).unwrap();
    assert_eq!(w.players[&2].view.health, 1250);
    assert_eq!(w.players[&2].view.shield, 125);
    assert_eq!(w.input(1, 1, 2, 0), Err("invalid_movement"));
    w.input(1, 1, 1, 0).unwrap();
    assert_eq!(w.input(1, 1, 1, 0), Err("stale_input"));
    w.players.get_mut(&1).unwrap().view.root_until = w.tick + 10;
    let pos = w.players[&1].view.pos;
    w.step();
    assert_eq!(w.players[&1].view.pos, pos);
    advance(&mut w, 120);
    assert_eq!(w.players[&2].view.shield, 0);
}
#[test]
fn lifecycle_disconnect_and_recipient_privacy() {
    let mut w = duel();
    close(&mut w);
    w.connected(2, false);
    w.cast(1, 0, Some(2), None).unwrap();
    let health = w.players[&2].view.health;
    w.connected(2, true);
    assert_eq!(w.players[&2].view.health, health);
    assert!(w.snapshot(1).players[1].private.is_none());
    w.players.get_mut(&2).unwrap().view.health = 1;
    advance(&mut w, 20);
    w.cast(1, 0, Some(2), None).unwrap();
    w.step();
    assert_eq!(w.phase, Phase::Finished);
    assert_eq!(w.snapshot(1).winner, Some(1));
    assert_eq!(w.cast(2, 0, Some(1), None), Err("round_not_active"));
    advance(&mut w, 160);
    assert_eq!(w.phase, Phase::Active);
    assert_eq!(w.players[&2].view.health, 1250);
}
#[test]
fn identical_tick_commands_reproduce_exact_snapshots() {
    let mut a = duel();
    let mut b = duel();
    for seq in 1..100 {
        for w in [&mut a, &mut b] {
            w.input(1, seq, 1, 1).unwrap();
            if seq % 30 == 0 {
                let _ = w.cast(2, 0, Some(1), None);
            }
            w.step();
        }
        assert_eq!(
            serde_json::to_value(a.snapshot(1)).unwrap(),
            serde_json::to_value(b.snapshot(1)).unwrap()
        );
    }
}
#[test]
fn content_and_collision_contracts() {
    let mut c = Content::load().unwrap();
    c.forms.get_mut("warden").unwrap().abilities[0] = "missing".into();
    assert!(c.validate().is_err());
    let arena = Content::load().unwrap().arena;
    let mut pos = Pos { x: -2000, z: 4700 };
    for _ in 0..100 {
        pos = arena.move_step(pos, 1, 0, STEP);
    }
    assert!(pos.x < -1500);
    assert!(arena.walkable(pos));
}

#[test]
fn ability_flags_cannot_replace_a_pending_cast_or_define_incoherent_builders() {
    let mut content = Content::load().unwrap();
    content.abilities.get_mut("cinder_dart").unwrap().off_gcd = true;
    assert!(content.validate().is_err());
    let mut content = Content::load().unwrap();
    content.abilities.get_mut("cinder_dart").unwrap().cast = 0;
    assert!(content.validate().is_err());
    let mut content = Content::load().unwrap();
    content.abilities.get_mut("cinder_dart").unwrap().ember_cost = 4;
    assert!(content.validate().is_err());
}

#[test]
fn bounded_movement_cannot_speed_up_and_reconnect_acknowledges_discarded_inputs() {
    let mut w = duel();
    let start = w.players[&1].view.pos;
    for seq in 1..30 {
        w.input(1, seq, 1, 0).unwrap();
    }
    assert_eq!(w.players[&1].inputs.len(), 5);
    w.step();
    assert_eq!(w.players[&1].view.pos.x, start.x + STEP);
    w.connected(1, false);
    w.connected(1, true);
    assert_eq!(w.players[&1].private.ack, 29);
    w.input(1, 30, 0, 0).unwrap();
    advance(&mut w, 20);
    assert_eq!(w.players[&1].view.pos.x, start.x + STEP);
}

#[test]
fn ground_coordinate_bounds_are_rejected_without_overflow() {
    let mut w = duel();
    assert_eq!(
        w.cast(
            2,
            4,
            None,
            Some(Pos {
                x: i32::MIN,
                z: i32::MAX
            })
        ),
        Err("invalid_ground")
    );
    let mut content = Content::load().unwrap();
    content.arena.spawns[0].x = i32::MIN;
    assert!(content.validate().is_err());
}

#[test]
fn additional_forms_use_the_same_validated_activation_and_expiry_path() {
    let mut w = duel();
    let mut alternate = w.content.forms["verdant_crown"].clone();
    alternate.name = "Test alternate".into();
    alternate.duration = 10;
    w.content.forms.insert("alternate".into(), alternate);
    w.content
        .classes
        .get_mut("briarwarden")
        .unwrap()
        .ultimate_forms
        .push("alternate".into());
    w.content.validate().unwrap();
    w.players.get_mut(&1).unwrap().private.energy = 100;
    assert_eq!(
        w.ultimate(1, Some("solar_ascendant"), Some(2)),
        Err("invalid_form")
    );
    assert_eq!(w.players[&1].private.energy, 100);
    w.ultimate(1, Some("alternate"), Some(2)).unwrap();
    assert_eq!(w.players[&1].view.form, "alternate");
    advance(&mut w, 10);
    assert_eq!(w.players[&1].view.form, "warden");
}

#[test]
fn allies_are_excluded_from_enemy_targets_and_area_damage() {
    let mut w = duel();
    w.add(3, "ashweaver", 0, 1).unwrap();
    let point = w.players[&1].view.pos;
    assert_eq!(w.cast(2, 0, Some(3), None), Err("invalid_target"));
    w.cast(2, 4, None, Some(point)).unwrap();
    advance(&mut w, 31);
    assert_eq!(w.players[&1].view.health, 1435);
    assert_eq!(w.players[&3].view.health, 1250);
}

fn ctf() -> World {
    let mut w = World::configured(Content::load().unwrap(), "ctf_6", false).unwrap();
    w.rules.config.team_size = 1;
    w.rules.view.team_size = 1;
    w.add(1, "briarwarden", 0, 0).unwrap();
    w.add(2, "ashweaver", 1, 1).unwrap();
    advance(&mut w, 61);
    assert_eq!(w.phase, Phase::Active);
    w
}
#[test]
fn ctf_pickup_capture_requires_own_flag_and_dropped_flags_return() {
    let mut w = ctf();
    let home = w.rules.view.flags[0].home;
    let enemy = w.rules.view.flags[1].home;
    w.players.get_mut(&1).unwrap().view.pos = enemy;
    w.step();
    assert_eq!(w.rules.view.flags[1].carrier, Some(1));
    w.players.get_mut(&2).unwrap().view.pos = home;
    w.step();
    w.players.get_mut(&1).unwrap().view.pos = home;
    w.step();
    assert_eq!(w.rules.view.scores, [0, 0]);
    w.connected(2, false);
    assert!(w.rules.view.flags[0].dropped_until > w.tick);
    w.step();
    assert_eq!(w.rules.view.scores, [1, 0]);
    assert_eq!(w.rules.view.stats[&1].returns, 1);
    assert_eq!(w.rules.view.flags[1].carrier, None);
}
#[test]
fn ctf_death_drops_flag_respawns_and_does_not_end_match() {
    let mut w = ctf();
    w.players.get_mut(&1).unwrap().view.pos = w.rules.view.flags[1].home;
    w.step();
    w.damage(2, 1, 9999);
    assert_eq!(w.rules.view.flags[1].carrier, None);
    assert!(w.rules.view.flags[1].dropped_until > w.tick);
    assert_eq!(w.rules.view.stats[&2].kills, 1);
    assert_eq!(w.rules.view.stats[&1].deaths, 1);
    advance(&mut w, 159);
    assert_eq!(w.players[&1].view.health, 0);
    assert_eq!(w.phase, Phase::Active);
    w.step();
    assert_eq!(w.players[&1].view.health, 1500);
    assert_eq!(w.players[&1].view.pos, w.rules.view.flags[0].home);
}
#[test]
fn ctf_recovery_auto_return_capture_limit_and_final_results() {
    let mut w = ctf();
    let enemy = w.rules.view.flags[1].home;
    let home = w.rules.view.flags[0].home;
    w.players.get_mut(&1).unwrap().view.pos = enemy;
    w.step();
    w.connected(1, false);
    w.players.get_mut(&2).unwrap().view.pos = Pos { x: 0, z: -12000 };
    assert!(w.rules.view.flags[1].dropped_until > w.tick);
    advance(&mut w, 300);
    assert_eq!(w.rules.view.flags[1].pos, enemy);
    assert_eq!(w.rules.view.flags[1].dropped_until, 0);
    w.connected(1, true);
    for _ in 0..3 {
        w.players.get_mut(&1).unwrap().view.pos = enemy;
        w.step();
        w.players.get_mut(&1).unwrap().view.pos = home;
        w.step();
    }
    assert_eq!(w.phase, Phase::Finished);
    assert_eq!(w.rules.view.winner_team, Some(0));
    assert_eq!(w.rules.view.reason, "capture_limit");
    advance(&mut w, 200);
    assert_eq!(w.phase, Phase::Finished);
}
#[test]
fn arena_ends_on_team_elimination_instead_of_any_death() {
    let mut w = World::configured(Content::load().unwrap(), "arena_2", false).unwrap();
    for id in 1..=4 {
        w.add(
            id,
            "briarwarden",
            ((id - 1) % 2) as usize,
            ((id - 1) % 2) as u8,
        )
        .unwrap();
    }
    advance(&mut w, 61);
    w.damage(1, 2, 9999);
    w.step();
    assert_eq!(w.phase, Phase::Active);
    w.damage(1, 4, 9999);
    w.step();
    assert_eq!(w.phase, Phase::Finished);
    assert_eq!(w.rules.view.winner_team, Some(0));
}
#[test]
fn both_teams_absent_draw_and_departed_players_remain_in_results() {
    let mut w = ctf();
    w.connected(1, false);
    w.connected(2, false);
    advance(&mut w, 601);
    assert_eq!(w.rules.view.reason, "forfeit");
    assert_eq!(w.rules.view.winner_team, None);
    w.remove(1);
    assert_eq!(w.rules.view.stats[&1].class_id, "briarwarden");
    assert_eq!(w.rules.view.stats[&1].team, 0);
}
#[test]
fn time_limits_draw_and_forfeit_outcomes_are_explicit() {
    let mut w = ctf();
    w.rules.view.ends_at = w.tick + 1;
    w.step();
    assert_eq!(w.rules.view.winner_team, None);
    assert_eq!(w.rules.view.reason, "time_limit");
    let mut w = ctf();
    w.rules.view.scores = vec![1, 2];
    w.rules.view.ends_at = w.tick + 1;
    w.step();
    assert_eq!(w.rules.view.winner_team, Some(1));
    let mut w = ctf();
    w.connected(2, false);
    advance(&mut w, 601);
    assert_eq!(w.rules.view.reason, "forfeit");
    assert_eq!(w.rules.view.winner_team, Some(0));
}
#[test]
fn root_diminishing_returns_and_mobility_are_server_owned() {
    let mut w = duel();
    close(&mut w);
    let root = w.content.abilities["snare"].clone();
    for expected in [40, 20, 10, 0] {
        w.players.get_mut(&2).unwrap().view.root_until = 0;
        w.resolve(1, "snare", &root, Some(2), None);
        assert_eq!(w.players[&2].view.root_until - w.tick, expected);
    }
    assert_eq!(w.mobility(2, Some(1)), Ok(()));
    assert_eq!(w.mobility(2, Some(1)), Err("mobility_cooldown"));
    let mut w = duel();
    let before = w.players[&1].view.pos.distance_sq(w.players[&2].view.pos);
    w.mobility(1, Some(2)).unwrap();
    assert!(w.players[&1].view.pos.distance_sq(w.players[&2].view.pos) < before);
}
