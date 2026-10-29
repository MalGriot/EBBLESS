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
 * Snake for the iPod player. The E logo is the head and eats spinning LPs and cassettes.
 * Walls WRAP (no obstacles). Wheel: clockwise = turn right, counter-clockwise = turn left
 * (one wheel step = one 90 degree turn, at most 2 queued). Center = start / pause / resume /
 * restart after game over. Menu = pause while playing, exit from pause or game over.
 */
final class SnakeGame implements IpodGame {
    private static final int COLS = 16, ROWS = 12, SPRITE = 48, CHOMP_MS = 180;

    private final SharedPreferences prefs;
    private final SnakeLogic logic;
    private final int accent;
    private final Bitmap head, lp, cassette;
    private final Paint bmp = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint glint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF r = new RectF(), r2 = new RectF();
    private final IpodGameArt.Label scoreLbl = new IpodGameArt.Label("Score ");
    private final IpodGameArt.Label bestLbl = new IpodGameArt.Label("Best ");
    private final IpodGameArt.Pops pops = new IpodGameArt.Pops();
    private final IpodGameArt.Label newBestLbl = new IpodGameArt.Label("New best! ");
    private IpodFx fx;
    private int best, bestAtStart, chompMs;
    private boolean pbFired, overFired;
    private int baseR, baseG, baseB;
    private long acc;
    private float clock;
    private boolean paused = true, started;

    SnakeGame(Context ctx, int accentColor, Bitmap logo) {
        accent = accentColor;
        prefs = ctx.getSharedPreferences("ebb", Context.MODE_PRIVATE);
        best = prefs.getInt("snake_best", 0);
        logic = new SnakeLogic(COLS, ROWS, true, System.nanoTime());
        head = IpodGameArt.logoPlain(SPRITE, logo, accentColor);
        lp = IpodGameArt.lp(SPRITE, accentColor);
        cassette = IpodGameArt.cassette(SPRITE, 0xFFC2453A);
        baseR = Color.red(accent); baseG = Color.green(accent); baseB = Color.blue(accent);
        text.setTypeface(Typeface.DEFAULT_BOLD);
        glint.setStyle(Paint.Style.STROKE);
        glint.setColor(0xCCFFFFFF);
        glint.setStrokeCap(Paint.Cap.ROUND);
    }

    @Override public void setFx(IpodFx fx) { this.fx = fx; }

    private void fx(int tier, String text) {
        if (fx != null) fx.achievement(tier, text);
    }

    @Override public void start() {
        logic.reset();
        bestAtStart = best;
        pbFired = false; overFired = false; chompMs = 0;
        pops.clear();
        acc = 0;
        paused = true;
        started = false;
    }

    @Override public void stop() { paused = true; }

    @Override public void update(long dtMs) {
        if (dtMs > 100) dtMs = 100;
        if (dtMs < 0) dtMs = 0;
        clock += dtMs;
        if (chompMs > 0) chompMs = (int) Math.max(0, chompMs - dtMs);
        pops.update(dtMs);
        if (paused || logic.dead) return;
        acc += dtMs;
        int iv = logic.stepIntervalMs();
        while (acc >= iv && !logic.dead) {
            acc -= iv;
            if (logic.step()) onEat();
        }
        if (logic.score > best) {
            best = logic.score;
            prefs.edit().putInt("snake_best", best).apply();
        }
        if (logic.dead && !overFired) {
            overFired = true;
            if (newBest()) fx(3, "New best");
        }
    }

    private boolean newBest() { return logic.score > 0 && logic.score > bestAtStart; }

    // Runs once per snack, never per frame.
    private void onEat() {
        chompMs = CHOMP_MS;
        pops.add(logic.segX(0) + 0.5f, logic.segY(0) + 0.3f, 10, 0xFFFFFFFF);
        int tier = SnakeLogic.snackTier(logic.snacks);
        if (tier > 0) fx(tier, "x" + logic.snacks);
        if (!pbFired && bestAtStart > 0 && logic.score > bestAtStart) {
            pbFired = true;
            fx(2, "New best!");
        }
        if (logic.len == SnakeLogic.LENGTH_MILESTONE) fx(3, "Length " + logic.len);
    }

