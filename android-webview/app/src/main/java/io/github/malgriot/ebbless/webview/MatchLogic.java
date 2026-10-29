package io.github.malgriot.ebbless.webview;

import java.util.Random;

/** Pure match-3 rules on an 8x8 grid (no Android imports). Index = row * N + col. */
final class MatchLogic {
    static final int N = 8;
    static final int T = 7;   // tile types
    final int[] g = new int[N * N];
    final boolean[] mark = new boolean[N * N];
    /** Rows each cell fell in the last gravity() call (0 = did not move). */
    final int[] fall = new int[N * N];
    /** Longest straight run (3+) found by the most recent findMatches() call, 0 if none. */
    int maxRun;
    private final Random rnd;

    MatchLogic(long seed) {
        rnd = new Random(seed);
        fillNoMatches();
        while (!hasMove()) fillNoMatches();
    }

    void fillNoMatches() {
        for (int r = 0; r < N; r++) {
            for (int c = 0; c < N; c++) {
                int t;
                do {
                    t = rnd.nextInt(T);
                } while ((c >= 2 && g[r * N + c - 1] == t && g[r * N + c - 2] == t)
                        || (r >= 2 && g[(r - 1) * N + c] == t && g[(r - 2) * N + c] == t));
                g[r * N + c] = t;
            }
        }
    }

    /** Achievement tier for the nth clear of one turn: 1 none, 2-3 tier 1, 4-5 tier 2, 6+ tier 3. */
    static int cascadeTier(int cascade) {
        return cascade >= 6 ? 3 : (cascade >= 4 ? 2 : (cascade >= 2 ? 1 : 0));
    }

    boolean areNeighbours(int a, int b) {
        int ar = a / N, ac = a % N, br = b / N, bc = b % N;
        return Math.abs(ar - br) + Math.abs(ac - bc) == 1;
    }

    /** Cell next to idx in direction dir (0 up, 1 right, 2 down, 3 left), or -1 at the board edge. */
    static int neighbour(int idx, int dir) {
        int r = idx / N, c = idx % N;
        switch (dir) {
            case 0: return r > 0 ? idx - N : -1;
            case 1: return c < N - 1 ? idx + 1 : -1;
            case 2: return r < N - 1 ? idx + N : -1;
            default: return c > 0 ? idx - 1 : -1;
        }
    }

    void swap(int a, int b) {
        int t = g[a]; g[a] = g[b]; g[b] = t;
    }

    /** Fills mark[] with every cell in a 3+ run. Returns how many cells are marked. */
    int findMatches() {
        maxRun = 0;
        for (int i = 0; i < mark.length; i++) mark[i] = false;
        for (int r = 0; r < N; r++) {
            int c = 0;
            while (c < N) {
                int v = g[r * N + c], e = c + 1;
                while (e < N && g[r * N + e] == v) e++;
                if (v >= 0 && e - c >= 3) { if (e - c > maxRun) maxRun = e - c; for (int k = c; k < e; k++) mark[r * N + k] = true; }
                c = e;
            }
        }
        for (int c = 0; c < N; c++) {
            int r = 0;
            while (r < N) {
                int v = g[r * N + c], e = r + 1;
                while (e < N && g[e * N + c] == v) e++;
                if (v >= 0 && e - r >= 3) { if (e - r > maxRun) maxRun = e - r; for (int k = r; k < e; k++) mark[k * N + c] = true; }
                r = e;
            }
        }
        int n = 0;
        for (int i = 0; i < mark.length; i++) if (mark[i]) n++;
        return n;
    }

    /** Empties every marked cell (-1) and unmarks. Returns count removed. */
    int clearMarked() {
        int n = 0;
        for (int i = 0; i < mark.length; i++) {
            if (mark[i]) { g[i] = -1; mark[i] = false; n++; }
        }
        return n;
    }

    /** Drops tiles down and fills the top with random types. Sets fall[]. */
    void gravity() {
        for (int c = 0; c < N; c++) {
            int wr = N - 1;
            for (int r = N - 1; r >= 0; r--) {
                int v = g[r * N + c];
                if (v >= 0) {
                    g[wr * N + c] = v;
                    fall[wr * N + c] = wr - r;
                    wr--;
                }
            }
            int k = wr + 1;
            for (int r = wr; r >= 0; r--) {
                g[r * N + c] = rnd.nextInt(T);
                fall[r * N + c] = k;
            }
        }
    }

    void clearFall() {
        for (int i = 0; i < fall.length; i++) fall[i] = 0;
    }

    /** True if any adjacent swap creates a match. Leaves the grid unchanged. */
    boolean hasMove() {
        for (int r = 0; r < N; r++) {
            for (int c = 0; c < N; c++) {
                int a = r * N + c;
                if (c + 1 < N && tryPair(a, a + 1)) return true;
                if (r + 1 < N && tryPair(a, a + N)) return true;
            }
        }
        return false;
    }

    private boolean tryPair(int a, int b) {
        swap(a, b);
        boolean ok = findMatches() > 0;
        for (int i = 0; i < mark.length; i++) mark[i] = false;
        swap(a, b);
        return ok;
    }

    /** New match-free board that has at least one move. */
    void reshuffle() {
        do {
            fillNoMatches();
        } while (!hasMove());
    }
}
