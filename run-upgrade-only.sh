#!/bin/bash

CONTRACT=contract-8

export MINA_GRAPHQL_ENDPOINT=http://plain-1-graphql.hetzner-pre-mesa-1.gcp.o1test.net/graphql
export MINA_SENDER_KEY=EKFUjoNmXmespB4nE1RCiggiZT27VhMgunK75PsfRUb7AvfTn7Gg

echo "Upgrading $CONTRACT..."
node dist/$CONTRACT/migrate-and-test.js
echo "Done $CONTRACT."
