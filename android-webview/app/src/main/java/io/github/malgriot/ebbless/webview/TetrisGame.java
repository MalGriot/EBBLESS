package io.github.malgriot.ebbless.webview;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;

/**
 * Tetris for the iPod player. Pieces are built from E-logo tiles in one colour per piece.
 * Wheel: clockwise = piece right, counter-clockwise = piece left (one step = one column, so a
 * fast flick moves several). Center = rotate clockwise (resume if paused, restart after game
 * over). Menu = pause while playing, exit when already paused or on the game-over screen.
 * There is no soft drop (the wheel cannot hold a direction); gravity speeds up per level.
 */
final class TetrisGame implements IpodGame {
    private static final int TILE = 40, FLASH_MS = 120;
    private static final int[] COLORS = {
        0xFF35C3E8, 0xFFF2C230, 0xFFA45CE0, 0xFF4CC46A, 0xFFE84A4A, 0xFF3F6FE0, 0xFFF08A2E
    };

    private final SharedPreferences prefs;
    private final TetrisLogic logic;
    private final int accent;
    private final Bitmap[] tiles = new Bitmap[7];
    private final Paint bmp = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF r = new RectF();
    private final IpodGameArt.Label scoreLbl = new IpodGameArt.Label("");
    private final IpodGameArt.Label linesLbl = new IpodGameArt.Label("");
    private final IpodGameArt.Label levelLbl = new IpodGameArt.Label("");
    private final IpodGameArt.Pops pops = new IpodGameArt.Pops();
    private final IpodGameArt.Label newBestLbl = new IpodGameArt.Label("New best! ");
    private final int[] flashRows = new int[4];
    private IpodFx fx;
    private int best, bestAtStart, seenLock, flashCount, flashMs;
    private boolean pbFired, overFired;
    private long acc;
    private boolean paused = true, started, controlsMode;

    TetrisGame(Context ctx, int accentColor, Bitmap logo) {
        accent = accentColor;
        prefs = ctx.getSharedPreferences("ebb", Context.MODE_PRIVATE);
        best = prefs.getInt("tetris_best", 0);
        logic = new TetrisLogic(System.nanoTime());
        for (int i = 0; i < 7; i++) tiles[i] = IpodGameArt.logoTile(TILE, logo, COLORS[i]);
        text.setTypeface(Typeface.DEFAULT_BOLD);
    }

    @Override public void setFx(IpodFx fx) { this.fx = fx; }

    private void fx(int tier, String text) {
        if (fx != null) fx.achievement(tier, text);
    }

    @Override public void start() {
        logic.reset();
        bestAtStart = best;
        seenLock = logic.lockSeq;
        pbFired = false; overFired = false; flashCount = 0; flashMs = 0;
        pops.clear();
        acc = 0;
        paused = true;
        started = false;
    }

    @Override public void stop() { paused = true; }

    @Override public void update(long dtMs) {
        if (dtMs > 100) dtMs = 100;
        if (dtMs < 0) dtMs = 0;
        if (flashMs > 0) flashMs = (int) Math.max(0, flashMs - dtMs);
        pops.update(dtMs);
        if (paused || logic.over) return;
        acc += dtMs;
        int iv = logic.gravityMs();
        while (acc >= iv && !logic.over) {
            acc -= iv;
            logic.stepDown();
            checkLock();
        }
        checkLock();
        if (logic.score > best) {
            best = logic.score;
            prefs.edit().putInt("tetris_best", best).apply();
        }
        if (!pbFired && bestAtStart > 0 && logic.score > bestAtStart) {
            pbFired = true;
            fx(2, "New best!");
        }
        if (logic.over && !overFired) {
            overFired = true;
            if (newBest()) fx(3, "New best");
        }
    }

    private boolean newBest() { return logic.score > 0 && logic.score > bestAtStart; }

    /** Reacts to a piece locking (gravity, soft drop or hard drop): flash, pop and achievements. Cheap when nothing locked. */
    private void checkLock() {
        if (logic.lockSeq == seenLock) return;
        seenLock = logic.lockSeq;
        int n = logic.lastCleared;
        if (n == 0) return;
        flashCount = n;
        float mid = 0f;
        for (int i = 0; i < n; i++) { flashRows[i] = logic.lastClearRows[i]; mid += flashRows[i] + 0.5f; }
        flashMs = FLASH_MS;
        pops.add(TetrisLogic.W / 2f, mid / n, logic.lastLineScore, 0xFFFFFFFF);
        int tier = TetrisLogic.clearTier(n);
        if (n == 2) fx(tier, "Double");
        else if (n == 3) fx(tier, "Triple");
        else if (n == 4) fx(tier, "EBBTRIS!");
        if (logic.lastB2B) fx(3, "Back to back");
        if (logic.lastLevelUp) fx(2, "Level " + (logic.level + 1));
    }

    /**
     * Arrows mode: left/right move one column, up rotates clockwise, down drops one row (+1 score, locks when
     * resting). The game gets no mode flag, so the first onDirection switches centre to hard drop; onRotate (the
     * wheel) switches it back to rotate.
     */
    @Override public void onDirection(int dir) {
        controlsMode = true;
        if (paused || logic.over) return;
        if (dir == DIR_LEFT) logic.move(-1);
        else if (dir == DIR_RIGHT) logic.move(1);
        else if (dir == DIR_UP) logic.rotateCW();
        else if (!logic.softDrop()) { acc = 0; checkLock(); }
    }

    @Override public void onRotate(int steps) {
        controlsMode = false;
        if (paused || logic.over) return;
        int dir = steps > 0 ? 1 : -1;
        int n = Math.min(Math.abs(steps), 4);
        for (int i = 0; i < n; i++) logic.move(dir);
    }