    @Override public void onRotate(int steps) {
        if (paused || logic.dead) return;
        int n = Math.min(Math.abs(steps), 2);
        for (int i = 0; i < n; i++) logic.queueTurn(steps > 0 ? 1 : -1);
    }

    /** Arrows mode: absolute heading; a direct reversal into the neck is ignored. */
    @Override public void onDirection(int dir) {
        if (paused || logic.dead) return;
        logic.setHeading(dir);
    }

    @Override public void onCenter() {
        if (logic.dead) { start(); paused = false; started = true; return; }
        paused = !paused;
        started = true;
    }

    @Override public boolean onMenu() {
        if (logic.dead || paused) return false;
        paused = true;
        return true;
    }

    @Override public String title() { return "Ssswell"; }
    @Override public int score() { return logic.score; }

    @Override public void draw(Canvas c, RectF s) {
        float w = s.width(), h = s.height();
        fill.setColor(0xFF0B0B10);
        c.drawRect(s, fill);
        float header = h * 0.11f;
        float cell = Math.min(w / COLS, (h - header) / ROWS);
        float gx = s.left + (w - cell * COLS) / 2f, gy = s.top + header + (h - header - cell * ROWS) / 2f;
        // field
        fill.setColor(0xFF14141C);
        r.set(gx, gy, gx + cell * COLS, gy + cell * ROWS);
        c.drawRect(r, fill);
        // header
        text.setTextSize(header * 0.62f);
        text.setColor(0xFFFFFFFF);
        text.setTextAlign(Paint.Align.LEFT);
        c.drawText(scoreLbl.get(logic.score), s.left + w * 0.03f, s.top + header * 0.75f, text);
        text.setColor(0xFF8A8A96);
        text.setTextAlign(Paint.Align.RIGHT);
        c.drawText(bestLbl.get(best), s.right - w * 0.03f, s.top + header * 0.75f, text);
        // food
        float fx = gx + logic.foodX * cell, fy = gy + logic.foodY * cell;
        r.set(fx + cell * 0.05f, fy + cell * 0.05f, fx + cell * 0.95f, fy + cell * 0.95f);
        if (logic.foodType == 0) {
            c.drawBitmap(lp, null, r, bmp);
            glint.setStrokeWidth(Math.max(1f, cell * 0.08f));
            IpodGameArt.drawLpGlint(c, r, r2, (clock * 0.36f) % 360f, glint);
        } else {
            c.drawBitmap(cassette, null, r, bmp);
        }
        // body, fading toward the tail
        int len = logic.len;
        for (int i = len - 1; i >= 1; i--) {
            float t = 1f - (i / (float) len) * 0.6f;
            fill.setColor(Color.argb((int) (255 * t), baseR, baseG, baseB));
            float x = gx + logic.segX(i) * cell, y = gy + logic.segY(i) * cell;
            r.set(x + cell * 0.12f, y + cell * 0.12f, x + cell * 0.88f, y + cell * 0.88f);
            c.drawRoundRect(r, cell * 0.25f, cell * 0.25f, fill);
        }
        // head
        float hx = gx + logic.segX(0) * cell, hy = gy + logic.segY(0) * cell;
        float pulse = 1f;
        if (chompMs > 0) {
            float k = 1f - chompMs / (float) CHOMP_MS;
            pulse = 1f + 0.35f * 4f * k * (1f - k);
        }
        float half = cell * 0.55f * pulse;
        r.set(hx + cell * 0.5f - half, hy + cell * 0.5f - half, hx + cell * 0.5f + half, hy + cell * 0.5f + half);
        c.drawBitmap(head, null, r, bmp);
        pops.draw(c, text, cell * 0.7f, gx, gy, cell, cell * 1.2f);

        if (logic.dead) {
            if (newBest()) overlay(c, s, "GAME OVER", newBestLbl.get(logic.score), "Center: retry   Menu: exit", 0xFFFFD34D);
            else overlay(c, s, "GAME OVER", scoreLbl.get(logic.score), "Center: retry   Menu: exit", 0xFFFFFFFF);
        } else if (paused) {
            if (started) overlay(c, s, "PAUSED", "Turn the wheel to steer", "Center: resume   Menu: exit", 0xFFFFFFFF);
            else overlay(c, s, "SNAKE", "Turn the wheel to steer", "Center: start", 0xFFFFFFFF);
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
