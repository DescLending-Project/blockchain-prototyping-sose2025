#!/bin/bash

echo "Copying contract artifacts from backend to frontend..."

# Run the Node.js script
node scripts/copy-artifacts.js

# Check if the script was successful
if [ $? -eq 0 ]; then
    echo "Artifacts copied successfully!"
else
    echo "Failed to copy artifacts"
    exit 1
fi 