    @Override public void onCenter() {
        if (logic.over) { start(); paused = false; started = true; return; }
        if (paused) { paused = false; started = true; return; }
        if (controlsMode) { logic.hardDrop(); acc = 0; checkLock(); }
        else logic.rotateCW();
    }

    @Override public boolean onMenu() {
        if (logic.over || paused) return false;
        paused = true;
        return true;
    }

    @Override public String title() { return "Ebbtris"; }
    @Override public int score() { return logic.score; }

    private void tile(Canvas c, int type, float x, float y, float cell) {
        r.set(x, y, x + cell, y + cell);
        c.drawBitmap(tiles[type], null, r, bmp);
    }

    @Override public void draw(Canvas c, RectF s) {
        float w = s.width(), h = s.height();
        fill.setColor(0xFF0B0B10);
        c.drawRect(s, fill);
        float pad = h * 0.03f;
        float panelCells = 5.2f;
        float cell = Math.min((h - 2 * pad) / TetrisLogic.H, (w - 2 * pad) / (TetrisLogic.W + panelCells + 0.4f));
        float wellW = cell * TetrisLogic.W, wellH = cell * TetrisLogic.H;
        float totalW = wellW + cell * (panelCells + 0.4f);
        float x0 = s.left + (w - totalW) / 2f, y0 = s.top + (h - wellH) / 2f;
        // well
        fill.setColor(0xFF14141C);
        r.set(x0, y0, x0 + wellW, y0 + wellH);
        c.drawRect(r, fill);
        for (int y = 0; y < TetrisLogic.H; y++) {
            for (int x = 0; x < TetrisLogic.W; x++) {
                int v = logic.well[y][x];
                if (v != 0) tile(c, v - 1, x0 + x * cell, y0 + y * cell, cell);
            }
        }
        // falling piece
        if (!logic.over) {
            int[] sh = TetrisLogic.SHAPES[logic.type][logic.rot];
            for (int k = 0; k < 4; k++) {
                int cy = logic.py + sh[k * 2 + 1];
                if (cy >= 0) tile(c, logic.type, x0 + (logic.px + sh[k * 2]) * cell, y0 + cy * cell, cell);
            }
        }
        // clear flash: white sweep over the cleared rows (alpha only), then score pops
        if (flashMs > 0) {
            fill.setColor(Color.argb((int) (220 * flashMs / (float) FLASH_MS), 255, 255, 255));
            for (int i = 0; i < flashCount; i++) {
                r.set(x0, y0 + flashRows[i] * cell, x0 + wellW, y0 + (flashRows[i] + 1) * cell);
                c.drawRect(r, fill);
            }
        }
        pops.draw(c, text, cell * 0.9f, x0, y0, cell, cell * 2f);
        // side panel
        float px = x0 + wellW + cell * 0.5f, pw = cell * (panelCells - 0.1f);
        float ts = cell * 0.62f;
        text.setTextAlign(Paint.Align.LEFT);
        text.setTextSize(ts);
        text.setColor(0xFF8A8A96);
        c.drawText("NEXT", px, y0 + ts, text);
        int[] nx = TetrisLogic.SHAPES[logic.nextType][0];
        float pc = cell * 0.8f, ox = px + (pw - pc * 4) / 2f, oy = y0 + ts * 1.6f;
        for (int k = 0; k < 4; k++) tile(c, logic.nextType, ox + nx[k * 2] * pc, oy + (nx[k * 2 + 1] + 0.3f) * pc, pc);
        float ly = y0 + ts * 1.6f + pc * 3.2f;
        text.setColor(0xFF8A8A96);
        c.drawText("SCORE", px, ly, text);
        text.setColor(0xFFFFFFFF);
        c.drawText(scoreLbl.get(logic.score), px, ly + ts * 1.15f, text);
        text.setColor(0xFF8A8A96);
        c.drawText("LINES", px, ly + ts * 2.5f, text);
        text.setColor(0xFFFFFFFF);
        c.drawText(linesLbl.get(logic.lines), px, ly + ts * 3.65f, text);
        text.setColor(0xFF8A8A96);
        c.drawText("LEVEL", px, ly + ts * 5f, text);
        text.setColor(accent);
        c.drawText(levelLbl.get(logic.level + 1), px, ly + ts * 6.15f, text);

        if (logic.over) {
            if (newBest()) overlay(c, s, "GAME OVER", newBestLbl.get(logic.score), "Center: retry   Menu: exit", 0xFFFFD34D);
            else overlay(c, s, "GAME OVER", scoreLbl.get(logic.score), "Center: retry   Menu: exit", 0xFFFFFFFF);
        } else if (paused) {
            if (started) overlay(c, s, "PAUSED", "Wheel: move   Center: rotate", "Center: resume   Menu: exit", 0xFFFFFFFF);
            else overlay(c, s, "EBBTRIS", "Wheel: move   Center: rotate", "Center: start", 0xFFFFFFFF);
        }
    }

    // Only runs on overlay screens (paused/game over), not during play.
    private void overlay(Canvas c, RectF s, String a, String b, String d, int bColor) {
        fill.setColor(0xB0000000);
        c.drawRect(s, fill);
        float cx = s.centerX(), cy = s.centerY(), h = s.height();
        text.setTextAlign(Paint.Align.CENTER);
        text.setColor(accent);
        text.setTextSize(h * 0.12f);
        c.drawText(a, cx, cy - h * 0.06f, text);
        text.setColor(bColor);
        text.setTextSize(h * 0.065f);
        c.drawText(b, cx, cy + h * 0.04f, text);
        text.setColor(0xFFB0B0BC);
        c.drawText(d, cx, cy + h * 0.14f, text);
    }
}
