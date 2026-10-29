package io.github.malgriot.ebbless.webview;

import android.graphics.Canvas;
import android.graphics.RectF;

interface IpodGame {
    void start();
    void stop();
    void update(long dtMs);
    void draw(Canvas c, RectF screen);
    void onRotate(int steps);
    void onCenter();
    boolean onMenu();
    String title();
    int score();
}
