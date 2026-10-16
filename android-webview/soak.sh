#!/system/bin/sh
# EBBLESS screen-off soak logger: one line every 30s into /sdcard/soak.log
PKG=io.github.malgriot.ebbless
UID_=$(pm list packages -U $PKG | sed 's/.*uid://')
echo "# start $(date '+%Y-%m-%d %H:%M:%S') uid=$UID_" >> /sdcard/soak.log
while :; do
  T=$(date +%H:%M:%S)
  W=$(dumpsys power | grep -m1 -o 'mWakefulness=[A-Za-z]*')
  LV=$(dumpsys battery | grep -m1 'level:' | tr -d ' ')
  AC=$(dumpsys battery | grep -m1 'AC powered' | tr -d ' ')
  US=$(dumpsys battery | grep -m1 'USB powered' | tr -d ' ')
  P=$(pidof $PKG)
  A=$(dumpsys audio | grep -c "u/pid:$UID_/.*state:started")
  F=$(dumpsys activity services $PKG | grep -m1 -o 'isForeground=[a-z]*')
  D=$(dumpsys deviceidle | grep -m1 -o 'mState=[A-Z_]*')
  echo "$T $W $LV $AC $US pid=$P audio=$A $F $D" >> /sdcard/soak.log
  sleep 30
done
