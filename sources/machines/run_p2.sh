#!/bin/bash
# Tripo P2 (through AssetHub) for each machine concept, in parallel; logs and downloads per machine
cd "$(dirname "$0")"
for m in volt nova oracle gecko lune wolf; do
  ( assethub mesh generate --file ../concepts/machines/machine_${m}_A.png --model-id meshGen.tripo_p2_preview \
      --name "HYPERLANE ${m}" --wait --download --out-dir p2_${m} > p2_${m}.log 2>&1; echo "exit $?" >> p2_${m}.log ) &
done
wait
echo ALL DONE
