package io.github.malgriot.ebbless.webview;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import java.util.List;

/**
 * Match-3 for the iPod player: 8x8 board of coloured LPs, cassettes, the E logo and an album
 * cover. Wheel-only controls:
 *  - nothing selected: wheel moves the cursor cell by cell in reading order (row by row),
 *    Center selects the cell.
 *  - cell selected: wheel cycles through its neighbours, Center swaps with the highlighted one.
 *  - Menu cancels a selection; with nothing selected it pauses; paused or game over it exits.
 * 30 moves per game (only swaps that make a match use a move). Score = cleared tiles x 10 x
 * cascade number. When no move is left the board is reshuffled.
 * Tile types: 0-2 LPs (red, blue, green), 3-4 cassettes, 5 E logo, 6 album cover (covers.get(0)
 * cropped to a rounded square; striped tile when there are no covers).
 */
final class MatchGame implements IpodGame {
    private static final int N = MatchLogic.N, SPRITE = 48, START_MOVES = 30;
    private static final long SWAP_MS = 160, CLEAR_MS = 220, FALL_MS = 260, SHIMMER_MS = 600;
    private static final int IDLE = 0, SWAP = 1, SWAPBACK = 2, CLEAR = 3, FALL = 4, OVER = 5;

    private final SharedPreferences prefs;
    private final MatchLogic logic;
    private final int accent;
    private final Bitmap[] sprites = new Bitmap[MatchLogic.T];
    private final Paint bmp = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint glint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF r = new RectF(), r2 = new RectF();
    private final IpodGameArt.Label scoreLbl = new IpodGameArt.Label("Score ");
    private final IpodGameArt.Label movesLbl = new IpodGameArt.Label("Moves ");
    private final IpodGameArt.Label bestLbl = new IpodGameArt.Label("Best ");
    private final int[] nbr = new int[4];
    private final IpodGameArt.Pops pops = new IpodGameArt.Pops();
    private final IpodGameArt.Label newBestLbl = new IpodGameArt.Label("New best! ");
    private IpodFx fx;
    private int best, score, moves, cascade, bestAtStart, shimmerMs;
    private boolean pbFired, overFired;
    private int phase = IDLE;
    private long phaseT;
    private float clock;
    private int cursor, sel = -1, nbrCount, nbrPos, swapA, swapB, shuffleFlash;
    private boolean paused = true, started, controlsMode;

    MatchGame(Context ctx, int accentColor, Bitmap logo, List<Bitmap> covers) {
        accent = accentColor;
        prefs = ctx.getSharedPreferences("ebb", Context.MODE_PRIVATE);
        best = prefs.getInt("match_best", 0);
        logic = new MatchLogic(System.nanoTime());
        sprites[0] = IpodGameArt.lp(SPRITE, 0xFFE0453A);
        sprites[1] = IpodGameArt.lp(SPRITE, 0xFF3F7BE0);
        sprites[2] = IpodGameArt.lp(SPRITE, 0xFF47C46A);
        sprites[3] = IpodGameArt.cassette(SPRITE, 0xFFF2B630);
        sprites[4] = IpodGameArt.cassette(SPRITE, 0xFFA45CE0);
        sprites[5] = IpodGameArt.logoTile(SPRITE, logo, accentColor);
        Bitmap cv = (covers != null && !covers.isEmpty()) ? covers.get(0) : null;
        sprites[6] = cv != null ? IpodGameArt.cover(SPRITE, cv) : IpodGameArt.stripes(SPRITE, 0xFF2A2F4A, 0xFFE8E0D0);
        text.setTypeface(Typeface.DEFAULT_BOLD);
        stroke.setStyle(Paint.Style.STROKE);
        glint.setStyle(Paint.Style.STROKE);
        glint.setColor(0xB0FFFFFF);
        glint.setStrokeCap(Paint.Cap.ROUND);
        resetBoard();
    }

