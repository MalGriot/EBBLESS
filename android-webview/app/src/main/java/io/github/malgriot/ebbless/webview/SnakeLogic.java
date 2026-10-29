package io.github.malgriot.ebbless.webview;

import java.util.Random;

/** Pure snake rules (no Android imports). Wrap-around walls, no obstacles. */
final class SnakeLogic {
    static final int[] DX = {0, 1, 0, -1};
    static final int[] DY = {-1, 0, 1, 0};

    final int cols, rows;
    final boolean wrap;
    private final int cap;
    private final int[] bx, by;
    private int head;
    int len;
    int dir;              // 0 up, 1 right, 2 down, 3 left
    private final int[] turnQ = new int[2];
    int nq;
    int foodX, foodY, foodType; // type 0 = LP, 1 = cassette
    int score;
    boolean dead;
    private final Random rnd;

    SnakeLogic(int cols, int rows, boolean wrap, long seed) {
        this.cols = cols;
        this.rows = rows;
        this.wrap = wrap;
        this.cap = cols * rows;
        this.bx = new int[cap];
        this.by = new int[cap];
        this.rnd = new Random(seed);
        reset();
    }

    void reset() {
        int cx = cols / 2, cy = rows / 2;
        len = 3;
        head = 2;
        for (int i = 0; i < 3; i++) { bx[i] = cx - 2 + i; by[i] = cy; }
        dir = 1;
        nq = 0;
        score = 0;
        dead = false;
        placeFood();
    }

    /** i = 0 is the head, len-1 the tail tip. */
    int segX(int i) { return bx[(head - i + cap) % cap]; }
    int segY(int i) { return by[(head - i + cap) % cap]; }

    /** +1 = turn right, -1 = turn left. At most 2 turns wait in the queue. */
    boolean queueTurn(int sign) {
        if (nq >= 2) return false;
        turnQ[nq++] = sign > 0 ? 1 : -1;
        return true;
    }

    /** Milliseconds per move: faster as the snake grows. */
    int stepIntervalMs() {
        return Math.max(75, 230 - 7 * (len - 3));
    }

    boolean occupied(int x, int y) {
        for (int i = 0; i < len; i++) if (segX(i) == x && segY(i) == y) return true;
        return false;
    }

    private void placeFood() {
        if (len >= cap) { dead = true; return; }
        for (int tries = 0; tries < 200; tries++) {
            int x = rnd.nextInt(cols), y = rnd.nextInt(rows);
            if (!occupied(x, y)) { foodX = x; foodY = y; foodType = rnd.nextInt(2); return; }
        }
        for (int y = 0; y < rows; y++)
            for (int x = 0; x < cols; x++)
                if (!occupied(x, y)) { foodX = x; foodY = y; foodType = rnd.nextInt(2); return; }
    }

    /** One move. Returns true if food was eaten. */
    boolean step() {
        if (dead) return false;
        if (nq > 0) {
            dir = (dir + turnQ[0] + 4) & 3;
            turnQ[0] = turnQ[1];
            nq--;
        }
        int nx = segX(0) + DX[dir], ny = segY(0) + DY[dir];
        if (wrap) {
            nx = (nx + cols) % cols;
            ny = (ny + rows) % rows;
        } else if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) {
            dead = true;
            return false;
        }
        boolean eat = nx == foodX && ny == foodY;
        int check = eat ? len : len - 1; // tail tip moves away unless we grow
        for (int i = 0; i < check; i++) {
            if (segX(i) == nx && segY(i) == ny) { dead = true; return false; }
        }
        head = (head + 1) % cap;
        bx[head] = nx;
        by[head] = ny;
        if (eat) {
            len++;
            score += 10;
            placeFood();
        }
        return eat;
    }
}
