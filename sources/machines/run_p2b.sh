#!/bin/bash
cd "$(dirname "$0")"
for m in oracle gecko lune wolf; do
  ( assethub mesh generate --file ../concepts/machines/machine_${m}_A.jpg --model-id meshGen.tripo_p2_preview \
      --name "HYPERLANE ${m}" --wait --download --out-dir p2_${m} > p2_${m}.log 2>&1; echo "exit $?" >> p2_${m}.log ) &
done
wait
echo ALL DONE
