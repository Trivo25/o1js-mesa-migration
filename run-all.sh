#!/bin/bash
set -e

export MINA_GRAPHQL_ENDPOINT=http://plain-1-graphql.hetzner-pre-mesa-1.gcp.o1test.net/graphql
export MINA_SENDER_KEY=EKEWK63Fk87N5FxHX9p9fU3oxL9QU9eTesXSCQoi2uFqwfCZfvNh

for i in 1 2 3 4 5 6 6b 7 8; do
  CONTRACT=contract-$i
  echo "=== Deploying $CONTRACT ==="
  node dist/$CONTRACT/deploy.js

  echo "=== Testing pre-HF $CONTRACT ==="
  node dist/$CONTRACT/test-pre-hf.js

  echo "=== Done $CONTRACT - pre-HF test completed ==="
done

echo "All contracts completed successfully."
