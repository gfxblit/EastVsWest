#!/bin/bash

# Reset Supabase database script
# This script stops Supabase, deletes all local data, and restarts it to apply all migrations from scratch.

echo "Stopping Supabase and deleting local data..."
npx supabase stop --no-backup

echo "Starting Supabase and applying migrations..."
npx supabase start

echo "Supabase database has been reset."
