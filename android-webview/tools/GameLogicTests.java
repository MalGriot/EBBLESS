package io.github.malgriot.ebbless.webview;

/** Plain-Java checks for the iPod game logic. Run: android-webview/tools/run-game-tests.sh */
public class GameLogicTests {
    static int checks = 0;

    static void ok(boolean cond, String msg) {
        checks++;
        if (!cond) { System.err.println("FAIL: " + msg); System.exit(1); }
    }

    public static void main(String[] a) {
        snake();
        tetris();
        match();
        System.out.println("OK " + checks + " checks");
    }

    static void snake() {
        SnakeLogic s = new SnakeLogic(16, 12, true, 1);
        ok(s.len == 3 && s.dir == 1 && !s.dead, "snake start");
        int hx = s.segX(0);
        s.foodX = 0; s.foodY = 0;
        s.step();
        ok(s.segX(0) == hx + 1 && s.len == 3, "snake moves right");
        ok(s.queueTurn(1) && s.queueTurn(1) && !s.queueTurn(1), "turn queue capped at 2");
        s.step();
        ok(s.dir == 2, "first queued turn right -> down");
        s.step();
        ok(s.dir == 3, "second queued turn right -> left");
        // wrap
        SnakeLogic w = new SnakeLogic(16, 12, true, 2);
        w.foodX = 0; w.foodY = 0;
        for (int i = 0; i < 16; i++) { w.foodX = 0; w.foodY = 0; w.step(); if (w.dead) break; }
        ok(!w.dead, "wrap: no wall death");
        // walls kill when wrap off
        SnakeLogic k = new SnakeLogic(8, 6, false, 3);
        k.foodX = 0; k.foodY = 0;
        for (int i = 0; i < 10; i++) k.step();
        ok(k.dead, "no-wrap: wall kills");
        // eating
        SnakeLogic e = new SnakeLogic(16, 12, true, 4);
        e.foodX = e.segX(0) + 1; e.foodY = e.segY(0);
        ok(e.step() && e.len == 4 && e.score == 10, "eat grows and scores");
        ok(!e.occupied(e.foodX, e.foodY), "food not placed on snake");
        ok(e.stepIntervalMs() < new SnakeLogic(16, 12, true, 4).stepIntervalMs(), "speed rises with length");
        // self collision: grow to 5 then turn into body
        SnakeLogic c = new SnakeLogic(16, 12, true, 5);
        for (int i = 0; i < 2; i++) { c.foodX = c.segX(0) + 1; c.foodY = c.segY(0); c.step(); }
        c.foodX = 0; c.foodY = 0;
        c.queueTurn(1); c.step();
        c.queueTurn(1); c.step();
        c.queueTurn(1); c.step();
        ok(c.dead, "self collision kills");
    }

