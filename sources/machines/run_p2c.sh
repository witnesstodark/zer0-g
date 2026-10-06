#!/bin/bash
# Tripo P2 (through AssetHub) for the twelve new machines (round 5: a machine for every pilot)
cd "$(dirname "$0")"
for m in ${MACHINES:-comet oni spark empress static kraken hammer terror viper parade tophat}; do
  ( assethub mesh generate --file ../concepts/machines/machine_${m}_A.jpg --model-id meshGen.tripo_p2_preview \
      --name "ZER0-G ${m}" --wait --download --out-dir p2_${m} > p2_${m}.log 2>&1; echo "exit $?" >> p2_${m}.log ) &
done
wait
echo ALL DONE