    private void resetBoard() {
        logic.reshuffle();
        logic.clearFall();
        score = 0; moves = START_MOVES; cascade = 0;
        phase = IDLE; phaseT = 0;
        cursor = 0; sel = -1; nbrCount = 0; shuffleFlash = 0;
        bestAtStart = best; pbFired = false; overFired = false; shimmerMs = 0;
        pops.clear();
    }

    @Override public void setFx(IpodFx fx) { this.fx = fx; }

    private void fx(int tier, String text) {
        if (fx != null) fx.achievement(tier, text);
    }

    private boolean newBest() { return score > 0 && score > bestAtStart; }

    @Override public void start() {
        resetBoard();
        paused = true;
        started = false;
    }

    @Override public void stop() { paused = true; }

    @Override public void update(long dtMs) {
        if (dtMs > 100) dtMs = 100;
        if (dtMs < 0) dtMs = 0;
        clock += dtMs;
        if (shuffleFlash > 0) shuffleFlash = (int) Math.max(0, shuffleFlash - dtMs);
        if (shimmerMs > 0) shimmerMs = (int) Math.max(0, shimmerMs - dtMs);
        pops.update(dtMs);
        if (paused || phase == IDLE || phase == OVER) return;
        phaseT += dtMs;
        switch (phase) {
            case SWAP:
                if (phaseT >= SWAP_MS) {
                    if (logic.findMatches() > 0) {
                        moves--;
                        cascade = 0;
                        beginClear();
                    } else {
                        logic.swap(swapA, swapB);   // illegal move: swap back, no move used
                        phase = SWAPBACK; phaseT = 0;
                    }
                }
                break;
            case SWAPBACK:
                if (phaseT >= SWAP_MS) { phase = IDLE; phaseT = 0; }
                break;
            case CLEAR:
                if (phaseT >= CLEAR_MS) {
                    logic.clearMarked();
                    logic.gravity();
                    phase = FALL; phaseT = 0;
                }
                break;
            case FALL:
                if (phaseT >= FALL_MS) {
                    logic.clearFall();
                    if (logic.findMatches() > 0) beginClear();
                    else endTurn();
                }
                break;
            default:
                break;
        }
    }

    private void beginClear() {
        int n = 0;
        float sr = 0f, sc = 0f;
        for (int i = 0; i < logic.mark.length; i++) {
            if (logic.mark[i]) { n++; sr += i / N; sc += i % N; }
        }
        cascade++;
        int gain = n * 10 * cascade;
        score += gain;
        if (score > best) {
            best = score;
            prefs.edit().putInt("match_best", best).apply();
        }
        pops.add(sc / n + 0.5f, sr / n + 0.5f, gain, 0xFFFFFFFF);
        // achievements (events, not per frame); logic.maxRun is still from the findMatches that led here
        if (logic.maxRun >= 4) fx(1, "Great");
        int tier = MatchLogic.cascadeTier(cascade);
        if (tier == 3) fx(3, "Delicious!");
        else if (tier == 2) fx(2, "Sweet!");
        else if (tier == 1) fx(1, "Combo x" + cascade);
        if (cascade >= 3 || logic.maxRun >= 5) shimmerMs = (int) SHIMMER_MS;
        if (!pbFired && bestAtStart > 0 && score > bestAtStart) {
            pbFired = true;
            fx(2, "New best!");
        }
        phase = CLEAR; phaseT = 0;
    }

    private void endTurn() {
        phaseT = 0;
        if (moves <= 0) {
            phase = OVER;
            if (!overFired) { overFired = true; if (newBest()) fx(3, "New best"); }
            return;
        }
        phase = IDLE;
        if (!logic.hasMove()) {
            logic.reshuffle();
            shuffleFlash = 900;
        }
    }

    private void buildNeighbours() {
        int r0 = sel / N, c0 = sel % N;
        nbrCount = 0;
        if (r0 > 0) nbr[nbrCount++] = sel - N;
        if (c0 < N - 1) nbr[nbrCount++] = sel + 1;
        if (r0 < N - 1) nbr[nbrCount++] = sel + N;
        if (c0 > 0) nbr[nbrCount++] = sel - 1;
        nbrPos = 0;
    }

