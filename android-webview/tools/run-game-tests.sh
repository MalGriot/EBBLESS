#!/bin/sh
# Compiles the pure-Java game logic plus tests with plain javac and runs them.
set -e
cd "$(dirname "$0")/.."
SRC=app/src/main/java/io/github/malgriot/ebbless/webview
OUT=$(mktemp -d)
javac -d "$OUT" $SRC/SnakeLogic.java $SRC/TetrisLogic.java $SRC/MatchLogic.java tools/GameLogicTests.java
java -cp "$OUT" io.github.malgriot.ebbless.webview.GameLogicTests
# #755 interruption policy (pause on calls, other apps' audio, headphone disconnect)
javac -d "$OUT" $SRC/InterruptPolicy.java tools/InterruptPolicyTests.java
java -cp "$OUT" io.github.malgriot.ebbless.webview.InterruptPolicyTests
