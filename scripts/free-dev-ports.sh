#!/bin/sh
# Stop leftover dev servers so npm run dev can bind 8000 and 5173.
for port in 8000 5173 5174; do
  pids=$(lsof -ti:"$port" 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "Freeing port $port..."
    kill -9 $pids 2>/dev/null || true
  fi
done
sleep 0.3
