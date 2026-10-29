package io.github.malgriot.ebbless.webview;

import java.util.Random;

/** Pure tetris rules (no Android imports). Well is 10 wide, 20 tall. */
final class TetrisLogic {
    static final int W = 10, H = 20;
    /** Piece order: I O T S Z J L. Cell values in the well are type+1. */
    static final int[][] BASE = {
        {0, 1, 1, 1, 2, 1, 3, 1},
        {0, 0, 1, 0, 0, 1, 1, 1},
        {1, 0, 0, 1, 1, 1, 2, 1},
        {1, 0, 2, 0, 0, 1, 1, 1},
        {0, 0, 1, 0, 1, 1, 2, 1},
        {0, 0, 0, 1, 1, 1, 2, 1},
        {2, 0, 0, 1, 1, 1, 2, 1},
    };
    static final int[] SIZE = {4, 2, 3, 3, 3, 3, 3};
    /** SHAPES[type][rot] = 8 ints: x0,y0,...,x3,y3 */
    static final int[][][] SHAPES = new int[7][4][8];
    private static final int[] LINE_SCORE = {0, 40, 100, 300, 1200};

    static {
        for (int t = 0; t < 7; t++) {
            int n = SIZE[t];
            System.arraycopy(BASE[t], 0, SHAPES[t][0], 0, 8);
            for (int r = 1; r < 4; r++) {
                for (int k = 0; k < 4; k++) {
                    int x = SHAPES[t][r - 1][k * 2], y = SHAPES[t][r - 1][k * 2 + 1];
                    SHAPES[t][r][k * 2] = n - 1 - y;     // rotate clockwise
                    SHAPES[t][r][k * 2 + 1] = x;
                }
            }
        }
    }

    final int[][] well = new int[H][W];
    int type, rot, px, py, nextType;
    int score, lines, level;
    boolean over;
    /** Rows cleared by the most recent lock (for the game's flash). */
    int lastCleared;
    private final Random rnd;
    private final int[] bag = new int[7];
    private int bagPos = 7;

    TetrisLogic(long seed) {
        rnd = new Random(seed);
        reset();
    }

    void reset() {
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) well[y][x] = 0;
        score = 0; lines = 0; level = 0; over = false; lastCleared = 0;
        bagPos = 7;
        nextType = drawBag();
        spawn();
    }

    private int drawBag() {
        if (bagPos >= 7) {
            for (int i = 0; i < 7; i++) bag[i] = i;
            for (int i = 6; i > 0; i--) {
                int j = rnd.nextInt(i + 1);
                int t = bag[i]; bag[i] = bag[j]; bag[j] = t;
            }
            bagPos = 0;
        }
        return bag[bagPos++];
    }

    private void spawn() {
        type = nextType;
        nextType = drawBag();
        rot = 0;
        px = (W - SIZE[type]) / 2;
        py = 0;
        if (!fits(type, rot, px, py)) over = true;
    }

    boolean fits(int t, int r, int x, int y) {
        int[] s = SHAPES[t][r];
        for (int k = 0; k < 4; k++) {
            int cx = x + s[k * 2], cy = y + s[k * 2 + 1];
            if (cx < 0 || cx >= W || cy >= H) return false;
            if (cy >= 0 && well[cy][cx] != 0) return false;
        }
        return true;
    }

    boolean move(int dx) {
        if (over || !fits(type, rot, px + dx, py)) return false;
        px += dx;
        return true;
    }

    /** Rotate clockwise, trying small horizontal kicks. */
    boolean rotateCW() {
        if (over) return false;
        int nr = (rot + 1) & 3;
        int[] kicks = {0, -1, 1, -2, 2};
        for (int i = 0; i < kicks.length; i++) {
            if (fits(type, nr, px + kicks[i], py)) {
                rot = nr;
                px += kicks[i];
                return true;
            }
        }
        return false;
    }

    /** One gravity step. Returns true if the piece moved, false if it locked. */
    boolean stepDown() {
        if (over) return false;
        if (fits(type, rot, px, py + 1)) { py++; return true; }
        lock();
        return false;
    }

    /** Arrows mode DOWN: drop one row (+1 score) or lock if resting. Returns true if the piece moved. */
    boolean softDrop() {
        if (over) return false;
        if (fits(type, rot, px, py + 1)) { py++; score += 1; return true; }
        lock();
        return false;
    }

    /** Arrows mode centre: drop to the floor and lock (+2 score per row). Returns rows dropped. */
    int hardDrop() {
        if (over) return 0;
        int n = 0;
        while (fits(type, rot, px, py + 1)) { py++; n++; }
        score += 2 * n;
        lock();
        return n;
    }

    private void lock() {
        int[] s = SHAPES[type][rot];
        for (int k = 0; k < 4; k++) {
            int cx = px + s[k * 2], cy = py + s[k * 2 + 1];
            if (cy < 0) { over = true; return; }
            well[cy][cx] = type + 1;
        }
        int cleared = 0;
        for (int y = H - 1; y >= 0; ) {
            boolean full = true;
            for (int x = 0; x < W; x++) if (well[y][x] == 0) { full = false; break; }
            if (full) {
                cleared++;
                for (int yy = y; yy > 0; yy--) System.arraycopy(well[yy - 1], 0, well[yy], 0, W);
                for (int x = 0; x < W; x++) well[0][x] = 0;
            } else {
                y--;
            }
        }
        lastCleared = cleared;
        score += LINE_SCORE[cleared] * (level + 1);
        lines += cleared;
        level = lines / 10;
        spawn();
    }

    int gravityMs() {
        return Math.max(90, 800 - level * 70);
    }
}