    static void tetris() {
        for (int t = 0; t < 7; t++) for (int r = 0; r < 4; r++) {
            int[] s = TetrisLogic.SHAPES[t][r];
            for (int i = 0; i < 4; i++) {
                ok(s[i * 2] >= 0 && s[i * 2] < TetrisLogic.SIZE[t] && s[i * 2 + 1] >= 0 && s[i * 2 + 1] < TetrisLogic.SIZE[t], "shape in box");
                for (int j = i + 1; j < 4; j++) ok(s[i * 2] != s[j * 2] || s[i * 2 + 1] != s[j * 2 + 1], "cells distinct");
            }
        }
        TetrisLogic a = new TetrisLogic(7), b = new TetrisLogic(7);
        ok(a.type == b.type && a.nextType == b.nextType, "seeded determinism");
        ok(!a.over && a.fits(a.type, 0, a.px, a.py), "spawn fits");
        for (int i = 0; i < 20; i++) a.move(-1);
        ok(!a.move(-1), "cannot move through left wall");
        for (int i = 0; i < 20; i++) a.move(1);
        ok(!a.move(1), "cannot move through right wall");
        // rotate against wall (kick)
        TetrisLogic r = new TetrisLogic(7);
        r.type = 0; r.rot = 1; r.px = -2; r.py = 0;       // vertical I with x=1 inside the well
        ok(r.rotateCW() && r.fits(r.type, r.rot, r.px, r.py), "rotate with wall kick");
        // gravity locks and spawns
        TetrisLogic g = new TetrisLogic(9);
        int first = g.type;
        int steps = 0;
        while (g.stepDown()) steps++;
        ok(steps > 10 && g.nextType >= 0 && !g.over, "piece falls to floor then locks");
        boolean any = false;
        for (int x = 0; x < 10; x++) if (g.well[19][x] == first + 1) any = true;
        ok(any, "locked piece in bottom row");
        // line clear: fill bottom row except the I piece slot
        TetrisLogic l = new TetrisLogic(11);
        for (int x = 0; x < 10; x++) if (x < 4 || x > 7) l.well[19][x] = 3;
        l.type = 0; l.rot = 0; l.px = 4; l.py = 0;       // horizontal I at row py+1
        while (l.stepDown()) { }
        ok(l.lines == 1 && l.score == 40, "single line clear scores 40");
        for (int x = 0; x < 10; x++) ok(l.well[19][x] == 0, "cleared row emptied");
        // game over
        TetrisLogic o = new TetrisLogic(12);
        for (int y = 2; y < 20; y++) for (int x = 1; x < 10; x++) o.well[y][x] = 1;
        o.type = 1; o.py = 0; o.px = 4;
        o.stepDown();
        ok(!o.stepDown() && o.over, "stacked to the top ends the game");
        ok(new TetrisLogic(1).gravityMs() > 0, "gravity positive");
        TetrisLogic lv = new TetrisLogic(1); lv.level = 5;
        ok(lv.gravityMs() < new TetrisLogic(1).gravityMs(), "gravity speeds up with level");
    }

    static void match() {
        MatchLogic m = new MatchLogic(42);
        ok(m.findMatches() == 0, "initial board has no matches");
        ok(m.hasMove(), "initial board has a move");
        // manual row match
        for (int i = 0; i < 64; i++) m.g[i] = (i / 8 + i % 8 * 2) % 7;   // pattern with no runs
        ok(m.findMatches() == 0, "pattern board clean");
        m.g[8] = 3; m.g[9] = 3; m.g[10] = 3;
        ok(m.findMatches() == 3 && m.mark[8] && m.mark[10], "row of 3 detected");
        // L shape counts both
        m.g[18] = 3; m.g[26] = 3;
        ok(m.findMatches() == 5, "L shape marks 5 cells");
        // clear + gravity
        int cleared = m.clearMarked();
        ok(cleared == 5, "cleared 5");
        m.gravity();
        for (int i = 0; i < 64; i++) ok(m.g[i] >= 0 && m.g[i] < MatchLogic.T, "no holes after gravity");
        boolean moved = false;
        for (int i = 0; i < 64; i++) if (m.fall[i] > 0) moved = true;
        ok(moved, "gravity reports falling cells");
        m.clearFall();
        // swap detection
        MatchLogic s = new MatchLogic(5);
        for (int i = 0; i < 64; i++) s.g[i] = (i / 8 + i % 8 * 2) % 7;
        s.g[0] = 5; s.g[1] = 5; s.g[2] = 0; s.g[10] = 5;   // swapping 2 and 10 gives row of three 5s
        ok(s.findMatches() == 0, "setup clean");
        s.swap(2, 10);
        ok(s.findMatches() >= 3, "swap creates match");
        ok(s.areNeighbours(2, 10) && !s.areNeighbours(2, 11), "neighbours");
        // cascade loop always terminates, board always full and valid
        MatchLogic c = new MatchLogic(99);
        for (int round = 0; round < 200; round++) {
            c.reshuffle();
            ok(c.findMatches() == 0 && c.hasMove(), "reshuffle valid");
            int guard = 0;
            c.swap(round % 7, round % 7 + 1);
            while (c.findMatches() > 0 && guard++ < 100) { c.clearMarked(); c.gravity(); }
            ok(guard < 100, "cascade terminates");
            for (int i = 0; i < 64; i++) ok(c.g[i] >= 0, "board full");
        }
    }
}
