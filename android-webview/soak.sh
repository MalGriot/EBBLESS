#!/system/bin/sh
# EBBLESS screen-off soak logger: one line every 30s into /sdcard/soak.log
# (memory columns: MemAvailable MB; every 10th line also app/renderer PSS MB; wd = watchdog process id)
PKG=io.github.malgriot.ebbless
UID_=$(pm list packages -U | grep "package:$PKG " | sed 's/.*uid://')
echo "# start $(date '+%Y-%m-%d %H:%M:%S') uid=$UID_" >> /sdcard/soak.log
N=0
while :; do
  T=$(date +%H:%M:%S)
  W=$(dumpsys power | grep -m1 -o 'mWakefulness=[A-Za-z]*')
  LV=$(dumpsys battery | grep -m1 'level:' | tr -d ' ')
  AC=$(dumpsys battery | grep -m1 'AC powered' | tr -d ' ')
  US=$(dumpsys battery | grep -m1 'USB powered' | tr -d ' ')
  P=$(pidof $PKG)
  WD=$(pidof $PKG:watchdog)
  A=$(dumpsys audio | grep -c "u/pid:$UID_/.*state:started")
  F=$(dumpsys activity services $PKG | grep -m1 -o 'isForeground=[a-z]*')
  D=$(dumpsys deviceidle | grep -m1 -o 'mState=[A-Z_]*')
  MA=$(grep MemAvailable /proc/meminfo | awk '{print int($2/1024)}')
  X=""
  N=$((N+1))
  if [ $((N % 10)) = 1 ]; then
    APP=$(dumpsys meminfo $PKG 2>/dev/null | grep -m1 'TOTAL PSS' | awk '{print int($3/1024)}')
    REN=0
    for p in $(ps -A -o PID,NAME | grep sandboxed_process0 | awk '{print $1}'); do
      v=$(dumpsys meminfo $p 2>/dev/null | grep -m1 'TOTAL PSS' | awk '{print int($3/1024)}')
      [ "${v:-0}" -gt "$REN" ] && REN=$v
    done
    X="app=${APP}MB renderer=${REN}MB"
  fi
  echo "$T $W $LV $AC $US pid=$P wd=$WD audio=$A $F $D avail=${MA}MB $X" >> /sdcard/soak.log
  sleep 30
done