    @Override public void onRotate(int steps) {
        controlsMode = false;
        if (paused || phase != IDLE) return;
        if (sel < 0) {
            cursor = ((cursor + steps) % (N * N) + N * N) % (N * N);
        } else {
            nbrPos = ((nbrPos + steps) % nbrCount + nbrCount) % nbrCount;
        }
    }

    /**
     * Arrows mode: a direction moves the cursor (clamped); with a cell selected it swaps with that neighbour in one
     * press. Centre then selects, and cancels a selection (see controlsMode, set here, cleared by onRotate).
     */
    @Override public void onDirection(int dir) {
        controlsMode = true;
        if (paused || phase != IDLE) return;
        if (sel < 0) {
            int n = MatchLogic.neighbour(cursor, dir);
            if (n >= 0) cursor = n;
        } else {
            int n = MatchLogic.neighbour(sel, dir);
            if (n < 0) return;
            swapA = sel; swapB = n;
            logic.swap(swapA, swapB);
            cursor = swapB;
            sel = -1; nbrCount = 0;
            phase = SWAP; phaseT = 0;
        }
    }

    @Override public void onCenter() {
        if (phase == OVER) { start(); paused = false; started = true; return; }
        if (paused) { paused = false; started = true; return; }
        if (phase != IDLE) return;
        if (sel < 0) {
            sel = cursor;
            buildNeighbours();
        } else if (controlsMode) {
            sel = -1; nbrCount = 0;
        } else {
            swapA = sel; swapB = nbr[nbrPos];
            logic.swap(swapA, swapB);
            cursor = swapB;
            sel = -1; nbrCount = 0;
            phase = SWAP; phaseT = 0;
        }
    }

    @Override public boolean onMenu() {
        if (phase == OVER) return false;
        if (sel >= 0) { sel = -1; nbrCount = 0; return true; }
        if (paused) return false;
        paused = true;
        return true;
    }

    @Override public String title() { return "Match"; }
    @Override public int score() { return score; }

