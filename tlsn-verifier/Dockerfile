FROM rust:1.78 as builder

WORKDIR /usr/src/app
COPY . .
RUN cargo build --release

FROM debian:buster-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/src/app/target/release/rust-microservice /usr/local/bin/app
COPY .env .env

CMD ["app"]
