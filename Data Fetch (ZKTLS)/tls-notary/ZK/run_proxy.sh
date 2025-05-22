# Install Rust if not already installed
if ! command -v rustc &> /dev/null; then
  echo "Rust not found, installing Rust..."
  curl https://sh.rustup.rs -sSf | sh
  . "$HOME/.cargo/env"
fi

# Ensure Rust and Cargo are available
if ! command -v cargo &> /dev/null; then
  echo "Cargo not found! Please check your PATH."
  exit 1
fi

# Install the `wstcp` utility if not already installed
if ! command -v wstcp &> /dev/null; then
  echo "Installing wstcp..."
  cargo install wstcp
fi

# Run wstcp with the provided parameters
LOCAL_PORT=55688
REMOTE_URL="openbanking-api-826260723607.europe-west3.run.app:443"

echo "Starting WebSocket Tunnel: 127.0.0.1:$LOCAL_PORT -> $REMOTE_URL"
wstcp --bind-addr 127.0.0.1:$LOCAL_PORT $REMOTE_URL