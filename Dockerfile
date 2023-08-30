FROM rust:alpine3.18 as builder
WORKDIR /app
RUN apk add musl-dev

COPY . .

# target for alpine linux
RUN cargo install --path . --target=x86_64-unknown-linux-musl

# second stage
FROM alpine:3.18
WORKDIR /app

# copy over binary from first stage and example config from local source dir
COPY --from=builder /usr/local/cargo/bin/fork-observer /usr/local/bin/
COPY config.toml.example config.toml

# Run binary, can be overridden if used as image base
CMD /usr/local/bin/fork-observer