    @Override public void draw(Canvas c, RectF s) {
        float w = s.width(), h = s.height();
        fill.setColor(0xFF0B0B10);
        c.drawRect(s, fill);
        float header = h * 0.1f;
        float cell = Math.min(w / N, (h - header) / N);
        float gx = s.left + (w - cell * N) / 2f, gy = s.top + header + (h - header - cell * N) / 2f;
        text.setTextSize(header * 0.62f);
        text.setColor(0xFFFFFFFF);
        text.setTextAlign(Paint.Align.LEFT);
        c.drawText(scoreLbl.get(score), s.left + w * 0.03f, s.top + header * 0.78f, text);
        text.setTextAlign(Paint.Align.CENTER);
        text.setColor(accent);
        c.drawText(movesLbl.get(moves), s.centerX(), s.top + header * 0.78f, text);
        text.setTextAlign(Paint.Align.RIGHT);
        text.setColor(0xFF8A8A96);
        c.drawText(bestLbl.get(best), s.right - w * 0.03f, s.top + header * 0.78f, text);

        fill.setColor(0xFF14141C);
        r.set(gx, gy, gx + cell * N, gy + cell * N);
        c.drawRect(r, fill);

        float swapK = phase == SWAP || phase == SWAPBACK ? 1f - Math.min(1f, phaseT / (float) SWAP_MS) : 0f;
        float fallK = phase == FALL ? 1f - Math.min(1f, phaseT / (float) FALL_MS) : 0f;
        float clearK = phase == CLEAR ? Math.min(1f, phaseT / (float) CLEAR_MS) : 0f;
        c.save();
        c.clipRect(gx, gy, gx + cell * N, gy + cell * N);
        for (int i = 0; i < N * N; i++) {
            int t = logic.g[i];
            if (t < 0) continue;
            float x = gx + (i % N) * cell, y = gy + (i / N) * cell;
            if (swapK > 0f) {
                // the tile now at swapA came from swapB (and the other way round)
                if (i == swapA) { x += ((swapB % N) - (swapA % N)) * cell * swapK; y += ((swapB / N) - (swapA / N)) * cell * swapK; }
                else if (i == swapB) { x += ((swapA % N) - (swapB % N)) * cell * swapK; y += ((swapA / N) - (swapB / N)) * cell * swapK; }
            }
            if (fallK > 0f) y -= logic.fall[i] * cell * fallK;
            if (y + cell < gy) continue;   // still above the board
            boolean clearing = clearK > 0f && logic.mark[i];
            float inset = cell * 0.04f;
            if (clearing) {
                // pop: grow for the first 20%, then shrink away
                inset += clearK < 0.2f ? -cell * 0.12f * (clearK / 0.2f)
                        : cell * (-0.12f + 0.62f * ((clearK - 0.2f) / 0.8f));
            }
            r.set(x + inset, y + inset, x + cell - inset, y + cell - inset);
            c.drawBitmap(sprites[t], null, r, bmp);
            if (t < 3 && !clearing) {
                glint.setStrokeWidth(Math.max(1f, cell * 0.06f));
                IpodGameArt.drawLpGlint(c, r, r2, (clock * 0.12f + i * 37f) % 360f, glint);
            }
        }
        // shimmer: a soft light band sweeping across the board after a big combo (alpha only)
        if (shimmerMs > 0) {
            float k = 1f - shimmerMs / (float) SHIMMER_MS, bw = cell * 2f;
            float bx = gx - bw + (cell * N + bw) * k;
            fill.setColor(Color.argb((int) (70 * Math.sin(Math.PI * k)), 255, 255, 255));
            r.set(bx, gy, bx + bw, gy + cell * N);
            c.drawRect(r, fill);
        }
        c.restore();
        pops.draw(c, text, cell * 0.6f, gx, gy, cell, cell * 1.5f);
        // cursor, selection and swap target
        if (!paused && phase == IDLE) {
            stroke.setStrokeWidth(Math.max(2f, cell * 0.07f));
            if (sel < 0) {
                stroke.setColor(accent);
                cellRect(gx, gy, cell, cursor);
                c.drawRoundRect(r, cell * 0.2f, cell * 0.2f, stroke);
            } else {
                fill.setColor(0x40FFFFFF);
                cellRect(gx, gy, cell, sel);
                c.drawRoundRect(r, cell * 0.2f, cell * 0.2f, fill);
                stroke.setColor(accent);
                c.drawRoundRect(r, cell * 0.2f, cell * 0.2f, stroke);
                if (!controlsMode) {
                    stroke.setColor(0xFFFFFFFF);
                    cellRect(gx, gy, cell, nbr[nbrPos]);
                    c.drawRoundRect(r, cell * 0.2f, cell * 0.2f, stroke);
                }
            }
        }
        if (shuffleFlash > 0 && phase != OVER) {
            text.setTextAlign(Paint.Align.CENTER);
            text.setColor(0xFFFFFFFF);
            text.setTextSize(h * 0.08f);
            c.drawText("No moves: reshuffled", s.centerX(), s.centerY(), text);
        }
        if (phase == OVER) {
            if (newBest()) overlay(c, s, "GAME OVER", newBestLbl.get(score), "Center: retry   Menu: exit", 0xFFFFD34D);
            else overlay(c, s, "GAME OVER", scoreLbl.get(score), "Center: retry   Menu: exit", 0xFFFFFFFF);
        } else if (paused) {
            if (started) overlay(c, s, "PAUSED", "Swap tiles to match 3", "Center: resume   Menu: exit", 0xFFFFFFFF);
            else overlay(c, s, "MATCH", "Wheel: move   Center: pick", "Center: start", 0xFFFFFFFF);
        }
    }

    private void cellRect(float gx, float gy, float cell, int i) {
        float x = gx + (i % N) * cell, y = gy + (i / N) * cell;
        r.set(x + cell * 0.04f, y + cell * 0.04f, x + cell * 0.96f, y + cell * 0.96f);
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
